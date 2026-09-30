import Dexie, { type EntityTable } from 'dexie'
import type { Attempt, LogDraft, Paper, Preferences, QuestionAttempt, Subject } from '../types'
import { now, paperKey, uid, validDate, validMarks } from '../lib/logic'
import { normalizeQuestion } from '../lib/parser'

class PaperDatabase extends Dexie {
  subjects!: EntityTable<Subject, 'id'>
  papers!: EntityTable<Paper, 'id'>
  attempts!: EntityTable<Attempt, 'id'>
  questionAttempts!: EntityTable<QuestionAttempt, 'id'>
  drafts!: EntityTable<LogDraft, 'id'>
  preferences!: EntityTable<Preferences, 'id'>
  constructor() {
    super('PastPaperLogger')
    this.version(1).stores({
      subjects: 'id, [name+level]',
      papers: 'id, &identityKey, subjectId, year',
      attempts: 'id, paperId, attemptedAt',
      questionAttempts: 'id, attemptId',
      drafts: 'id',
      preferences: 'id'
    })
  }
}
export const db = new PaperDatabase()
export const defaultPrefs: Preferences = { id: 'main', theme: 'system', browseSort: 'recent', browseGroup: 'subject', sidebarCollapsed: false }
export const getPrefs = async () => await db.preferences.get('main') || defaultPrefs
export const updatePrefs = async (patch: Partial<Preferences>) => db.preferences.put({ ...await getPrefs(), ...patch, id: 'main' })

export const addSubject = async (input: Pick<Subject, 'name' | 'level' | 'shortName'>, id?: string) => {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Enter a subject name.')
  const all = await db.subjects.toArray()
  if (all.some(s => s.id !== id && s.level === input.level && s.name.toLowerCase() === name.toLowerCase())) throw new Error('That subject and level already exist.')
  const old = id ? await db.subjects.get(id) : undefined
  const timestamp = now()
  const item: Subject = { id: old?.id || uid(), name, level: input.level, shortName: input.shortName?.trim() || undefined, createdAt: old?.createdAt || timestamp, updatedAt: timestamp }
  await db.subjects.put(item)
  return item
}

export type SaveAttemptInput = {
  paper: Pick<Paper, 'subjectId' | 'year' | 'session' | 'paperType' | 'variant' | 'timezone'>
  attempt: Pick<Attempt, 'type' | 'attemptedAt' | 'score' | 'maxMarks' | 'notes'>
  questions: Pick<QuestionAttempt, 'questionLabel' | 'score' | 'maxMarks' | 'notes'>[]
}
export const saveAttempt = async (input: SaveAttemptInput) => {
  if (!await db.subjects.get(input.paper.subjectId)) throw new Error('Choose an existing subject.')
  if (!Number.isInteger(input.paper.year) || input.paper.year < 1900 || input.paper.year > 2200 || !input.paper.session.trim() || !input.paper.paperType.trim()) throw new Error('Complete the paper identity.')
  if (!validDate(input.attempt.attemptedAt)) throw new Error('Enter a valid attempt date.')
  if (input.attempt.type === 'FULL' && (input.attempt.score === null || input.attempt.maxMarks === null || !validMarks(input.attempt.score, input.attempt.maxMarks))) throw new Error('Enter valid full-paper marks.')
  if (input.attempt.type === 'PARTIAL' && (!input.questions.length || input.attempt.score !== null || input.attempt.maxMarks !== null || input.questions.some(q => normalizeQuestion(q.questionLabel) !== q.questionLabel || !validMarks(q.score, q.maxMarks)) || new Set(input.questions.map(q => q.questionLabel.toLowerCase())).size !== input.questions.length)) throw new Error('Enter valid, distinct question marks.')
  return db.transaction('rw', db.papers, db.attempts, db.questionAttempts, db.drafts, async () => {
  const key = paperKey(input.paper)
  let paper = await db.papers.where('identityKey').equals(key).first()
  const timestamp = now()
  if (!paper) {
    paper = { ...input.paper, session: input.paper.session.trim(), paperType: input.paper.paperType.trim(), variant: input.paper.variant?.trim() || undefined, timezone: input.paper.timezone?.trim() || undefined, id: uid(), identityKey: key, createdAt: timestamp, updatedAt: timestamp }
    await db.papers.add(paper)
  }
  const attempt: Attempt = { ...input.attempt, id: uid(), paperId: paper.id, createdAt: timestamp, updatedAt: timestamp }
  await db.attempts.add(attempt)
  if (input.questions.length) await db.questionAttempts.bulkAdd(input.questions.map(q => ({ ...q, id: uid(), attemptId: attempt.id, createdAt: timestamp, updatedAt: timestamp })))
  await db.drafts.delete('current')
  return paper.id
})
}

