import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Plus, RotateCcw, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { clearDraft, db, loadDraft, saveAttempt, saveDraft, stageDraft } from '../db'
import { Button, Empty, Field, Input, PageHead, Select, Textarea } from '../components/ui'
import { fmtPct, now, paperTitle, today, uid, validDate, validMarks } from '../lib/logic'
import { normalizeQuestion, parseQuestions, compareQuestions } from '../lib/parser'
import type { LogDraft, QuestionDraft, WizardStep } from '../types'
import { toast } from '../App'
import './log.css'

const fresh = (): LogDraft => ({ id: 'current', step: 'paper', subjectId: '', year: String(new Date().getFullYear()), session: 'Summer', paperType: 'Paper 1', variant: '', timezone: '', attemptedAt: today(), type: '', score: '', maxMarks: '', notes: '', rawQuestions: '', questions: [], updatedAt: now() })
const stepNames: Record<WizardStep, string> = { paper: 'Paper', type: 'Completion', questions: 'Questions', confirm: 'Confirm', marks: 'Marks', review: 'Review' }
const stepsFor = (d: LogDraft): WizardStep[] => d.type === 'PARTIAL' ? ['paper', 'type', 'questions', 'confirm', 'marks', 'review'] : ['paper', 'type', 'marks', 'review']
const markError = (score: string, max: string) => {
  if (score === '' || max === '') return 'Enter both marks.'
  if (!validMarks(Number(score), Number(max))) return 'Use a score from 0 up to a positive total.'
  return ''
}
export default function LogAttempt() {
  const subjects = useLiveQuery(() => db.subjects.orderBy('name').toArray(), [])
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<LogDraft | null>(null)
  const [offered, setOffered] = useState<LogDraft | null>(null)
  const [ready, setReady] = useState(false)
  const [savedPaper, setSavedPaper] = useState<string | null>(null)
  const [savedInfo, setSavedInfo] = useState<{ subject: string; paper: string; score: number; max: number } | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [subjectQuery, setSubjectQuery] = useState('')
  const [showSubjects, setShowSubjects] = useState(false)
  const subjectBox = useRef<HTMLDivElement>(null)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const paperIdParam = params.get('paperId')
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!subjectBox.current?.contains(event.target as Node)) setShowSubjects(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    let active = true
    ;(async () => {
      const saved = await loadDraft()
      if (!active) return
      if (saved) setOffered(saved)
      else {
        const next = fresh()
        if (paperIdParam) {
          const paper = await db.papers.get(paperIdParam)
          if (paper) Object.assign(next, { subjectId: paper.subjectId, year: String(paper.year), session: paper.session, paperType: paper.paperType, variant: paper.variant || '', timezone: paper.timezone || '' })
        }
        if (active) setDraft(next)
      }
      if (active) setReady(true)
    })()
    return () => { active = false }
  }, [paperIdParam])
  useEffect(() => {
    if (!ready || !draft || savedPaper) return
    const initial = fresh()
    if (draft.step === 'paper' && !draft.subjectId && draft.year === initial.year && draft.session === initial.session && draft.paperType === initial.paperType && !draft.variant && !draft.timezone && draft.attemptedAt === initial.attemptedAt) return
    const staged = stageDraft(draft)
    saveQueue.current = saveQueue.current.catch(() => undefined).then(() => saveDraft(staged))
    void saveQueue.current.catch(() => toast('Draft could not be saved. Check available storage.'))
  }, [draft, ready, savedPaper])
  const update = (patch: Partial<LogDraft>) => { setError(''); setDraft(d => d ? { ...d, ...patch } : d) }
  const resume = () => { setDraft(offered); setOffered(null); toast('Draft restored') }
  const discard = async () => { await clearDraft(); setOffered(null); setDraft(fresh()); toast('Draft discarded') }
  const chosen = subjects?.find(s => s.id === draft?.subjectId)
  const parsed = useMemo(() => parseQuestions(draft?.rawQuestions || ''), [draft?.rawQuestions])
  const total = draft?.type === 'FULL' ? { score: Number(draft.score) || 0, max: Number(draft.maxMarks) || 0 }
    : (draft?.questions || []).reduce((a, q) => ({ score: a.score + (Number(q.score) || 0), max: a.max + (Number(q.maxMarks) || 0) }), { score: 0, max: 0 })
  const paperValid = !!draft && !!chosen && Number.isInteger(Number(draft.year)) && Number(draft.year) >= 1900 && Number(draft.year) <= 2200 && !!draft.session.trim() && !!draft.paperType.trim() && validDate(draft.attemptedAt)
  const marksValid = !!draft && (draft.type === 'FULL' ? !markError(draft.score, draft.maxMarks) :
    draft.questions.length > 0 && draft.questions.every(q => normalizeQuestion(q.label) === q.label && !markError(q.score, q.maxMarks)) && new Set(draft.questions.map(q => q.label.toLowerCase())).size === draft.questions.length)
  const next = () => {
    if (!draft) return
    if (draft.step === 'paper') { if (!paperValid) return setError('Complete the paper details and enter a valid attempt date.'); update({ step: 'type' }) }
    else if (draft.step === 'type') { if (!draft.type) return setError('Choose how much of the paper you attempted.'); update({ step: draft.type === 'FULL' ? 'marks' : 'questions' }) }
    else if (draft.step === 'questions') { if (!parsed.length) return setError('Enter at least one valid question label.'); update({ questions: parsed.map(label => draft.questions.find(q => q.label.toLowerCase() === label.toLowerCase()) || { id: uid(), label, score: '', maxMarks: '', notes: '' }), step: 'confirm' }) }
    else if (draft.step === 'confirm') {
      if (!draft.questions.length) return setError('Keep at least one question.')
      const normalized = draft.questions.map(q => ({ ...q, label: normalizeQuestion(q.label) || '' }))
      if (normalized.some(q => !q.label)) return setError('Fix invalid question labels before continuing.')
      if (new Set(normalized.map(q => q.label.toLowerCase())).size !== normalized.length) return setError('Remove duplicate question labels.')
      update({ questions: normalized.sort((a, b) => compareQuestions(a.label, b.label)), step: 'marks' })
    }
    else if (draft.step === 'marks') { if (!marksValid) return setError('Fix missing or invalid marks before continuing.'); update({ step: 'review' }) }
  }
  const back = () => { if (!draft) return; const steps = stepsFor(draft); update({ step: steps[Math.max(0, steps.indexOf(draft.step) - 1)] }) }
  const setQuestion = (id: string, patch: Partial<QuestionDraft>) => update({ questions: draft!.questions.map(q => q.id === id ? { ...q, ...patch } : q) })
  const addQuestion = () => {
    const label = normalizeQuestion(addLabel)
    if (!label) return setError('Use a label such as 4, 3A, or 3(a)(ii).')
    if (draft!.questions.some(q => q.label.toLowerCase() === label.toLowerCase())) return setError('That question is already in the list.')
    update({ questions: [...draft!.questions, { id: uid(), label, score: '', maxMarks: '', notes: '' }] })
    setAddLabel('')
  }
  const save = async () => {
    if (!draft || !paperValid || !marksValid || saving) return
    setSaving(true); setError('')
    try {
      await saveQueue.current
      const paperId = await saveAttempt({
        paper: { subjectId: draft.subjectId, year: Number(draft.year), session: draft.session, paperType: draft.paperType, variant: draft.variant, timezone: draft.timezone },
        attempt: { type: draft.type as 'FULL' | 'PARTIAL', attemptedAt: draft.attemptedAt, score: draft.type === 'FULL' ? Number(draft.score) : null, maxMarks: draft.type === 'FULL' ? Number(draft.maxMarks) : null, notes: draft.notes.trim() || undefined },
        questions: draft.type === 'PARTIAL' ? draft.questions.map(q => ({ questionLabel: q.label, score: Number(q.score), maxMarks: Number(q.maxMarks), notes: q.notes.trim() || undefined })) : []
      })
      await clearDraft()
      setSavedInfo({ subject: chosen ? `${chosen.name} ${chosen.level}` : 'Paper', paper: `${draft.session} ${draft.year} · ${draft.paperType}`, score: total.score, max: total.max })
      setSavedPaper(paperId)
      setDraft(null)
      toast('Attempt saved')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the attempt.') }
    finally { setSaving(false) }
  }
  if (!ready || !subjects) return <div className="muted">Loading your draft…</div>
  if (offered) return <><PageHead eyebrow="LOG ATTEMPT" title="Welcome back" detail="An unfinished attempt is waiting for you."/><div className="panel panel-pad max-w-160"><div className="draft-emblem"><RotateCcw size={22}/></div><h2 className="text-xl font-semibold mt-4">Resume unfinished attempt</h2><p className="muted text-sm mt-2">Your progress, marks, and notes were saved automatically. Last updated {new Date(offered.updatedAt).toLocaleString()}.</p><div className="flex gap-2 mt-7"><Button onClick={resume}>Resume attempt <ArrowRight size={15}/></Button><Button variant="secondary" onClick={discard}>Discard draft</Button></div></div></>
  if (savedPaper) return <><PageHead eyebrow="LOG ATTEMPT" title="Attempt saved"/><div className="panel panel-pad max-w-175 success-card"><CheckCircle2 size={31}/><h2>Added to your library</h2><p>{savedInfo?.subject} · {savedInfo?.paper}</p><div className="success-score num">{savedInfo?.score} / {savedInfo?.max} <span>{fmtPct(savedInfo?.score || 0, savedInfo?.max || 0)}</span></div><div className="flex gap-2 mt-7"><Button onClick={() => navigate(`/papers/${savedPaper}`)}>View Paper <ArrowRight size={15}/></Button><Button variant="secondary" onClick={() => { setSavedPaper(null); setSavedInfo(null); setDraft(fresh()) }}>Log Another</Button></div></div></>
  if (!subjects.length) return <><PageHead eyebrow="LOG ATTEMPT" title="Log Attempt" detail="Record a full paper or just the questions you worked on."/><Empty title="Add a subject first" detail="Subjects organize your paper library. Create one in Settings to begin." action={<Link to="/settings"><Button>Add a subject <ArrowRight size={15}/></Button></Link>}/></>
  if (!draft) return null
  const steps = stepsFor(draft)
  return <>
    <PageHead eyebrow="LOG ATTEMPT" title="New attempt" detail="Your progress is saved automatically as you work."/>
    <div className="wizard-layout">
      <aside className="wizard-rail panel"><div className="rail-title">PROGRESS</div>{steps.map((s, i) => <button key={s} className={`rail-step ${draft.step === s ? 'current' : ''} ${steps.indexOf(draft.step) > i ? 'done' : ''}`} onClick={() => { if (i < steps.indexOf(draft.step)) update({ step: s }) }} disabled={i > steps.indexOf(draft.step)}><span className="rail-number">{steps.indexOf(draft.step) > i ? <Check size={13}/> : i + 1}</span><span>{stepNames[s]}</span></button>)}<div className="rail-note">Draft autosaved<br/>on this device</div></aside>
      <section className="panel wizard-panel">
        <div className="wizard-top"><span>STEP {steps.indexOf(draft.step) + 1} OF {steps.length}</span><span>{stepNames[draft.step]}</span></div>
        {draft.step === 'paper' && <><h2>Which paper did you work on?</h2><p className="wizard-intro">Use the exact paper identity so repeat attempts stay together.</p><div className="form-grid">
          <div className="field relative" ref={subjectBox}><span className="field-label">Subject</span><Input value={showSubjects ? subjectQuery : chosen ? `${chosen.name} ${chosen.level}` : subjectQuery} onFocus={() => { setShowSubjects(true); setSubjectQuery('') }} onKeyDown={e => { if (e.key === 'Escape') setShowSubjects(false) }} onChange={e => { setSubjectQuery(e.target.value); setShowSubjects(true) }} placeholder="Search your subjects…" aria-label="Subject" autoComplete="off"/>{showSubjects && <div className="subject-menu">{subjects.filter(s => `${s.name} ${s.level} ${s.shortName || ''}`.toLowerCase().includes(subjectQuery.toLowerCase())).map(s => <button key={s.id} type="button" onClick={() => { update({ subjectId: s.id }); setShowSubjects(false); setSubjectQuery('') }}>{s.name} <span>{s.level}</span></button>)}{!subjects.some(s => `${s.name} ${s.level} ${s.shortName || ''}`.toLowerCase().includes(subjectQuery.toLowerCase())) && <div className="p-3 muted small">No matching subjects</div>}</div>}</div>
          <Field label="Year"><Input type="number" min={1900} max={2200} value={draft.year} onChange={e => update({ year: e.target.value })}/></Field>
          <Field label="Session"><Select value={draft.session} onChange={e => update({ session: e.target.value })}><option value="Summer">Summer</option><option value="Winter">Winter</option></Select></Field>
          <Field label="Paper type"><Input value={draft.paperType} onChange={e => update({ paperType: e.target.value })} placeholder="e.g. Paper 1"/></Field>
          <Field label="Variant" hint="Optional"><Input value={draft.variant} onChange={e => update({ variant: e.target.value })} placeholder="e.g. 2"/></Field>
          <Field label="Timezone" hint="Optional"><Select value={draft.timezone} onChange={e => update({ timezone: e.target.value })}><option value="">No timezone</option><option value="TZ1">TZ1</option><option value="TZ2">TZ2</option><option value="TZ3">TZ3</option></Select></Field>
          <Field label="Date attempted"><Input type="date" value={draft.attemptedAt} onChange={e => update({ attemptedAt: e.target.value })}/></Field>
        </div></>}
        {draft.step === 'type' && <><h2>How much did you attempt?</h2><p className="wizard-intro">You can log another attempt of this paper at any time.</p><div className="choice-grid"><button className={`choice ${draft.type === 'FULL' ? 'selected' : ''}`} onClick={() => update({ type: 'FULL' })}><div className="choice-symbol">▤</div><strong>Full paper</strong><span>Record one overall score and total marks.</span></button><button className={`choice ${draft.type === 'PARTIAL' ? 'selected' : ''}`} onClick={() => update({ type: 'PARTIAL' })}><div className="choice-symbol">◫</div><strong>Part of paper</strong><span>Record exactly which questions you attempted.</span></button></div></>}
        {draft.step === 'questions' && <><h2>Which questions did you attempt?</h2><p className="wizard-intro">Write naturally. Separate questions with commas, spaces, new lines, “and”, or “&”.</p><Field label="Questions attempted" hint="For example: 1,2,3A and 3B, 4E"><Textarea rows={5} value={draft.rawQuestions} onChange={e => update({ rawQuestions: e.target.value })} placeholder="1,2,3A and 3B, 4E"/></Field><div className="parser-preview"><span>PREVIEW · {parsed.length} FOUND</span>{parsed.length ? <div>{parsed.map(q => <b key={q}>{q}</b>)}</div> : <p>Question labels will appear here as you type.</p>}</div></>}
        {draft.step === 'confirm' && <><h2>Confirm your questions</h2><p className="wizard-intro">We found {draft.questions.length} questions. Edit or remove any label before entering marks.</p><div className="confirm-list">{draft.questions.map(q => <div key={q.id} className="confirm-row"><span>Q</span><Input aria-label={`Question label ${q.label}`} value={q.label} onChange={e => setQuestion(q.id, { label: e.target.value })} onBlur={() => { const normalized = normalizeQuestion(q.label); if (normalized) setQuestion(q.id, { label: normalized }) }}/><button className="icon-button" aria-label={`Remove question ${q.label}`} onClick={() => update({ questions: draft.questions.filter(x => x.id !== q.id) })}><X size={17}/></button></div>)}</div><div className="add-question"><Input aria-label="Add question label" placeholder="Add another, e.g. 5(b)" value={addLabel} onChange={e => setAddLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuestion() } }}/><Button variant="secondary" onClick={addQuestion}><Plus size={15}/> Add</Button></div></>}
        {draft.step === 'marks' && (draft.type === 'FULL' ? <><h2>Enter your marks</h2><p className="wizard-intro">Record the overall score for this full paper.</p><div className="form-grid"><Field label="Marks scored" error={draft.score && draft.maxMarks ? markError(draft.score, draft.maxMarks) : undefined}><Input type="number" min="0" step="any" value={draft.score} onChange={e => update({ score: e.target.value })} placeholder="58"/></Field><Field label="Total marks available"><Input type="number" min="0.01" step="any" value={draft.maxMarks} onChange={e => update({ maxMarks: e.target.value })} placeholder="80"/></Field></div><div className="live-total"><span>YOUR SCORE</span><strong className="num">{total.score} / {total.max}</strong><b className="num">{fmtPct(total.score, total.max)}</b></div><Field label="Overall notes" hint="Optional"><Textarea rows={4} value={draft.notes} onChange={e => update({ notes: e.target.value })} placeholder="What would you remember next time?"/></Field></> :
        <><h2>Enter question marks</h2><p className="wizard-intro">Add a score, available marks, and any note worth remembering.</p><div className="marks-head"><span>QUESTION</span><span>SCORED</span><span>AVAILABLE</span><span>NOTES</span></div><div className="marks-list">{draft.questions.map(q => <div className="marks-row" key={q.id}><strong>Q{q.label}</strong><Input aria-label={`Score for ${q.label}`} type="number" min="0" step="any" value={q.score} onChange={e => setQuestion(q.id, { score: e.target.value })} placeholder="0"/><Input aria-label={`Available marks for ${q.label}`} type="number" min="0.01" step="any" value={q.maxMarks} onChange={e => setQuestion(q.id, { maxMarks: e.target.value })} placeholder="0"/><Input aria-label={`Note for ${q.label}`} value={q.notes} onChange={e => setQuestion(q.id, { notes: e.target.value })} placeholder="Optional note"/>{q.score !== '' && q.maxMarks !== '' && markError(q.score, q.maxMarks) && <span className="field-error col-span-full">{q.label}: {markError(q.score, q.maxMarks)}</span>}</div>)}</div><div className="live-total sticky-total"><span>RUNNING TOTAL</span><strong className="num">{total.score} / {total.max}</strong><b className="num">{fmtPct(total.score, total.max)}</b></div><Field label="Overall notes" hint="Optional"><Textarea rows={3} value={draft.notes} onChange={e => update({ notes: e.target.value })} placeholder="A note about this attempt"/></Field></>)}
        {draft.step === 'review' && <><h2>Review your attempt</h2><p className="wizard-intro">Check the details before adding this attempt to your library.</p><div className="review-identity"><span className="eyebrow">PAPER</span><strong>{chosen?.name} {chosen?.level}</strong><span>{paperTitle({ id: '', subjectId: draft.subjectId, year: Number(draft.year), session: draft.session, paperType: draft.paperType, variant: draft.variant, timezone: draft.timezone, identityKey: '', createdAt: '', updatedAt: '' })}</span></div><div className="review-block"><div className="flex justify-between items-center"><span className="eyebrow">{draft.type === 'FULL' ? 'FULL PAPER' : 'PARTIAL ATTEMPT'}</span><button className="review-edit" onClick={() => update({ step: 'marks' })}>Edit marks</button></div>{draft.type === 'PARTIAL' && <div className="review-questions">{draft.questions.map(q => <div key={q.id}><span>Q{q.label}</span><b className="num">{q.score} / {q.maxMarks}</b>{q.notes && <small>{q.notes}</small>}</div>)}</div>}<div className="review-total"><span>Total</span><strong className="num">{total.score} / {total.max}</strong><b className="num">{fmtPct(total.score, total.max)}</b></div></div><div className="review-foot"><div><span>Date attempted</span><b>{draft.attemptedAt}</b></div>{draft.notes && <div><span>Notes</span><b>{draft.notes}</b></div>}</div></>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="wizard-actions">{draft.step !== 'paper' ? <Button variant="secondary" onClick={back}><ArrowLeft size={15}/> Back</Button> : <span/>}{draft.step === 'review' ? <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save attempt'} <Check size={15}/></Button> : <Button onClick={next}>Continue <ArrowRight size={15}/></Button>}</div>
      </section>
    </div>
  </>
}
