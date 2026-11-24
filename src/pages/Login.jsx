import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { ErrorText, Field, LangSwitch } from '../components/ui'

export default function Login() {
  const { t } = useT()
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  async function google() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error)
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    const { data, error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) return setError(error)
    if (mode === 'signup' && !data.session) setNotice(t('auth.checkEmail'))
  }

  return (
    <div className="login">
      <div className="login-art" aria-hidden="true">
        <div className="ring">
          <span className="rope r1" /><span className="rope r2" /><span className="rope r3" />
          <div className="login-logo">PWS</div>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-top"><LangSwitch /></div>
        <div className="login-box">
          <h1>{t('auth.welcome')}</h1>
          <p className="muted">{t('auth.subtitle')}</p>

          <button className="btn google" onClick={google}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            {t('auth.google')}
          </button>

          <div className="divider"><span>{t('auth.or')}</span></div>

          <form className="form" onSubmit={submit}>
            <Field label={t('auth.email')}>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t('auth.password')} hint={mode === 'signup' ? t('auth.pwHint') : null}>
              <input type="password" required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <ErrorText error={error} />
            {notice && <div className="notice">{notice}</div>}
            <button className="btn primary block" disabled={busy}>
              {mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
            </button>
          </form>
          <p className="switch-mode">
            {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
            <button className="link-btn" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null) }}>
              {mode === 'signin' ? t('auth.signUp') : t('auth.signIn')}
            </button>
          </p>
          <p className="muted small">{t('auth.approvalNote')}</p>
        </div>
      </div>
    </div>
  )
}
