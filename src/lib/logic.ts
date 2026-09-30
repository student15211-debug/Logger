import type { Attempt, Paper, QuestionAttempt, Subject } from '../types'

export const uid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const validDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [year, month, day] = s.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
export const dateLabel = (s?: string, short = false) => {
  if (!s || !validDate(s)) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: short ? 'short' : 'long', year: 'numeric' }).format(new Date(`${s}T12:00:00`))
}
export const pct = (score: number, max: number) => max > 0 ? score / max * 100 : null
export const fmtPct = (score: number, max: number) => {
  const value = pct(score, max)
  return value === null ? '—' : `${value.toFixed(1)}%`
}
export const weighted = (rows: { score: number; maxMarks: number }[]) => pct(rows.reduce((n, r) => n + r.score, 0), rows.reduce((n, r) => n + r.maxMarks, 0))
export const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
export const paperKey = (p: Pick<Paper, 'subjectId' | 'year' | 'session' | 'paperType' | 'variant' | 'timezone'>) =>
  [p.subjectId, p.year, p.session, p.paperType, p.variant || '', p.timezone || ''].map(String).map(norm).join('|')
export const paperTitle = (p: Paper) => [`${p.session} ${p.year}`, p.paperType, p.timezone, p.variant && (/^variant\b/i.test(p.variant) ? p.variant : `Variant ${p.variant}`)].filter(Boolean).join(' · ')
export const subjectTitle = (s?: Subject) => s ? `${s.name} ${s.level}` : 'Unknown subject'
export const validMarks = (score: number, max: number) => Number.isFinite(score) && Number.isFinite(max) && score >= 0 && max > 0 && score <= max
export const attemptMarks = (a: Attempt, questions: QuestionAttempt[]) => a.type === 'FULL'
  ? { score: a.score ?? 0, maxMarks: a.maxMarks ?? 0 }
  : questions.filter(q => q.attemptId === a.id).reduce((sum, q) => ({ score: sum.score + q.score, maxMarks: sum.maxMarks + q.maxMarks }), { score: 0, maxMarks: 0 })
export const paperStatus = (attempts: Attempt[]) => attempts.some(a => a.type === 'FULL') ? 'Full' : attempts.length ? 'Partial' : null
export const bestFull = (attempts: Attempt[]) => attempts.filter(a => a.type === 'FULL' && a.score !== null && a.maxMarks !== null)
  .sort((a, b) => (pct(b.score!, b.maxMarks!) ?? -1) - (pct(a.score!, a.maxMarks!) ?? -1))[0]
export const latestAttempt = (attempts: Attempt[]) => [...attempts].sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt) || b.createdAt.localeCompare(a.createdAt))[0]
export const scoreText = (score: number, max: number) => `${score} / ${max}`
