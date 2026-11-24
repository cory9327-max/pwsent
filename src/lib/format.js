// 날짜·시간 유틸. 출석 기준일은 한국 시간(Asia/Seoul)
export const TZ = 'Asia/Seoul'

const LOCALES = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' }
export const localeOf = (lang) => LOCALES[lang] || 'ko-KR'

/** 'YYYY-MM-DD' (한국 시간 기준) */
export function seoulDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(d))
}

export function fmtDate(d, lang, opts = {}) {
  if (!d) return ''
  return new Intl.DateTimeFormat(localeOf(lang), { month: 'short', day: 'numeric', weekday: 'short', ...opts })
    .format(new Date(d))
}

export function fmtTime(d, lang) {
  if (!d) return ''
  return new Intl.DateTimeFormat(localeOf(lang), { hour: '2-digit', minute: '2-digit' }).format(new Date(d))
}

export function fmtDateTime(d, lang) {
  if (!d) return ''
  return `${fmtDate(d, lang)} ${fmtTime(d, lang)}`
}

/** ISO → <input type="datetime-local"> 값 */
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> 값 → ISO */
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

export function fmtMoney(n, currency = 'KRW', lang = 'ko') {
  const v = Number(n || 0)
  try {
    return new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency, maximumFractionDigits: currency === 'KRW' || currency === 'JPY' ? 0 : 2 }).format(v)
  } catch {
    return `${v.toLocaleString()} ${currency}`
  }
}

export function fmtBytes(b) {
  if (!b) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = Number(b)
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`
}

export function monthRange(year, month) {
  const pad = (n) => String(n).padStart(2, '0')
  const last = new Date(year, month + 1, 0).getDate()
  return [`${year}-${pad(month + 1)}-01`, `${year}-${pad(month + 1)}-${pad(last)}`]
}

/** 구글 캘린더 추가 링크 */
export function googleCalendarUrl(ev) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const end = ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 2 * 3600e3).toISOString()
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${f(ev.starts_at)}/${f(end)}`,
    details: ev.description || '',
    location: ev.location || '',
  })
  return `https://calendar.google.com/calendar/render?${p}`
}

/** .ics 파일 다운로드 */
export function downloadIcs(ev) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const esc = (s = '') => s.replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n')
  const end = ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 2 * 3600e3).toISOString()
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PWS//Portal//EN', 'BEGIN:VEVENT',
    `UID:${ev.id}@pws`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(ev.starts_at)}`, `DTEND:${f(end)}`,
    `SUMMARY:${esc(ev.title)}`, `DESCRIPTION:${esc(ev.description || '')}`, `LOCATION:${esc(ev.location || '')}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  a.download = `${ev.title}.ics`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
