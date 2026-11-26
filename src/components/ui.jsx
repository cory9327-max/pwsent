import { useEffect, useRef } from 'react'
import { LANGS, useT } from '../lib/i18n'
import { useTypes } from '../lib/types'
import { BUILTIN_ROLE_KEYS, useAuth } from '../lib/auth'

const PATHS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  poll: 'M5 20V10M12 20V4M19 20v-7',
  dumbbell: 'M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12',
  check: 'M4 12l5 5L20 6',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  user: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  close: 'M6 6l12 12M18 6L6 18',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0',
  lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
  settings: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4M14 4v4M6 10v4M12 16v4',
  chevU: 'M6 15l6-6 6 6',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  upload: 'M12 20V8M7 13l5-5 5 5M4 4h16',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
}

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Modal({ title, onClose, children, wide }) {
  // onClose 는 화면이 다시 그려질 때마다 새로 만들어지므로, 고정/해제가 반복되지 않게 따로 보관
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', k)
    // 창이 떠 있는 동안 뒤 화면이 대신 스크롤되지 않게 고정 (아이폰은 overflow 만으로는 막히지 않음)
    const y = window.scrollY
    const b = document.body.style
    const locked = document.body.dataset.modalLock === '1' // 창 위에 창이 뜬 경우에는 바깥 창이 이미 고정함
    if (!locked) {
      document.body.dataset.modalLock = '1'
      b.position = 'fixed'; b.top = `-${y}px`; b.left = '0'; b.right = '0'; b.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', k)
      if (!locked) {
        delete document.body.dataset.modalLock
        b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.overflow = ''
        window.scrollTo(0, y)
      }
    }
  }, [])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close"><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function TypeBadge({ type, kind, tentative, locked }) {
  const { t } = useT()
  const { label, color } = useTypes()
  return (
    <span className={`badge type-chip ${tentative ? 'tentative' : ''}`} style={{ '--c': color(type) }}>
      {locked && <Icon name="lock" size={11} />}{label(type)}{kind ? ` · ${kind}` : ''}{tentative ? ` · ${t('wk.recruiting')}` : ''}
    </span>
  )
}

export function useRoleLabel() {
  const { t } = useT()
  const { roleInfo } = useAuth()
  return (key) => roleInfo(key)?.name || (BUILTIN_ROLE_KEYS.includes(key) ? t(`role.${key}`) : key)
}

export function RoleBadge({ role }) {
  const { roleInfo } = useAuth()
  const label = useRoleLabel()
  return <span className="badge type-chip" style={{ '--c': roleInfo(role)?.color || '#5c5f66' }}>{label(role)}</span>
}

export function StatusPill({ status }) {
  const { t } = useT()
  return <span className={`pill att-${status}`}>{t(`att.${status}`)}</span>
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function ErrorText({ error }) {
  const { t } = useT()
  if (!error) return null
  const msg = typeof error === 'string' ? error : error.message
  const known = {
    last_admin: t('err.lastAdmin'),
    forbidden: t('err.forbidden'),
    forbidden_role: t('err.forbiddenRole'),
    need_log: t('done.needLogHint'),
    too_early: t('done.notYet'),
    drive_not_configured: t('files.notConfigured'),
  }
  // 화면에서 직접 만든 안내 문구(문자열)는 그대로 보여 줌
  let text = known[msg] || (typeof error === 'string' ? msg : null)
  if (!text && /row-level security/i.test(msg)) text = t('err.forbidden')
  return <div className="error">{text || `${t('err.generic')} (${msg})`}</div>
}

export function LangSwitch({ compact }) {
  const { lang, setLang } = useT()
  return (
    <div className={`lang-switch ${compact ? 'compact' : ''}`} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.code} className={lang === l.code ? 'on' : ''} onClick={() => setLang(l.code)}>
          {compact ? l.code.toUpperCase() : l.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function confirmDelete(t) {
  return window.confirm(t('common.confirmDelete'))
}
