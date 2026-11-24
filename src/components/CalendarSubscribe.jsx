import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { ErrorText, Icon } from './ui'

/** 내 캘린더 앱(구글·애플)에 PWS 일정을 구독으로 연결 — 일정이 바뀌면 자동 반영 */
export default function CalendarSubscribe() {
  const { t } = useT()
  const [token, setToken] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  async function load(reset = false) {
    setError(null)
    const { data, error } = await supabase.rpc('my_calendar_token', { p_reset: reset })
    if (error) setError(error)
    else setToken(data)
  }
  useEffect(() => { load() }, [])

  const host = window.location.host
  const httpsUrl = token ? `${window.location.origin}/api/calendar?token=${token}` : ''
  const webcalUrl = token ? `webcal://${host}/api/calendar?token=${token}` : ''
  const googleUrl = token ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}` : '#'

  async function copy() {
    try { await navigator.clipboard.writeText(httpsUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* 무시 */ }
  }
  function reset() {
    if (window.confirm(t('calsub.resetConfirm'))) load(true)
  }

  return (
    <div className="calsub">
      <p className="muted small">{t('calsub.body')}</p>
      <div className="calsub-actions">
        <a className={`btn primary ${token ? '' : 'disabled'}`} href={googleUrl} target="_blank" rel="noreferrer">
          <Icon name="calendar" size={16} /> {t('calsub.google')}
        </a>
        <a className={`btn ghost ${token ? '' : 'disabled'}`} href={webcalUrl || '#'}>
          <Icon name="calendar" size={16} /> {t('calsub.apple')}
        </a>
      </div>
      <div className="calsub-url">
        <input readOnly value={httpsUrl} onFocus={(e) => e.target.select()} aria-label={t('calsub.url')} />
        <button className="btn ghost" onClick={copy} disabled={!token}><Icon name="link" size={15} /> {copied ? t('event.copied') : t('calsub.copy')}</button>
      </div>
      <p className="muted small">{t('calsub.manual')}</p>
      <p className="muted small">{t('calsub.note')} <button className="link-btn" onClick={reset}>{t('calsub.reset')}</button></p>
      <ErrorText error={error} />
    </div>
  )
}
