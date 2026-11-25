import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import NotificationBell from './NotificationBell'
import { Icon, LangSwitch, RoleBadge } from './ui'

export default function Layout({ children }) {
  const { t } = useT()
  const { profile, can, signOut } = useAuth()
  const canMembers = can('members')
  const [pending, setPending] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => setMenuOpen(false), [loc.pathname])

  useEffect(() => {
    if (!canMembers) return
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setPending(count || 0))
  }, [canMembers, loc.pathname])

  const nav = [
    { to: '/', icon: 'home', label: t('nav.dashboard'), end: true },
    { to: '/schedule', icon: 'calendar', label: t('nav.schedule') },
    { to: '/polls', icon: 'poll', label: t('nav.polls') },
    { to: '/training', icon: 'dumbbell', label: t('nav.training') },
    { to: '/files', icon: 'folder', label: t('nav.files') },
    can('attendance') && { to: '/attendance', icon: 'check', label: t('nav.attendance') },
    can('foreign') && { to: '/foreign', icon: 'globe', label: t('nav.foreign'), admin: true },
    (can('settings') || canMembers) && { to: '/admin', icon: 'settings', label: t('nav.admin'), admin: true, count: pending },
  ].filter(Boolean)

  const mobileMain = nav.slice(0, 4)

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src="/logo-wide.png" alt="PWS" />
          <span className="brand-sub">Portal</span>
          <span className="brand-bell"><NotificationBell /></span>
        </div>
        <nav className="nav">
          {nav.map((n, i) => (
            <div key={n.to}>
              {n.admin && !nav[i - 1]?.admin && <div className="nav-section">{t('nav.adminSection')}</div>}
              <NavLink to={n.to} end={n.end} className="nav-item">
                <Icon name={n.icon} /> <span>{n.label}</span>
                {n.count > 0 && <span className="nav-count">{n.count}</span>}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <LangSwitch compact />
          <NavLink to="/me" className="me-link">
            <div className="avatar">{(profile.display_name || '?').slice(0, 1)}</div>
            <div className="me-meta">
              <strong>{profile.display_name}</strong>
              <RoleBadge role={profile.role} />
            </div>
          </NavLink>
          <button className="btn ghost small light" onClick={signOut}><Icon name="logout" size={16} /> {t('auth.signOut')}</button>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="menu"><Icon name="menu" /></button>
          <img className="brand-logo small" src="/logo-wide.png" alt="PWS" />
          <span className="topbar-right"><NotificationBell /><LangSwitch compact /></span>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="bottom-nav">
        {mobileMain.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="bn-item">
            <Icon name={n.icon} size={20} /><span>{n.label}</span>
          </NavLink>
        ))}
        <NavLink to="/me" className="bn-item"><Icon name="user" size={20} /><span>{t('nav.me')}</span></NavLink>
      </nav>
    </div>
  )
}
