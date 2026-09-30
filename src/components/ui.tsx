import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { X } from 'lucide-react'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  return <button {...props} className={`btn btn-${variant} ${className}`} />
}
export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}{error && <span className="field-error">{error}</span>}</label>
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`input ${props.className || ''}`} /> }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`input ${props.className || ''}`} /> }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`input ${props.className || ''}`} /> }
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'green' | 'amber' | 'neutral' }) { return <span className={`pill pill-${tone}`}>{children}</span> }
export function Empty({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) { return <div className="empty"><div className="empty-icon">□</div><h3>{title}</h3>{detail && <p>{detail}</p>}{action && <div className="mt-5">{action}</div>}</div> }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement
    const root = dialogRef.current
    const focusables = () => [...root?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || []]
    ;(root?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || focusables()[0])?.focus()
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keys)
    return () => { document.removeEventListener('keydown', keys); if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section ref={dialogRef} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18}/></button></div>
      {children}
    </section>
  </div>
}
export function PageHead({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="page-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action && <div className="page-action">{action}</div>}</div>
}
export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) { return <div className="stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div> }
