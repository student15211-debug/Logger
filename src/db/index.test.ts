import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addSubject, db, deleteAttempt, editPaper, saveAttempt } from './index'

describe('paper and attempt integrity', () => {
  beforeEach(async () => {
    await db.transaction('rw', [db.subjects, db.papers, db.attempts, db.questionAttempts, db.drafts, db.preferences], async () => {
      await db.questionAttempts.clear()
      await db.attempts.clear()
      await db.papers.clear()
      await db.subjects.clear()
      await db.drafts.clear()
      await db.preferences.clear()
    })
  })
  afterAll(() => db.close())
  it('reuses a paper identity while preserving separate attempts and cleans child records', async () => {
    const s = await addSubject({ name: 'Physics', level: 'HL' })
    const paper = { subjectId: s.id, year: 2024, session: 'May', paperType: 'Paper 1', timezone: 'TZ2' }
    const firstId = await saveAttempt({ paper, attempt: { type: 'FULL', attemptedAt: '2026-09-20', score: 58, maxMarks: 80 }, questions: [] })
    const secondId = await saveAttempt({ paper: { ...paper, session: 'may', paperType: 'paper 1', timezone: 'tz2' }, attempt: { type: 'PARTIAL', attemptedAt: '2026-09-29', score: null, maxMarks: null }, questions: [{ questionLabel: '3(a)(ii)', score: 4, maxMarks: 6, notes: 'Check sign' }] })
    expect(secondId).toBe(firstId)
    expect(await db.papers.count()).toBe(1)
    expect(await db.attempts.count()).toBe(2)
    const attempts = await db.attempts.toArray()
    const partialId = attempts.find(a => a.type === 'PARTIAL')!.id
    await deleteAttempt(partialId)
    expect(await db.questionAttempts.count()).toBe(0)
    expect(await db.papers.count()).toBe(1)
    await deleteAttempt(attempts.find(a => a.type === 'FULL')!.id)
    expect(await db.papers.count()).toBe(0)
  })
  it('prevents paper edits that duplicate another identity', async () => {
    const s = await addSubject({ name: 'Chemistry', level: 'SL' })
    const base = { subjectId: s.id, session: 'November', paperType: 'Paper 2', timezone: 'TZ1' }
    await saveAttempt({ paper: { ...base, year: 2023 }, attempt: { type: 'FULL', attemptedAt: '2026-09-20', score: 10, maxMarks: 20 }, questions: [] })
    const second = await saveAttempt({ paper: { ...base, year: 2024 }, attempt: { type: 'FULL', attemptedAt: '2026-09-21', score: 12, maxMarks: 20 }, questions: [] })
    await expect(editPaper(second, { ...base, year: 2023 })).rejects.toThrow(/already exists/)
    expect(await db.papers.count()).toBe(2)
  })
})
