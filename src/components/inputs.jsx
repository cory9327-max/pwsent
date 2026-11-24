import { useState } from 'react'
import { useT } from '../lib/i18n'

const pad = (n) => String(n).padStart(2, '0')
const QUARTERS = ['00', '15', '30', '45']

/** 날짜 + 24시간제 시(0~23시) + 분(15분 단위, 필요하면 직접 입력). 값은 'YYYY-MM-DDTHH:mm' 또는 '' */
export function DateTimeInput({ value, onChange, required, fallbackTime = '19:00' }) {
  const { t } = useT()
  const [date, time] = value ? value.split('T') : ['', '']
  const [hh, mm] = (time || fallbackTime).split(':')
  const [custom, setCustom] = useState(!QUARTERS.includes(mm))
  const emit = (d, h, m) => onChange(d ? `${d}T${pad(h)}:${pad(m)}` : '')

  return (
    <div className="dt-input">
      <input type="date" required={required} value={date} onChange={(e) => emit(e.target.value, hh, mm)} />
      <select value={Number(hh)} disabled={!date} onChange={(e) => emit(date, e.target.value, mm)} aria-label="hour">
        {[...Array(24)].map((_, h) => <option key={h} value={h}>{t('time.hour', { n: h })}</option>)}
      </select>
      <select value={custom ? 'custom' : mm} disabled={!date} aria-label="minute"
        onChange={(e) => {
          if (e.target.value === 'custom') setCustom(true)
          else { setCustom(false); emit(date, hh, e.target.value) }
        }}>
        {QUARTERS.map((m) => <option key={m} value={m}>{t('time.minute', { n: m })}</option>)}
        <option value="custom">{t('common.custom')}</option>
      </select>
      {custom && (
        <input type="number" className="dt-min" min="0" max="59" disabled={!date} value={Number(mm)} aria-label="minute"
          onChange={(e) => emit(date, hh, Math.min(59, Math.max(0, Number(e.target.value) || 0)))} />
      )}
    </div>
  )
}

/** 미리 정해둔 선택지 중에서 고르거나, '직접 입력'으로 새 값을 쓰는 입력 */
export function ChoiceInput({ options, extra = [], value, onChange, placeholder, allowEmpty = true }) {
  const { t } = useT()
  const all = [...options, ...extra.filter((x) => x && !options.includes(x))]
  const [custom, setCustom] = useState(Boolean(value) && !all.includes(value))

  return (
    <div className="choice">
      <div className="chips">
        {all.map((o) => (
          <button type="button" key={o} className={!custom && value === o ? 'on' : ''}
            onClick={() => { setCustom(false); onChange(allowEmpty && !custom && value === o ? '' : o) }}>
            {o}
          </button>
        ))}
        <button type="button" className={custom ? 'on' : ''} onClick={() => { setCustom(true); onChange('') }}>
          + {t('common.custom')}
        </button>
      </div>
      {custom && <input autoFocus value={value} maxLength={80} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </div>
  )
}
