import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Rocket, Radar, Network, ClipboardList, FlaskConical, ShieldAlert, BadgeDollarSign, SlidersHorizontal, BookOpen, Bell, AlertTriangle, AlertOctagon, Info, X, CheckCheck,
} from 'lucide-react';
import { useStore } from '../state/store';
import { fmt, toDay } from '../engine/dates';
import type { Severity } from '../engine/alerts';

export const NAV = [
  { to: '/', label: 'Getting Started', icon: Rocket, section: 'Start' },
  { to: '/control-tower', label: 'Control Tower', icon: Radar, section: 'Operate' },
  { to: '/twin', label: 'Digital Twin', icon: Network, section: 'Operate' },
  { to: '/planning', label: 'Planning & POs', icon: ClipboardList, section: 'Operate' },
  { to: '/scenarios', label: 'What-If Scenarios', icon: FlaskConical, section: 'Decide' },
  { to: '/exceptions', label: 'Exceptions & Fixes', icon: ShieldAlert, section: 'Decide' },
  { to: '/pricing', label: 'Pricing & LTA', icon: BadgeDollarSign, section: 'Decide' },
  { to: '/data', label: 'Data & Settings', icon: SlidersHorizontal, section: 'Configure' },
  { to: '/assumptions', label: 'Assumptions & Processes', icon: BookOpen, section: 'Configure' },
];

export const sevIcon = (s: Severity, size = 15) => (s === 'critical' ? <AlertOctagon size={size} /> : s === 'warning' ? <AlertTriangle size={size} /> : <Info size={size} />);
const sevColor: Record<Severity, string> = { critical: '#e60177', warning: '#f0a000', info: '#0077c8' };

function Bellbox() {
  const { notes, markAllRead, clearNotes } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const unread = notes.filter((n) => !n.read).length;
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="bell" ref={ref} style={{ position: 'relative' }}>
      <button className="btn" aria-label="Notifications" onClick={() => setOpen((o) => !o)}><Bell size={16} />{unread > 0 && <span className="badge">{unread}</span>}</button>
      {open && (
        <div className="dropdown">
          <div className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <b>Notifications</b><span style={{ flex: 1 }} />
            <button className="btn sm ghost" onClick={markAllRead}><CheckCheck size={14} /> Mark read</button>
            <button className="btn sm ghost" onClick={clearNotes}>Clear</button>
          </div>
          {!notes.length && <div className="empty">No notifications</div>}
          {notes.map((n) => (
            <div key={n.id} className="alert" style={{ cursor: 'pointer', opacity: n.read ? 0.65 : 1 }} onClick={() => { setOpen(false); nav(n.page); }}>
              <div className={`alert-ic ${n.severity}`}>{sevIcon(n.severity)}</div>
              <div>
                <div className="alert-title">{n.title}</div>
                <div className="alert-detail">{n.detail}</div>
                <div className="tiny muted">{new Date(n.time).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className="t-bar" style={{ background: sevColor[t.severity] }} />
          <div style={{ flex: 1 }}>
            <div className="t-title">{t.title}</div>
            <div className="t-body">{t.detail}</div>
          </div>
          <button className="btn ghost sm" style={{ color: '#9aa6b8' }} aria-label="Dismiss" onClick={() => dismissToast(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { scenarios, activeId, setActiveId, data } = useStore();
  const loc = useLocation();
  const page = NAV.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)));
  let lastSection = '';
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SR</div>
          <div><div className="brand-name">AI-Powered<br />Supply Response</div><div className="brand-sub">Digital twin · control tower</div></div>
        </div>
        <nav className="nav">
          {NAV.map((n) => {
            const head = n.section !== lastSection ? <div className="nav-section">{n.section}</div> : null;
            lastSection = n.section;
            return (
              <div key={n.to}>
                {head}
                <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}><n.icon size={17} />{n.label}</NavLink>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">Academic prototype with fictional data. Colour palette inspired by Micron; not affiliated with or endorsed by Micron Technology.</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{page?.label ?? 'AI-Powered Supply Response'}</h1>
          <span className="spacer" />
          <span className="chip" title="Plan date (edit in Data & Settings)">Plan date {fmt(toDay(data.params.planDate))}</span>
          <label className="row small" style={{ gap: 6 }}>
            <span className="muted">Scenario</span>
            <select className="input" style={{ padding: '6px 8px' }} value={activeId ?? ''} onChange={(e) => setActiveId(e.target.value || null)} aria-label="Active scenario">
              <option value="">Baseline</option>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
            </select>
          </label>
          <Bellbox />
        </header>
        <main className="content">{children}</main>
      </div>
      <Toasts />
    </div>
  );
}
