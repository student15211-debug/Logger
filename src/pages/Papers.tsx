import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, ChevronDown, ChevronRight, FilterX, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db, defaultPrefs, updatePrefs } from '../db'
import { bestFull, dateLabel, fmtPct, latestAttempt, norm, paperStatus, paperTitle, pct, subjectTitle } from '../lib/logic'
import type { Attempt, Paper, Subject } from '../types'
import { Button, Empty, Input, PageHead, Pill, Select } from '../components/ui'
import './papers.css'

type Row = { paper: Paper; subject: Subject; attempts: Attempt[]; questionCount: number; latest?: Attempt; best?: Attempt; status: 'Full' | 'Partial' }
const sorters: Record<string, (a: Row, b: Row) => number> = {
  recent: (a, b) => (b.latest?.attemptedAt || '').localeCompare(a.latest?.attemptedAt || ''),
  oldest: (a, b) => (a.latest?.attemptedAt || '').localeCompare(b.latest?.attemptedAt || ''),
  yearDesc: (a, b) => b.paper.year - a.paper.year,
  yearAsc: (a, b) => a.paper.year - b.paper.year,
  subject: (a, b) => subjectTitle(a.subject).localeCompare(subjectTitle(b.subject)),
  best: (a, b) => (pct(b.best?.score || 0, b.best?.maxMarks || 0) ?? -1) - (pct(a.best?.score || 0, a.best?.maxMarks || 0) ?? -1),
  attempts: (a, b) => b.attempts.length - a.attempts.length
}
function PaperRow({ row }: { row: Row }) {
  const { paper: p, subject: s, attempts, latest, best, questionCount, status } = row
  return <Link to={`/papers/${p.id}`} className="paper-row">
    <div className="paper-row-main"><div className="paper-subject">{s.name}<span className="level">{s.level}</span></div><div className="paper-meta">{paperTitle(p)}</div></div>
    <div className="paper-row-score"><Pill tone={status === 'Full' ? 'green' : 'amber'}>{status}</Pill><div className="score-detail">{best ? <><b className="num">{best.score} / {best.maxMarks}</b><span className="muted num">Best full · {fmtPct(best.score!, best.maxMarks!)}</span></> : <><b>{questionCount} questions</b><span className="muted">logged across attempts</span></>}</div></div>
    <div className="paper-row-activity"><b>{attempts.length} {attempts.length === 1 ? 'attempt' : 'attempts'}</b><span className="muted">Last {dateLabel(latest?.attemptedAt, true)}</span></div>
    <ArrowRight size={16} className="row-arrow"/>
  </Link>
}
export default function Papers() {
  const data = useLiveQuery(async () => {
    const attempts = await db.attempts.toArray()
    const attemptPaper = new Map(attempts.map(a => [a.id, a.paperId]))
    const questionCounts: Record<string, number> = {}
    await db.questionAttempts.each(q => {
      const paperId = attemptPaper.get(q.attemptId)
      if (paperId) questionCounts[paperId] = (questionCounts[paperId] || 0) + 1
    })
    return { subjects: await db.subjects.toArray(), papers: await db.papers.toArray(), attempts, questionCounts, prefs: await db.preferences.get('main') || defaultPrefs }
  }, [])
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const setFilter = (key: string, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(1) }
  const clear = () => { setSearch(''); setFilters({}); setPage(1) }
  const rows = useMemo(() => {
    if (!data) return []
    const subjectMap = new Map(data.subjects.map(s => [s.id, s]))
    const attempts = new Map<string, Attempt[]>()
    for (const a of data.attempts) attempts.set(a.paperId, [...attempts.get(a.paperId) || [], a])
    return data.papers.flatMap(p => {
      const s = subjectMap.get(p.subjectId), a = attempts.get(p.id) || []
      if (!s || !a.length) return []
      return [{ paper: p, subject: s, attempts: a, questionCount: data.questionCounts[p.id] || 0, latest: latestAttempt(a), best: bestFull(a), status: paperStatus(a) as 'Full' | 'Partial' }]
    })
  }, [data])
  const options = (key: keyof Paper | 'level' | 'subjectId') => {
    if (!data) return []
    return [...new Set(rows.map(r => key === 'level' ? r.subject.level : key === 'subjectId' ? r.subject.id : String(r.paper[key] || '')).filter(Boolean))].sort((a, b) => key === 'year' ? Number(b) - Number(a) : a.localeCompare(b))
  }
  const visible = useMemo(() => rows.filter(r => {
    const p = r.paper, s = r.subject
    const text = norm([s.name, s.shortName, s.level, p.year, p.session, p.paperType, p.variant, p.timezone].filter(Boolean).join(' '))
    const terms = norm(search).split(' ').filter(Boolean)
    return terms.every(term => text.includes(term)) &&
      (!filters.subjectId || p.subjectId === filters.subjectId) && (!filters.level || s.level === filters.level) &&
      (!filters.year || String(p.year) === filters.year) && (!filters.session || p.session === filters.session) &&
      (!filters.paperType || p.paperType === filters.paperType) && (!filters.variant || p.variant === filters.variant) &&
      (!filters.timezone || p.timezone === filters.timezone) && (!filters.status || r.status === filters.status) &&
      (!filters.count || (filters.count === 'multiple' ? r.attempts.length > 1 : r.attempts.length === 1))
  }).sort((a, b) => (sorters[data?.prefs.browseSort || 'recent'] || sorters.recent)(a, b) || subjectTitle(a.subject).localeCompare(subjectTitle(b.subject)) || b.paper.year - a.paper.year), [rows, filters, search, data?.prefs.browseSort])
  const displayRows = visible.slice(0, page * 80)
  const groups = useMemo(() => {
    const result = new Map<string, Row[]>()
    for (const r of displayRows) {
      const key = r.subject.id
      result.set(key, [...result.get(key) || [], r])
    }
    return [...result.entries()].map(([id, items]) => ({ id, subject: items[0].subject, items })).sort((a, b) => subjectTitle(a.subject).localeCompare(subjectTitle(b.subject)))
  }, [displayRows])
  if (!data) return <div className="muted">Loading library…</div>
  const active = Object.values(filters).filter(Boolean).length + (search ? 1 : 0)
  return <>
    <PageHead eyebrow="YOUR LIBRARY" title="Past Papers" detail={`${rows.length} ${rows.length === 1 ? 'paper' : 'papers'} · ${data.attempts.length} ${data.attempts.length === 1 ? 'attempt' : 'attempts'}`} action={<Link to="/log"><Button><Plus size={16}/> Log Attempt</Button></Link>}/>
    {!rows.length ? <Empty title="No past papers logged yet." detail="Your paper library will grow as you log attempts." action={<Link to="/log"><Button>Log your first attempt</Button></Link>}/> : <>
      <div className="library-toolbar panel">
        <div className="search-wrap"><Search size={18}/><Input aria-label="Search papers" placeholder="Search subject, year, paper type, timezone…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}/></div>
        <div className="filter-grid">
          <Select aria-label="Filter subject" value={filters.subjectId || ''} onChange={e => setFilter('subjectId', e.target.value)}><option value="">All subjects</option>{options('subjectId').map(id => <option key={id} value={id}>{subjectTitle(data.subjects.find(s => s.id === id))}</option>)}</Select>
          {([['level', 'All levels'], ['year', 'All years'], ['session', 'All sessions'], ['paperType', 'All paper types'], ['variant', 'All variants'], ['timezone', 'All timezones'], ['status', 'Any status']] as const).map(([key, label]) => <Select key={key} aria-label={`Filter ${key}`} value={filters[key] || ''} onChange={e => setFilter(key, e.target.value)}><option value="">{label}</option>{(key === 'status' ? ['Full', 'Partial'] : options(key)).map(v => <option key={v} value={v}>{v}</option>)}</Select>)}
          <Select aria-label="Filter attempt count" value={filters.count || ''} onChange={e => setFilter('count', e.target.value)}><option value="">Any attempts</option><option value="one">One attempt</option><option value="multiple">Multiple attempts</option></Select>
        </div>
        <div className="toolbar-bottom"><div className="filter-actions"><span className="small muted">{visible.length} showing</span>{active > 0 && <button onClick={clear} className="clear-filters"><FilterX size={14}/> Clear filters ({active})</button>}</div><div className="flex items-center gap-2"><span className="small muted">View</span><Select aria-label="Group papers" value={data.prefs.browseGroup} onChange={e => updatePrefs({ browseGroup: e.target.value as 'subject' | 'flat' })}><option value="subject">By subject</option><option value="flat">All papers</option></Select><span className="small muted ml-3">Sort</span><Select aria-label="Sort papers" value={data.prefs.browseSort} onChange={e => updatePrefs({ browseSort: e.target.value })}><option value="recent">Recently attempted</option><option value="oldest">Oldest attempted</option><option value="yearDesc">Year: newest first</option><option value="yearAsc">Year: oldest first</option><option value="subject">Subject A–Z</option><option value="best">Best full score</option><option value="attempts">Most attempts</option></Select></div></div>
      </div>
      {!visible.length ? <Empty title="No papers match these filters." detail="Try a different search or clear the filters." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}/> :
      data.prefs.browseGroup === 'subject' ? <div className="library-groups">{groups.map(group => <section key={group.id} className="library-group"><button className="group-title" onClick={() => setCollapsed(v => v.includes(group.id) ? v.filter(x => x !== group.id) : [...v, group.id])}>{collapsed.includes(group.id) ? <ChevronRight size={17}/> : <ChevronDown size={17}/>}<span>{subjectTitle(group.subject)}</span><span className="group-count">{group.items.length} {group.items.length === 1 ? 'paper' : 'papers'}</span></button>{!collapsed.includes(group.id) && <div className="paper-list">{group.items.map(r => <PaperRow key={r.paper.id} row={r}/>)}</div>}</section>)}</div> :
      <div className="paper-list">{displayRows.map(r => <PaperRow key={r.paper.id} row={r}/>)}</div>}
      {visible.length > page * 80 && <div className="text-center mt-5"><Button variant="secondary" onClick={() => setPage(p => p + 1)}>Show more papers</Button></div>}
    </>}
  </>
}
