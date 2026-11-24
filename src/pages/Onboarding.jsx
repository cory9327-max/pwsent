import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { ErrorText, Field, LangSwitch } from '../components/ui'

/** 가입 후: 이름(본명/링네임) 입력 → 관리자 승인 대기 */
export default function Onboarding() {
  const { t } = useT()
  const { user, profile, refresh, signOut } = useAuth()
  const hasName = Boolean(profile?.display_name)
  const [editing, setEditing] = useState(!hasName || profile?.status === 'rejected')
  const [name, setName] = useState(profile?.display_name || '')
  const [type, setType] = useState(profile?.name_type || 'real')
  const [agree, setAgree] = useState(hasName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.from('profiles')
      .update({ display_name: name.trim(), name_type: type })
      .eq('id', user.id)
    setBusy(false)
    if (error) return setError(error)
    setEditing(false)
    refresh()
  }

  if (!profile) {
    return (
      <Shell onSignOut={signOut}>
        <h2>{t('onb.noProfile')}</h2>
        <p className="muted">{t('onb.noProfileBody')}</p>
        <button className="btn ghost" onClick={refresh}>{t('common.retry')}</button>
      </Shell>
    )
  }

  return (
    <Shell onSignOut={signOut}>
      {editing ? (
        <form className="form" onSubmit={submit}>
          <h2>{t('onb.title')}</h2>
          <p className="muted">{t('onb.body')}</p>
          {profile.status === 'rejected' && <div className="error">{t('onb.rejected')}</div>}
          <Field label={t('onb.nameType')}>
            <div className="seg">
              <button type="button" className={type === 'real' ? 'on' : ''} onClick={() => setType('real')}>{t('name.real')}</button>
              <button type="button" className={type === 'ring' ? 'on' : ''} onClick={() => setType('ring')}>{t('name.ring')}</button>
            </div>
          </Field>
          <Field label={type === 'real' ? t('name.real') : t('name.ring')} hint={t('onb.nameHint')}>
            <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            {t('onb.agree')}
          </label>
          <ErrorText error={error} />
          <button className="btn primary block" disabled={busy || !agree || !name.trim()}>{t('onb.submit')}</button>
        </form>
      ) : (
        <div className="pending">
          <div className="pending-icon">⏳</div>
          <h2>{t('onb.pendingTitle')}</h2>
          <p className="muted">{t('onb.pendingBody')}</p>
          <dl className="kv">
            <dt>{profile.name_type === 'ring' ? t('name.ring') : t('name.real')}</dt><dd>{profile.display_name}</dd>
            <dt>{t('auth.email')}</dt><dd>{profile.email}</dd>
          </dl>
          <div className="form-actions center">
            <button className="btn ghost" onClick={() => setEditing(true)}>{t('onb.editName')}</button>
            <button className="btn primary" onClick={refresh}>{t('onb.checkAgain')}</button>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children, onSignOut }) {
  const { t } = useT()
  return (
    <div className="center-screen dark">
      <div className="onb-top"><img className="brand-logo" src="/logo-wide.png" alt="PWS" /><LangSwitch compact /></div>
      <div className="card narrow">{children}</div>
      <button className="link-btn light" onClick={onSignOut}>{t('auth.signOut')}</button>
    </div>
  )
}
