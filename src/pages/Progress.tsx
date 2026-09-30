import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { pct, weighted } from '../lib/logic'
import { Button, Empty, PageHead, Select, Stat } from '../components/ui'
import './progress.css'

export default function Progress() {
  const data = useLiveQuery(async () => ({ subjects: await db.subjects.toArray(), papers: await db.papers.toArray(), attempts: await db.attempts.toArray(), questionCount: await db.questionAttempts.count() }), [])
  const [subjectId, setSubjectId] = useState('')
  const stats = useMemo(() => {
    if (!data) return null
    const paperMap = new Map(data.papers.map(p => [p.id, p]))
    const full = data.attempts.filter(a => a.type === 'FULL')
    const trend = full.filter(a => !subjectId || paperMap.get(a.paperId)?.subjectId === subjectId)
      .sort((a, b) => a.attemptedAt.localeCompare(b.attemptedAt) || a.createdAt.localeCompare(b.createdAt))
      .map((a, i) => ({ date: a.attemptedAt, label: `${a.attemptedAt.slice(5)} · ${i + 1}`, score: Number(pct(a.score!, a.maxMarks!)?.toFixed(1)) }))
    const comparison = data.subjects.map(s => {
      const rows = full.filter(a => paperMap.get(a.paperId)?.subjectId === s.id)
      const average = weighted(rows.map(a => ({ score: a.score!, maxMarks: a.maxMarks! })))
      return { name: s.shortName || s.name, average: average === null ? 0 : Number(average.toFixed(1)), count: rows.length }
    }).filter(s => s.count).sort((a, b) => b.average - a.average)
    const avg = weighted(full.map(a => ({ score: a.score!, maxMarks: a.maxMarks! })))
    return { full, trend, comparison, avg }
  }, [data, subjectId])
  if (!data || !stats) return <div className="muted">Loading progress…</div>
  return <>
    <PageHead eyebrow="PERFORMANCE" title="Progress" detail="Simple, honest measures of the work you've logged."/>
    <div className="stats-grid six"><Stat label="Unique papers" value={data.papers.length}/><Stat label="Total attempts" value={data.attempts.length}/><Stat label="Full-paper attempts" value={stats.full.length}/><Stat label="Partial attempts" value={data.attempts.length - stats.full.length}/><Stat label="Questions logged" value={data.questionCount}/><Stat label="Full-paper average" value={stats.avg === null ? '—' : `${stats.avg.toFixed(1)}%`} detail="Weighted by available marks"/></div>
    {!data.attempts.length ? <div className="mt-7"><Empty title="No progress to show yet" detail="Log an attempt to start building your history." action={<Link to="/log"><Button>Log Attempt</Button></Link>}/></div> : <div className="progress-grid">
      <section className="panel panel-pad"><div className="section-head"><div><h2>Full-paper score trend</h2><p>Each point is one complete paper attempt.</p></div><Select aria-label="Choose subject for trend" className="trend-select" value={subjectId} onChange={e => setSubjectId(e.target.value)}><option value="">All subjects</option>{data.subjects.map(s => <option key={s.id} value={s.id}>{s.name} {s.level}</option>)}</Select></div>{stats.trend.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={stats.trend} margin={{ top: 12, right: 10, bottom: 0, left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="#dce5dc" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 10, fill: '#7b8b7e' }} minTickGap={22}/><YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#7b8b7e' }} tickFormatter={v => `${v}%`}/><Tooltip formatter={(v) => [`${v}%`, 'Full-paper score']} labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}/><Line type="monotone" dataKey="score" stroke="#398260" strokeWidth={2.5} dot={{ r: 3, fill: '#398260' }} activeDot={{ r: 5 }}/></LineChart></ResponsiveContainer></div> : <div className="chart-empty">No full-paper attempts for this selection.</div>}</section>
      <section className="panel panel-pad"><div className="section-head"><div><h2>Subject comparison</h2><p>Weighted full-paper marks only.</p></div></div>{stats.comparison.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats.comparison} layout="vertical" margin={{ top: 10, right: 15, bottom: 0, left: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="#dce5dc" horizontal={false}/><XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#7b8b7e' }}/><YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 10, fill: '#7b8b7e' }}/><Tooltip formatter={(v) => [`${v}%`, 'Weighted average']}/><Bar dataKey="average" fill="#78a98b" radius={[0, 3, 3, 0]} barSize={17}/></BarChart></ResponsiveContainer></div> : <div className="chart-empty">Full-paper attempts will appear here.</div>}</section>
    </div>}
    <p className="progress-method">Full-paper average = total marks scored ÷ total marks available across full-paper attempts. Partial question marks are excluded from performance charts so short snippets cannot distort the trend.</p>
  </>
}
