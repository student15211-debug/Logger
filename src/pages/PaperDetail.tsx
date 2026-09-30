import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ArrowRight, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { db, deleteAttempt, editAttempt, editPaper, undoDeleteAttempt } from '../db'
import { attemptMarks, bestFull, dateLabel, fmtPct, latestAttempt, paperStatus, paperTitle, pct, subjectTitle, validDate, validMarks } from '../lib/logic'
import { compareQuestions, normalizeQuestion } from '../lib/parser'
import type { Attempt, Paper, QuestionAttempt } from '../types'
import { Button, Empty, Field, Input, Modal, PageHead, Pill, Select, Stat, Textarea } from '../components/ui'
import { toast } from '../App'
import './detail.css'

export default function PaperDetail() {
  const { paperId } = useParams()
  const data = useLiveQuery(async () => {
    const paper = await db.papers.get(paperId || '')
    if (!paper) return null
    const [subject, subjects, attempts] = await Promise.all([db.subjects.get(paper.subjectId), db.subjects.toArray(), db.attempts.where('paperId').equals(paper.id).toArray()])
    const ids = attempts.map(a => a.id)
    const questions = ids.length ? await db.questionAttempts.where('attemptId').anyOf(ids).toArray() : []
    return { paper, subject, subjects, attempts: attempts.sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt) || b.createdAt.localeCompare(a.createdAt)), questions }
  }, [paperId])
  const [editPaperOpen, setEditPaperOpen] = useState(false)
  const [editing, setEditing] = useState<Attempt | null>(null)
  const [deleting, setDeleting] = useState<Attempt | null>(null)
  const [undo, setUndo] = useState<NonNullable<Awaited<ReturnType<typeof deleteAttempt>>> | null>(null)
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), 10000); return () => clearTimeout(timer) }, [undo])
  const questionHistory = useMemo(() => {
    if (!data) return []
    const attemptMap = new Map(data.attempts.map(a => [a.id, a]))
    const map = new Map<string, QuestionAttempt[]>()
    for (const q of data.questions) map.set(q.questionLabel.toLowerCase(), [...map.get(q.questionLabel.toLowerCase()) || [], q])
    return [...map.values()].map(qs => {
      const best = [...qs].sort((a, b) => (pct(b.score, b.maxMarks) || 0) - (pct(a.score, a.maxMarks) || 0))[0]
      const latest = [...qs].sort((a, b) => (attemptMap.get(b.attemptId)?.attemptedAt || '').localeCompare(attemptMap.get(a.attemptId)?.attemptedAt || ''))[0]
      return { label: qs[0].questionLabel, count: qs.length, best, latest: attemptMap.get(latest.attemptId)?.attemptedAt }
    }).sort((a, b) => compareQuestions(a.label, b.label))
  }, [data])
  if (data === undefined) return <div className="muted">Loading paper…</div>
  if (!data) return <Empty title={undo ? 'Attempt deleted' : 'Paper not found'} detail={undo ? 'This was the final attempt for the paper. You can restore it now.' : undefined} action={undo ? <Button onClick={async () => { await undoDeleteAttempt(undo); setUndo(null); toast('Attempt restored') }}>Undo deletion</Button> : <Link to="/papers"><Button>Back to library</Button></Link>}/>
  const { paper, subject, subjects, attempts, questions } = data
  const full = attempts.filter(a => a.type === 'FULL'), partial = attempts.filter(a => a.type === 'PARTIAL')
  const best = bestFull(attempts), latest = latestAttempt(attempts)
  const latestFull = latestAttempt(full)
  const doDelete = async () => {
    if (!deleting) return
    const deleted = await deleteAttempt(deleting.id)
    setDeleting(null)
    if (deleted) { setUndo(deleted); toast('Attempt deleted — Undo is available below') }
  }
  return <>
    <Link to="/papers" className="back-link"><ArrowLeft size={15}/> Past Papers</Link>
    <PageHead eyebrow="PAPER DETAIL" title={subjectTitle(subject)} detail={paperTitle(paper)} action={<div className="flex gap-2"><Button variant="secondary" onClick={() => setEditPaperOpen(true)}><Pencil size={15}/> Edit paper</Button><Link to={`/log?paperId=${paper.id}`}><Button><Plus size={15}/> Log another attempt</Button></Link></div>}/>
    {undo && <div className="undo-banner"><span>Attempt deleted.</span><Button variant="secondary" onClick={async () => { await undoDeleteAttempt(undo); setUndo(null); toast('Attempt restored') }}><RotateCcw size={14}/> Undo</Button></div>}
    <div className="detail-summary">
      <Stat label="Status" value={<Pill tone={paperStatus(attempts) === 'Full' ? 'green' : 'amber'}>{paperStatus(attempts)}</Pill>}/>
      <Stat label="Attempts" value={attempts.length} detail={`${full.length} full · ${partial.length} partial`}/>
      <Stat label="Latest attempt" value={dateLabel(latest?.attemptedAt, true)}/>
      {best && <Stat label="Best full score" value={`${best.score} / ${best.maxMarks}`} detail={fmtPct(best.score!, best.maxMarks!)}/>}
      {full.length > 1 && latestFull && <Stat label="Latest full score" value={`${latestFull.score} / ${latestFull.maxMarks}`} detail={fmtPct(latestFull.score!, latestFull.maxMarks!)}/>}
      {questionHistory.length > 0 && <Stat label="Distinct questions" value={questionHistory.length} detail="Logged in partial attempts"/>}
    </div>
    <div className="detail-columns">
      <section>
        <div className="section-head"><div><h2>Attempt history</h2><p>Every attempt at this paper, newest first</p></div></div>
        {attempts.map(a => {
          const qs = questions.filter(q => q.attemptId === a.id).sort((x, y) => compareQuestions(x.questionLabel, y.questionLabel))
          const marks = attemptMarks(a, qs)
          return <article className="attempt-card panel" key={a.id}>
            <div className="attempt-top"><div><div className="attempt-date">{dateLabel(a.attemptedAt)}</div><Pill tone={a.type === 'FULL' ? 'green' : 'amber'}>{a.type === 'FULL' ? 'Full paper' : 'Partial'}</Pill></div><div className="attempt-buttons"><button className="icon-button" onClick={() => setEditing(a)} aria-label={`Edit attempt on ${a.attemptedAt}`}><Pencil size={16}/></button><button className="icon-button" onClick={() => setDeleting(a)} aria-label={`Delete attempt on ${a.attemptedAt}`}><Trash2 size={16}/></button></div></div>
            {a.type === 'PARTIAL' && <div className="attempt-question-list">{qs.map(q => <div key={q.id} className="attempt-question"><span>Q{q.questionLabel}</span><b className="num">{q.score} / {q.maxMarks}</b>{q.notes && <small>{q.notes}</small>}</div>)}</div>}
            <div className="attempt-score"><span>{a.type === 'FULL' ? 'Score' : 'Total'}</span><strong className="num">{marks.score} / {marks.maxMarks}</strong><b className="num">{fmtPct(marks.score, marks.maxMarks)}</b></div>
            {a.notes && <div className="attempt-note"><span>NOTE</span><p>{a.notes}</p></div>}
          </article>
        })}
      </section>
      <aside>{questionHistory.length > 0 && <div className="panel question-history"><div className="section-head"><div><h2>Question history</h2><p>Only questions you've logged</p></div></div>{questionHistory.map(q => <div className="question-history-row" key={q.label}><strong>Q{q.label}</strong><span>{q.count} {q.count === 1 ? 'attempt' : 'attempts'}</span><div>Best <b className="num">{q.best.score} / {q.best.maxMarks}</b> <em className="num">{fmtPct(q.best.score, q.best.maxMarks)}</em></div><small>Last {dateLabel(q.latest, true)}</small></div>)}</div>}</aside>
    </div>
    {editPaperOpen && <PaperEditor paper={paper} subjects={subjects} onClose={() => setEditPaperOpen(false)}/>}
    {editing && <AttemptEditor attempt={editing} questions={questions.filter(q => q.attemptId === editing.id)} onClose={() => setEditing(null)}/>}
    {deleting && <Modal title="Delete this attempt?" onClose={() => setDeleting(null)}><p className="text-sm muted">The attempt from {dateLabel(deleting.attemptedAt)} and its question marks will be removed. You can undo this briefly after deletion.</p><div className="modal-actions"><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={doDelete}>Delete attempt</Button></div></Modal>}
  </>
}
function PaperEditor({ paper, subjects, onClose }: { paper: Paper; subjects: { id: string; name: string; level: string }[]; onClose: () => void }) {
  const [value, setValue] = useState(paper)
  const [error, setError] = useState('')
  const patch = (p: Partial<Paper>) => setValue(v => ({ ...v, ...p }))
  const save = async () => {
    if (!value.subjectId || !Number.isInteger(Number(value.year)) || value.year < 1900 || value.year > 2200 || !value.session.trim() || !value.paperType.trim()) return setError('Complete all required fields.')
    try { await editPaper(paper.id, value); toast('Paper updated'); onClose() } catch (e) { setError(e instanceof Error ? e.message : 'Could not update paper.') }
  }
  return <Modal title="Edit paper" onClose={onClose}><div className="form-grid">
    <Field label="Subject"><Select value={value.subjectId} onChange={e => patch({ subjectId: e.target.value })}>{subjects.map(s => <option key={s.id} value={s.id}>{s.name} {s.level}</option>)}</Select></Field>
    <Field label="Year"><Input type="number" value={value.year} onChange={e => patch({ year: Number(e.target.value) })}/></Field>
    <Field label="Session"><Input value={value.session} onChange={e => patch({ session: e.target.value })}/></Field>
    <Field label="Paper type"><Input value={value.paperType} onChange={e => patch({ paperType: e.target.value })}/></Field>
    <Field label="Variant"><Input value={value.variant || ''} onChange={e => patch({ variant: e.target.value })}/></Field>
    <Field label="Timezone"><Input value={value.timezone || ''} onChange={e => patch({ timezone: e.target.value })}/></Field>
  </div>{error && <p className="field-error mt-3">{error}</p>}<div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save changes</Button></div></Modal>
}
function AttemptEditor({ attempt, questions, onClose }: { attempt: Attempt; questions: QuestionAttempt[]; onClose: () => void }) {
  const [value, setValue] = useState(attempt)
  const [qs, setQs] = useState([...questions].sort((a, b) => compareQuestions(a.questionLabel, b.questionLabel)))
  const [error, setError] = useState('')
  const patch = (p: Partial<Attempt>) => setValue(v => ({ ...v, ...p }))
  const qPatch = (id: string, p: Partial<QuestionAttempt>) => setQs(v => v.map(q => q.id === id ? { ...q, ...p } : q))
  const save = async () => {
    if (!validDate(value.attemptedAt)) return setError('Enter a valid date.')
    if (value.type === 'FULL' && (value.score === null || value.maxMarks === null || !validMarks(value.score, value.maxMarks))) return setError('Enter a valid score and total.')
    if (value.type === 'PARTIAL' && (!qs.length || qs.some(q => !normalizeQuestion(q.questionLabel) || !validMarks(q.score, q.maxMarks)) || new Set(qs.map(q => q.questionLabel.toLowerCase())).size !== qs.length)) return setError('Fix duplicate labels or invalid question marks.')
    try { await editAttempt(value, qs.map(q => ({ ...q, questionLabel: normalizeQuestion(q.questionLabel)! }))); toast('Attempt updated'); onClose() } catch (e) { setError(e instanceof Error ? e.message : 'Could not update attempt.') }
  }
  return <Modal title="Edit attempt" wide onClose={onClose}>
    <div className="form-grid"><Field label="Date attempted"><Input type="date" value={value.attemptedAt} onChange={e => patch({ attemptedAt: e.target.value })}/></Field><Field label="Type"><Input value={value.type === 'FULL' ? 'Full paper' : 'Partial attempt'} disabled/></Field></div>
    {value.type === 'FULL' ? <div className="form-grid mt-4"><Field label="Marks scored"><Input type="number" min="0" step="any" value={value.score ?? ''} onChange={e => patch({ score: e.target.value === '' ? null : Number(e.target.value) })}/></Field><Field label="Total marks"><Input type="number" min="0.01" step="any" value={value.maxMarks ?? ''} onChange={e => patch({ maxMarks: e.target.value === '' ? null : Number(e.target.value) })}/></Field></div> :
      <div className="mt-5"><div className="section-head"><h2>Question marks</h2></div><div className="edit-questions">{qs.map(q => <div key={q.id} className="edit-question"><Input aria-label="Question label" value={q.questionLabel} onChange={e => qPatch(q.id, { questionLabel: e.target.value })}/><Input aria-label={`Score for ${q.questionLabel}`} type="number" min="0" step="any" value={q.score} onChange={e => qPatch(q.id, { score: Number(e.target.value) })}/><Input aria-label={`Total marks for ${q.questionLabel}`} type="number" min="0.01" step="any" value={q.maxMarks} onChange={e => qPatch(q.id, { maxMarks: Number(e.target.value) })}/><button className="icon-button" aria-label="Remove question" onClick={() => setQs(v => v.filter(x => x.id !== q.id))}><Trash2 size={15}/></button><Input className="q-note" aria-label={`Note for ${q.questionLabel}`} value={q.notes || ''} onChange={e => qPatch(q.id, { notes: e.target.value })} placeholder="Question note"/></div>)}</div><Button variant="quiet" className="mt-2" onClick={() => setQs(v => [...v, { id: crypto.randomUUID(), attemptId: attempt.id, questionLabel: '', score: 0, maxMarks: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])}><Plus size={15}/> Add question</Button></div>}
    <Field label="Overall notes" className="mt-5"><Textarea rows={3} value={value.notes || ''} onChange={e => patch({ notes: e.target.value })}/></Field>
    {error && <p className="field-error mt-3">{error}</p>}<div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save changes <ArrowRight size={14}/></Button></div>
  </Modal>
}
