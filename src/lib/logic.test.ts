import { describe, expect, it } from 'vitest'
import { compareQuestions, normalizeQuestion, parseQuestions } from './parser'
import { fmtPct, paperKey, paperStatus, validDate, validMarks, weighted } from './logic'
import { validateBackup } from './backup'
import type { Attempt, Backup } from '../types'

describe('question parser', () => {
  it('splits messy common separators', () => {
    expect(parseQuestions('1,2,3A and 3B, 4E')).toEqual(['1', '2', '3A', '3B', '4E'])
    expect(parseQuestions('1 2 3a & 3b; 4e')).toEqual(['1', '2', '3A', '3B', '4E'])
    expect(parseQuestions('1\n2\n3A\n3B')).toEqual(['1', '2', '3A', '3B'])
  })
  it('normalizes structured labels and deduplicates', () => {
    expect(parseQuestions('3(a)(ii), 3(a)(i), 3(b), 3(a)(ii)')).toEqual(['3(a)(i)', '3(a)(ii)', '3(b)'])
    expect(normalizeQuestion(' 03(A)(II) ')).toBe('3(a)(ii)')
  })
  it('sorts numeric parts naturally', () => {
    expect(parseQuestions('1; 2; 10; 3')).toEqual(['1', '2', '3', '10'])
    expect(compareQuestions('3A', '3B')).toBeLessThan(0)
  })
  it('never invents invalid labels', () => {
    expect(parseQuestions('and, &, ; ???')).toEqual([])
  })
})

describe('calculations and paper identity', () => {
  it('validates marks and safe percentages', () => {
    expect(validMarks(4, 6)).toBe(true)
    expect(validMarks(7, 6)).toBe(false)
    expect(validMarks(0, 0)).toBe(false)
    expect(fmtPct(0, 0)).toBe('—')
    expect(weighted([{ score: 1, maxMarks: 2 }, { score: 9, maxMarks: 10 }])).toBeCloseTo(83.3333)
  })
  it('derives full status even if partial attempts exist', () => {
    const make = (type: 'FULL' | 'PARTIAL'): Attempt => ({ id: type, paperId: 'p', type, attemptedAt: '2026-09-29', score: type === 'FULL' ? 5 : null, maxMarks: type === 'FULL' ? 10 : null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    expect(paperStatus([make('PARTIAL')])).toBe('Partial')
    expect(paperStatus([make('PARTIAL'), make('FULL')])).toBe('Full')
  })
  it('keeps local calendar dates and normalizes identities', () => {
    expect(validDate('2026-02-30')).toBe(false)
    expect(validDate('2026-09-29')).toBe(true)
    const p = { subjectId: 's', year: 2024, session: 'May', paperType: 'Paper 1', variant: ' 2 ', timezone: 'TZ2' }
    expect(paperKey(p)).toBe(paperKey({ ...p, session: ' may ', paperType: 'paper 1', variant: '2', timezone: 'tz2' }))
  })
})

describe('backup validation', () => {
  const stamp = '2026-09-29T12:00:00.000Z'
  const subject = { id: 's', name: 'Physics', level: 'HL' as const, createdAt: stamp, updatedAt: stamp }
  const paper = { id: 'p', subjectId: 's', year: 2024, session: 'May', paperType: 'Paper 1', identityKey: paperKey({ subjectId: 's', year: 2024, session: 'May', paperType: 'Paper 1' }), createdAt: stamp, updatedAt: stamp }
  const attempt = { id: 'a', paperId: 'p', type: 'FULL' as const, attemptedAt: '2026-09-29', score: 8, maxMarks: 10, createdAt: stamp, updatedAt: stamp }
  const backup: Backup = { schemaVersion: 1, exportedAt: stamp, subjects: [subject], papers: [paper], attempts: [attempt], questionAttempts: [], draft: null, preferences: { id: 'main', theme: 'system', browseSort: 'recent', browseGroup: 'subject', sidebarCollapsed: false } }
  it('accepts a consistent backup', () => expect(validateBackup(backup).papers).toHaveLength(1))
  it('rejects orphaned and invalid score records', () => {
    expect(() => validateBackup({ ...backup, attempts: [{ ...attempt, paperId: 'missing' }] })).toThrow()
    expect(() => validateBackup({ ...backup, attempts: [{ ...attempt, score: 11 }] })).toThrow()
  })
  it('rejects unknown schema versions and duplicate identities', () => {
    expect(() => validateBackup({ ...backup, schemaVersion: 2 })).toThrow()
    expect(() => validateBackup({ ...backup, papers: [paper, { ...paper, id: 'p2' }] })).toThrow()
  })
})
