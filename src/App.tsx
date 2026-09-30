import { lazy, Suspense, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LayoutDashboard, Library, LineChart, Plus, Settings2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, defaultPrefs, updatePrefs } from './db'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const LogAttempt = lazy(() => import('./pages/LogAttempt'))
const Papers = lazy(() => import('./pages/Papers'))
const PaperDetail = lazy(() => import('./pages/PaperDetail'))
const Progress = lazy(() => import('./pages/Progress'))
const Settings = lazy(() => import('./pages/Settings'))

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/log', label: 'Log Attempt', icon: Plus },
  { to: '/papers', label: 'Past Papers', icon: Library },
  { to: '/progress', label: 'Progress', icon: LineChart }
]
export default function App() {
  const prefs = useLiveQuery(() => db.preferences.get('main'), []) || defaultPrefs
  const location = useLocation()
  const [toast, setToast] = useState('')
  useEffect(() => {
    const announce = (e: Event) => { setToast((e as CustomEvent<string>).detail); setTimeout(() => setToast(''), 4500) }
    window.addEventListener('app-toast', announce)
    return () => window.removeEventListener('app-toast', announce)
  }, [])
  useEffect(() => {
    const apply = () => document.documentElement.dataset.theme = prefs.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : prefs.theme
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [prefs.theme])
  useEffect(() => { document.title = `${location.pathname === '/' ? 'Dashboard' : location.pathname.startsWith('/papers') ? 'Past Papers' : location.pathname === '/log' ? 'Log Attempt' : location.pathname === '/progress' ? 'Progress' : 'Settings'} · Past Paper Logger` }, [location])
  return <div className={`app-shell ${prefs.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span>▤</span></div>{!prefs.sidebarCollapsed && <div><b>PAST PAPER</b><span>LOGGER</span></div>}</div>
      <div className="side-section-label">{!prefs.sidebarCollapsed && 'WORKSPACE'}</div>
      <nav className="nav">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} end={to === '/'} to={to} title={label} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''} ${to === '/log' ? 'nav-log' : ''}`}><Icon size={18} strokeWidth={1.8}/>{!prefs.sidebarCollapsed && <span>{label}</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><NavLink to="/settings" title="Settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Settings2 size={18} strokeWidth={1.8}/>{!prefs.sidebarCollapsed && <span>Settings</span>}</NavLink>
        <button className="nav-link collapse" onClick={() => updatePrefs({ sidebarCollapsed: !prefs.sidebarCollapsed })} title={prefs.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{prefs.sidebarCollapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/ >}{!prefs.sidebarCollapsed && <span>Collapse sidebar</span>}</button>
        {!prefs.sidebarCollapsed && <div className="side-note">Private by design.<br/>Stored on this device.</div>}
      </div>
    </aside>
    <main className="main"><div className="main-inner"><Suspense fallback={<div className="muted">Loading page…</div>}><Routes>
      <Route path="/" element={<Dashboard/>}/>
      <Route path="/log" element={<LogAttempt/>}/>
      <Route path="/papers" element={<Papers/>}/>
      <Route path="/papers/:paperId" element={<PaperDetail/>}/>
      <Route path="/progress" element={<Progress/>}/>
      <Route path="/settings" element={<Settings/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes></Suspense></div></main>
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}
export const toast = (message: string) => window.dispatchEvent(new CustomEvent('app-toast', { detail: message }))
