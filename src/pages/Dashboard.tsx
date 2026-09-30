import { ArrowRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { attemptMarks, dateLabel, fmtPct, paperTitle, subjectTitle, weighted } from '../lib/logic'
import { Button, Empty, PageHead, Pill, Stat } from '../components/ui'

export default function Dashboard() {
  const data = useLiveQuery(async () => {
    const attempts = (await db.attempts.toArray()).sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt) || b.createdAt.localeCompare(a.createdAt))
    const recentIds = attempts.slice(0, 7).map(a => a.id)
    return {
      subjects: await db.subjects.toArray(),
      papers: await db.papers.toArray(),
      attempts,
      questionCount: await db.questionAttempts.count(),
      recentQuestions: recentIds.length ? await db.questionAttempts.where('attemptId').anyOf(recentIds).toArray() : []
    }
  }, [])
  if (!data) return <div className="muted">Loading dashboard…</div>
  const { subjects, papers, attempts, recentQuestions } = data
  const paperMap = new Map(papers.map(p => [p.id, p]))
  const subjectMap = new Map(subjects.map(s => [s.id, s]))
  const full = attempts.filter(a => a.type === 'FULL')
  const avg = weighted(full.map(a => ({ score: a.score!, maxMarks: a.maxMarks! })))
  return <>
    <PageHead eyebrow="OVERVIEW" title="Dashboard" detail="A clear view of the work you've put in." action={<Link to="/log"><Button><Plus size={16}/> Log Attempt</Button></Link>}/>
    {!subjects.length ? <Empty title="Start with a subject" detail="Add your first IB subject in Settings, then log a paper attempt." action={<Link to="/settings"><Button>Add a subject <ArrowRight size={15}/></Button></Link>}/> : <>
      <div className="stats-grid six">
        <Stat label="Papers in your library" value={papers.length}/>
        <Stat label="Total attempts" value={attempts.length}/>
        <Stat label="Full-paper attempts" value={full.length}/>
        <Stat label="Partial attempts" value={attempts.length - full.length}/>
        <Stat label="Questions logged" value={data.questionCount}/>
        <Stat label="Full-paper average" value={avg === null ? '—' : `${avg.toFixed(1)}%`} detail="Weighted by available marks"/>
      </div>
      <div className="panel mt-7">
        <div className="section-head px-5 pt-5"><div><h2>Recent activity</h2><p>Your latest paper attempts</p></div><Link to="/papers" className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Browse all <ArrowRight size={13} className="inline"/></Link></div>
        {!attempts.length ? <div className="px-5 pb-6"><Empty title="No attempts yet" detail="Your history will appear here once you log a paper." action={<Link to="/log"><Button>Log your first attempt</Button></Link>}/></div> :
          attempts.slice(0, 7).map(a => {
            const p = paperMap.get(a.paperId), s = p && subjectMap.get(p.subjectId)
            if (!p) return null
            const marks = attemptMarks(a, recentQuestions)
            return <Link key={a.id} className="row-link" to={`/papers/${p.id}`}>
              <div className="min-w-0"><div className="text-sm font-semibold truncate">{subjectTitle(s)}</div><div className="text-xs muted mt-1 truncate">{paperTitle(p)}</div></div>
              <div className="flex items-center gap-5 shrink-0"><Pill tone={a.type === 'FULL' ? 'green' : 'amber'}>{a.type === 'FULL' ? 'Full' : 'Partial'}</Pill><div className="text-right min-w-25"><b className="text-sm num">{marks.score} / {marks.maxMarks}</b><div className="text-xs muted num">{fmtPct(marks.score, marks.maxMarks)}</div></div><div className="text-xs muted w-25 text-right hidden md:block">{dateLabel(a.attemptedAt, true)}</div><ArrowRight size={16} className="subtle"/></div>
            </Link>
          })}
      </div>
    </>}
  </>
}
