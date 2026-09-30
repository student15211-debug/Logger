import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/restore-v1.json'
import { db } from '../db'
import { collectBackup, restoreBackup, serializeCsv, validateBackup } from './backup'

describe('IndexedDB backup round trip', () => {
  beforeEach(async () => {
    await db.transaction('rw', [db.subjects, db.papers, db.attempts, db.questionAttempts, db.drafts, db.preferences], async () => {
      await db.subjects.clear()
      await db.papers.clear()
      await db.attempts.clear()
      await db.questionAttempts.clear()
      await db.drafts.clear()
      await db.preferences.clear()
    })
  })
  afterAll(() => db.close())
  it('restores linked records, preferences, and an unfinished draft', async () => {
    const backup = validateBackup(fixture)
    await restoreBackup(backup)
    const exported = await collectBackup()
    expect(exported.subjects).toHaveLength(1)
    expect(exported.papers).toHaveLength(1)
    expect(exported.attempts).toHaveLength(2)
    expect(exported.questionAttempts).toHaveLength(2)
    expect(exported.draft?.step).toBe('marks')
    expect(exported.draft?.questions[0].notes).toBe('Better this time.')
    expect(exported.preferences.theme).toBe('dark')
  })
  it('keeps existing records when an import fails validation', async () => {
    await restoreBackup(validateBackup(fixture))
    await expect(restoreBackup({ ...validateBackup(fixture), attempts: [] })).rejects.toThrow()
    expect(await db.attempts.count()).toBe(2)
    expect(await db.questionAttempts.count()).toBe(2)
  })
  it('serializes readable CSV with question notes', () => {
    const csv = serializeCsv(validateBackup(fixture))
    expect(csv).toContain('"3(a)(ii)","4","6"')
    expect(csv).toContain('"Check the domain."')
    expect(csv).toContain('"FULL",""')
  })
})
