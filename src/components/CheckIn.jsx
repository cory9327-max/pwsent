import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
import { seoulDate } from '../lib/format'
import { useTypes } from '../lib/types'
import { ErrorText, StatusPill } from './ui'

export const isToday = (ev) => seoulDate(ev.starts_at) === seoulDate()

/** 본인 출석 체크 (당일만, 참여/지각 중 선택. 한 번 찍으면 수정은 트레이너만) */
export default function CheckIn({ event, record, onDone, compact }) {
  const { t } = useT()
  const { user } = useAuth()
  const { hasAttendance } = useTypes()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!hasAttendance(event.type) || event.status === 'tentative') return null
  if (record) return <div className="checkin done"><span className="muted small">{t('att.mine')}</span> <StatusPill status={record.status} /></div>

  const today = isToday(event)
  const past = seoulDate(event.starts_at) < seoulDate()
  if (!today) {
    return compact ? null : (
      <div className="checkin muted small">
        {past ? <>{t('att.mine')} <StatusPill status="absent" /></> : t('att.onlyToday')}
      </div>
    )
  }

  async function mark(status) {
    setBusy(true); setError(null)
    const { error } = await supabase.from('attendance').insert({ event_id: event.id, user_id: user.id, status })
    setBusy(false)
    if (error) setError(error)
    else onDone?.()
  }

  return (
    <div className="checkin">
      <button className="btn primary" disabled={busy} onClick={() => mark('present')}>{t('att.checkPresent')}</button>
      <button className="btn warn" disabled={busy} onClick={() => mark('late')}>{t('att.checkLate')}</button>
      <ErrorText error={error} />
    </div>
  )
}
