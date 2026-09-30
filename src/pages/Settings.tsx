import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileJson, FileSpreadsheet, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { db, defaultPrefs, addSubject, updatePrefs } from '../db'
import { collectBackup, download, restoreBackup, serializeCsv, validateBackup } from '../lib/backup'
import { today } from '../lib/logic'
import type { Backup, Subject } from '../types'
import { Button, Field, Input, Modal, PageHead, Select } from '../components/ui'
import { toast } from '../App'
import './settings.css'

export default function Settings() {
  const data = useLiveQuery(async () => ({ subjects: await db.subjects.orderBy('name').toArray(), papers: await db.papers.toArray(), attempts: await db.attempts.toArray(), prefs: await db.preferences.get('main') || defaultPrefs }), [])
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)
  const [removing, setRemoving] = useState<Subject | null>(null)
  const [restore, setRestore] = useState<Backup | null>(null)
  const [importError, setImportError] = useState('')
  const [clearOpen, setClearOpen] = useState(false)
  const [deleteWord, setDeleteWord] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  if (!data) return <div className="muted">Loading settings…</div>
  const exportJson = async () => { try { const backup = await collectBackup(); download(`ib-past-paper-backup-${today()}.json`, JSON.stringify(backup, null, 2), 'application/json'); toast('JSON backup exported') } catch (e) { setImportError(e instanceof Error ? e.message : 'Backup export failed.') } }
  const exportCsv = async () => { try { const backup = await collectBackup(); download(`ib-past-paper-attempts-${today()}.csv`, serializeCsv(backup), 'text/csv;charset=utf-8'); toast('CSV exported') } catch (e) { setImportError(e instanceof Error ? e.message : 'CSV export failed.') } }
  const importFile = async (file?: File) => {
    if (!file) return
    setImportError('')
    try { setRestore(validateBackup(JSON.parse(await file.text()))) } catch (e) { setImportError(e instanceof Error ? e.message : 'Could not read backup file.') }
    if (fileRef.current) fileRef.current.value = ''
  }
  const doRestore = async () => {
    if (!restore) return
    try { await restoreBackup(restore); toast('Backup restored'); window.location.href = restore.draft ? '/log' : '/settings' }
    catch (e) { setImportError(e instanceof Error ? e.message : 'Restore failed. Your existing data was preserved.'); setRestore(null) }
  }
  const doRemove = async () => {
    if (!removing || data.papers.some(p => p.subjectId === removing.id)) return
    await db.subjects.delete(removing.id); setRemoving(null); toast('Subject removed')
  }
  const clearAll = async () => {
    if (deleteWord !== 'DELETE') return
    await db.transaction('rw', [db.subjects, db.papers, db.attempts, db.questionAttempts, db.drafts, db.preferences], async () => {
      await db.subjects.clear(); await db.papers.clear(); await db.attempts.clear(); await db.questionAttempts.clear(); await db.drafts.clear(); await db.preferences.clear()
    })
    try { localStorage.removeItem('paperLoggerDraft') } catch { /* ignore */ }
    setClearOpen(false); setDeleteWord(''); toast('All local data cleared')
  }
  return <>
    <PageHead eyebrow="PREFERENCES & DATA" title="Settings" detail="Manage your subjects, appearance, and local backups."/>
    <div className="settings-stack">
      <section className="panel panel-pad"><div className="section-head"><div><h2>Appearance</h2><p>Choose a comfortable theme for your workspace.</p></div></div><div className="theme-options">{(['light', 'dark', 'system'] as const).map(theme => <button key={theme} className={`theme-option ${data.prefs.theme === theme ? 'selected' : ''}`} onClick={() => updatePrefs({ theme })}><span className={`theme-swatch ${theme}`}/><b>{theme[0].toUpperCase() + theme.slice(1)}</b><small>{theme === 'system' ? 'Follow this device' : `${theme[0].toUpperCase() + theme.slice(1)} appearance`}</small></button>)}</div></section>
      <section className="panel panel-pad"><div className="section-head"><div><h2>Subjects</h2><p>Add the subjects that you actually study. No preset list.</p></div><Button variant="secondary" onClick={() => setEditing('new')}><Plus size={15}/> Add Subject</Button></div>
        {!data.subjects.length ? <p className="text-sm muted py-5">No subjects yet. Add one to start logging attempts.</p> : <div className="subject-list">{data.subjects.map(s => { const paperCount = data.papers.filter(p => p.subjectId === s.id).length; return <div className="subject-row" key={s.id}><div className="subject-initial">{s.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><b className="text-sm">{s.name} <span className="text-xs" style={{ color: 'var(--accent)' }}>{s.level}</span></b><div className="text-xs muted mt-1">{s.shortName && `${s.shortName} · `}{paperCount} {paperCount === 1 ? 'paper' : 'papers'}</div></div><Button variant="quiet" onClick={() => setEditing(s)}>Edit</Button><button className="icon-button" aria-label={`Remove ${s.name}`} onClick={() => setRemoving(s)}><Trash2 size={16}/></button></div> })}</div>}</section>
      <section className="panel panel-pad"><div className="section-head"><div><h2>Backup & export</h2><p>JSON preserves everything. CSV is a readable attempt list.</p></div></div><div className="data-actions"><Button onClick={exportJson}><FileJson size={16}/> Export JSON backup</Button><Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={16}/> Import backup</Button><Button variant="secondary" onClick={exportCsv}><FileSpreadsheet size={16}/> Export CSV</Button><input ref={fileRef} className="hidden" type="file" accept=".json,application/json" onChange={e => importFile(e.target.files?.[0])}/></div>{importError && <p className="field-error mt-3" role="alert">{importError}</p>}<div className="privacy-note"><ShieldCheck size={17}/><span>Your data is stored locally on this device and is not sent to a server. Export a JSON backup regularly.</span></div></section>
      <section className="panel panel-pad danger-zone"><div><h2>Clear all data</h2><p>Remove every subject, paper, attempt, question, draft, and preference from this device.</p></div><Button variant="secondary" onClick={() => setClearOpen(true)}><Trash2 size={15}/> Clear All Data</Button></section>
    </div>
    {editing && <SubjectEditor subject={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}/>}
    {removing && <Modal title={`Remove ${removing.name}?`} onClose={() => setRemoving(null)}>{data.papers.some(p => p.subjectId === removing.id) ? <p className="text-sm muted">This subject has {data.papers.filter(p => p.subjectId === removing.id).length} linked papers. Delete their attempts first; the subject is protected while it has history.</p> : <p className="text-sm muted">This subject has no papers and can be removed safely.</p>}<div className="modal-actions"><Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" disabled={data.papers.some(p => p.subjectId === removing.id)} onClick={doRemove}>Remove subject</Button></div></Modal>}
    {restore && <Modal title="Restore JSON backup?" onClose={() => setRestore(null)}><p className="text-sm muted">This will replace all current local data with the backup. Export your current data first if you want to keep it.</p><div className="restore-counts"><div><b>{restore.subjects.length}</b><span>Subjects</span></div><div><b>{restore.papers.length}</b><span>Papers</span></div><div><b>{restore.attempts.length}</b><span>Attempts</span></div><div><b>{restore.questionAttempts.length}</b><span>Questions</span></div></div><p className="text-xs muted">Unfinished draft: <b>{restore.draft ? 'Included — ready to resume' : 'None'}</b></p><div className="modal-actions"><Button variant="secondary" onClick={() => setRestore(null)}>Cancel</Button><Button onClick={doRestore}>Replace and restore</Button></div></Modal>}
    {clearOpen && <Modal title="Clear all local data?" onClose={() => setClearOpen(false)}><p className="text-sm muted">This permanently removes {data.subjects.length} {data.subjects.length === 1 ? 'subject' : 'subjects'}, {data.papers.length} {data.papers.length === 1 ? 'paper' : 'papers'}, and {data.attempts.length} {data.attempts.length === 1 ? 'attempt' : 'attempts'} from this device. Export a backup first if needed.</p><Field label="Type DELETE to confirm" className="mt-5"><Input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} autoComplete="off"/></Field><div className="modal-actions"><Button variant="secondary" onClick={() => setClearOpen(false)}>Cancel</Button><Button variant="danger" disabled={deleteWord !== 'DELETE'} onClick={clearAll}>Clear all data</Button></div></Modal>}
  </>
}
function SubjectEditor({ subject, onClose }: { subject?: Subject; onClose: () => void }) {
  const [name, setName] = useState(subject?.name || '')
  const [level, setLevel] = useState<'HL' | 'SL'>(subject?.level || 'HL')
  const [shortName, setShortName] = useState(subject?.shortName || '')
  const [error, setError] = useState('')
  const save = async () => { try { await addSubject({ name, level, shortName }, subject?.id); toast(subject ? 'Subject updated' : 'Subject added'); onClose() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save subject.') } }
  return <Modal title={subject ? 'Edit subject' : 'Add subject'} onClose={onClose}><div className="flex flex-col gap-4"><Field label="Subject name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Physics" autoFocus/></Field><Field label="Level"><Select value={level} onChange={e => setLevel(e.target.value as 'HL' | 'SL')}><option value="HL">HL</option><option value="SL">SL</option></Select></Field><Field label="Short name" hint="Optional"><Input value={shortName} onChange={e => setShortName(e.target.value)} placeholder="e.g. Math AA"/></Field></div>{error && <p className="field-error mt-3">{error}</p>}<div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save subject</Button></div></Modal>
}