export const editPaper = async (id: string, patch: Pick<Paper, 'subjectId' | 'year' | 'session' | 'paperType' | 'variant' | 'timezone'>) => {
  if (!Number.isInteger(patch.year) || patch.year < 1900 || patch.year > 2200 || !patch.session.trim() || !patch.paperType.trim()) throw new Error('Complete the paper identity.')
  const key = paperKey(patch)
  return db.transaction('rw', db.papers, db.subjects, async () => {
    if (!await db.subjects.get(patch.subjectId)) throw new Error('Choose an existing subject.')
    const existing = await db.papers.where('identityKey').equals(key).first()
    if (existing && existing.id !== id) throw new Error('A paper with this identity already exists. Change a field or open that paper.')
    const old = await db.papers.get(id)
    if (!old) throw new Error('Paper not found.')
    await db.papers.put({ ...old, ...patch, session: patch.session.trim(), paperType: patch.paperType.trim(), variant: patch.variant?.trim() || undefined, timezone: patch.timezone?.trim() || undefined, identityKey: key, updatedAt: now() })
  })
}

export const editAttempt = async (attempt: Attempt, questions: QuestionAttempt[]) => db.transaction('rw', db.attempts, db.questionAttempts, async () => {
  if (!validDate(attempt.attemptedAt)) throw new Error('Enter a valid attempt date.')
  if (attempt.type === 'FULL' && (attempt.score === null || attempt.maxMarks === null || !validMarks(attempt.score, attempt.maxMarks))) throw new Error('Enter valid full-paper marks.')
  if (attempt.type === 'PARTIAL' && (!questions.length || questions.some(q => normalizeQuestion(q.questionLabel) !== q.questionLabel || !validMarks(q.score, q.maxMarks)) || new Set(questions.map(q => q.questionLabel.toLowerCase())).size !== questions.length)) throw new Error('Enter valid, distinct question marks.')
  await db.attempts.put({ ...attempt, updatedAt: now(), score: attempt.type === 'PARTIAL' ? null : attempt.score, maxMarks: attempt.type === 'PARTIAL' ? null : attempt.maxMarks })
  await db.questionAttempts.where('attemptId').equals(attempt.id).delete()
  if (attempt.type === 'PARTIAL' && questions.length) await db.questionAttempts.bulkAdd(questions.map(q => ({ ...q, id: q.id || uid(), attemptId: attempt.id, updatedAt: now() })))
})

export const deleteAttempt = async (id: string) => db.transaction('rw', db.papers, db.attempts, db.questionAttempts, async () => {
  const attempt = await db.attempts.get(id)
  if (!attempt) return null
  const paper = await db.papers.get(attempt.paperId)
  const questions = await db.questionAttempts.where('attemptId').equals(id).toArray()
  await db.questionAttempts.where('attemptId').equals(id).delete()
  await db.attempts.delete(id)
  if (!await db.attempts.where('paperId').equals(attempt.paperId).count()) await db.papers.delete(attempt.paperId)
  return { attempt, paper, questions }
})
export const undoDeleteAttempt = async (data: NonNullable<Awaited<ReturnType<typeof deleteAttempt>>>) => db.transaction('rw', db.papers, db.attempts, db.questionAttempts, async () => {
  if (data.paper && !await db.papers.get(data.paper.id)) await db.papers.add(data.paper)
  await db.attempts.add(data.attempt)
  if (data.questions.length) await db.questionAttempts.bulkAdd(data.questions)
})

export const stageDraft = (draft: LogDraft): LogDraft => {
  const updated = { ...draft, updatedAt: now() }
  try { localStorage.setItem('paperLoggerDraft', JSON.stringify(updated)) } catch { /* IndexedDB remains the primary copy */ }
  return updated
}
export const saveDraft = async (draft: LogDraft) => { await db.drafts.put(draft) }
const isDraft = (value: unknown): value is LogDraft => {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<LogDraft>
  const stringFields: (keyof LogDraft)[] = ['subjectId', 'year', 'session', 'paperType', 'variant', 'timezone', 'attemptedAt', 'score', 'maxMarks', 'notes', 'rawQuestions', 'updatedAt']
  return d.id === 'current' && ['paper', 'type', 'questions', 'confirm', 'marks', 'review'].includes(d.step || '') &&
    ['', 'FULL', 'PARTIAL'].includes(d.type || '') && stringFields.every(key => typeof d[key] === 'string') &&
    Array.isArray(d.questions) && d.questions.every(q => q && ['id', 'label', 'score', 'maxMarks', 'notes'].every(key => typeof q[key as keyof typeof q] === 'string'))
}
export const clearDraft = async () => {
  try { localStorage.removeItem('paperLoggerDraft') } catch { /* ignore */ }
  await db.drafts.delete('current')
}
export const loadDraft = async (): Promise<LogDraft | null> => {
  const stored = await db.drafts.get('current')
  try {
    const mirror = JSON.parse(localStorage.getItem('paperLoggerDraft') || 'null') as unknown
    if (isDraft(mirror) && (!isDraft(stored) || mirror.updatedAt > stored.updatedAt)) return mirror
  } catch { /* ignore corrupt mirror */ }
  return isDraft(stored) ? stored : null
}
