import { z } from 'zod'
import { db, defaultPrefs, loadDraft } from '../db'
import { paperKey, validDate, validMarks } from './logic'
import { normalizeQuestion } from './parser'
import type { Backup, LogDraft, Preferences } from '../types'

const stamp = z.iso.datetime()
const base = { id: z.string().min(1), createdAt: stamp, updatedAt: stamp }
const subject = z.object({ ...base, name: z.string().trim().min(1), level: z.enum(['HL', 'SL']), shortName: z.string().optional() })
const paper = z.object({ ...base, subjectId: z.string(), year: z.number().int().min(1900).max(2200), session: z.string().trim().min(1), paperType: z.string().trim().min(1), variant: z.string().optional(), timezone: z.string().optional(), identityKey: z.string() })
const attempt = z.object({ ...base, paperId: z.string(), type: z.enum(['FULL', 'PARTIAL']), attemptedAt: z.string().refine(validDate), score: z.number().nullable(), maxMarks: z.number().nullable(), notes: z.string().optional() })
const question = z.object({ ...base, attemptId: z.string(), questionLabel: z.string().min(1), score: z.number(), maxMarks: z.number(), notes: z.string().optional() })
const draft = z.object({ id: z.literal('current'), step: z.enum(['paper', 'type', 'questions', 'confirm', 'marks', 'review']), subjectId: z.string(), year: z.string(), session: z.string(), paperType: z.string(), variant: z.string(), timezone: z.string(), attemptedAt: z.string(), type: z.union([z.literal('FULL'), z.literal('PARTIAL'), z.literal('')]), score: z.string(), maxMarks: z.string(), notes: z.string(), rawQuestions: z.string(), questions: z.array(z.object({ id: z.string(), label: z.string(), score: z.string(), maxMarks: z.string(), notes: z.string() })), updatedAt: stamp })
const prefs = z.object({ id: z.literal('main'), theme: z.enum(['light', 'dark', 'system']), browseSort: z.string(), browseGroup: z.enum(['subject', 'flat']), sidebarCollapsed: z.boolean() })
const backupSchema = z.object({ schemaVersion: z.literal(1), exportedAt: stamp, subjects: z.array(subject), papers: z.array(paper), attempts: z.array(attempt), questionAttempts: z.array(question), draft: draft.nullable(), preferences: prefs })
const unique = (values: string[]) => new Set(values).size === values.length
export const validateBackup = (raw: unknown): Backup => {
  if (!raw || typeof raw !== 'object' || !('schemaVersion' in raw)) throw new Error('This is not a Past Paper Logger backup.')
  if ((raw as { schemaVersion: unknown }).schemaVersion !== 1) throw new Error('Unsupported backup version. This app supports version 1.')
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) throw new Error('The backup is missing required fields or contains invalid data.')
  const data = parsed.data
  const ids = [data.subjects, data.papers, data.attempts, data.questionAttempts]
  if (ids.some(rows => !unique(rows.map(row => row.id)))) throw new Error('Backup contains duplicate record IDs.')
  const subjects = new Set(data.subjects.map(s => s.id))
  const papers = new Set(data.papers.map(p => p.id))
  const attempts = new Map(data.attempts.map(a => [a.id, a]))
  if (!unique(data.subjects.map(s => `${s.name.trim().toLowerCase()}|${s.level}`))) throw new Error('Backup contains duplicate subjects.')
  if (!unique(data.papers.map(p => paperKey(p)))) throw new Error('Backup contains duplicate papers.')
  if (data.papers.some(p => !subjects.has(p.subjectId) || p.identityKey !== paperKey(p))) throw new Error('Backup has an invalid paper or paper identity.')
  if (data.attempts.some(a => !papers.has(a.paperId) || (a.type === 'FULL' ? a.score === null || a.maxMarks === null || !validMarks(a.score, a.maxMarks) : a.score !== null || a.maxMarks !== null))) throw new Error('Backup has an invalid attempt.')
  if (data.questionAttempts.some(q => attempts.get(q.attemptId)?.type !== 'PARTIAL' || !validMarks(q.score, q.maxMarks) || normalizeQuestion(q.questionLabel) !== q.questionLabel)) throw new Error('Backup has an invalid question record.')
  if (!unique(data.questionAttempts.map(q => `${q.attemptId}|${q.questionLabel.toLowerCase()}`))) throw new Error('Backup contains duplicate question labels.')
  const qCounts = new Map<string, number>()
  for (const q of data.questionAttempts) qCounts.set(q.attemptId, (qCounts.get(q.attemptId) || 0) + 1)
  if (data.attempts.some(a => a.type === 'PARTIAL' && !qCounts.get(a.id))) throw new Error('Backup contains a partial attempt with no questions.')
  const papersWithAttempts = new Set(data.attempts.map(a => a.paperId))
  if (data.papers.some(p => !papersWithAttempts.has(p.id))) throw new Error('Backup contains a paper without attempts.')
  if (data.draft && data.draft.subjectId && !subjects.has(data.draft.subjectId)) throw new Error('Backup draft references a missing subject.')
  return data
}
export const collectBackup = async (): Promise<Backup> => ({
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  subjects: await db.subjects.toArray(),
  papers: await db.papers.toArray(),
  attempts: await db.attempts.toArray(),
  questionAttempts: await db.questionAttempts.toArray(),
  draft: await loadDraft(),
  preferences: await db.preferences.get('main') || defaultPrefs
})
export const restoreBackup = async (data: Backup) => {
  const valid = validateBackup(data)
  await db.transaction('rw', [db.subjects, db.papers, db.attempts, db.questionAttempts, db.drafts, db.preferences], async () => {
    await Promise.all([db.subjects.clear(), db.papers.clear(), db.attempts.clear(), db.questionAttempts.clear(), db.drafts.clear(), db.preferences.clear()])
    if (valid.subjects.length) await db.subjects.bulkAdd(valid.subjects)
    if (valid.papers.length) await db.papers.bulkAdd(valid.papers)
    if (valid.attempts.length) await db.attempts.bulkAdd(valid.attempts)
    if (valid.questionAttempts.length) await db.questionAttempts.bulkAdd(valid.questionAttempts)
    if (valid.draft) await db.drafts.put(valid.draft as LogDraft)
    await db.preferences.put(valid.preferences as Preferences)
  })
  try {
    if (valid.draft) localStorage.setItem('paperLoggerDraft', JSON.stringify(valid.draft))
    else localStorage.removeItem('paperLoggerDraft')
  } catch { /* primary copy restored */ }
}
export const download = (name: string, contents: string, mime: string) => {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
export const serializeCsv = (data: Backup) => {
  const fields = ['subject', 'level', 'year', 'session', 'paperType', 'variant', 'timezone', 'attemptDate', 'attemptType', 'questionLabel', 'score', 'maxMarks', 'percentage', 'notes']
  const subjects = new Map(data.subjects.map(s => [s.id, s]))
  const papers = new Map(data.papers.map(p => [p.id, p]))
  const questions = new Map<string, typeof data.questionAttempts>()
  for (const q of data.questionAttempts) questions.set(q.attemptId, [...questions.get(q.attemptId) || [], q])
  const rows = data.attempts.flatMap(a => {
    const p = papers.get(a.paperId), s = p && subjects.get(p.subjectId)
    if (!p) return []
    const qs = a.type === 'FULL' ? [null] : questions.get(a.id) || []
    return qs.map(q => [s?.name, s?.level, p.year, p.session, p.paperType, p.variant, p.timezone, a.attemptedAt, a.type, q?.questionLabel, q?.score ?? a.score, q?.maxMarks ?? a.maxMarks, (q ? q.score / q.maxMarks : (a.score ?? 0) / (a.maxMarks || 1)) * 100, q?.notes || a.notes].map(csvEscape).join(','))
  })
  return [fields.join(','), ...rows].join('\r\n')
}
