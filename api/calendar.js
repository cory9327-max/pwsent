// 캘린더 구독 주소:  /api/calendar?token=<회원별 비밀 토큰>
// 구글 캘린더·애플 캘린더가 이 주소를 주기적으로 읽어 PWS 일정을 자동으로 반영합니다.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPE = { general: '일반', training: '훈련', match: '경기' }

const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n')

// iCalendar 규격: 한 줄 75바이트 이하로 접기
function fold(line) {
  const out = []
  let cur = '', bytes = 0
  for (const ch of line) {
    const b = Buffer.byteLength(ch)
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1 }
    cur += ch; bytes += b
  }
  out.push(cur)
  return out.join('\r\n')
}

export function buildIcs(events) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PWS//Portal//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:PWS', 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of events) {
    const end = e.ends_at || new Date(new Date(e.starts_at).getTime() + 2 * 3600e3)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@pws`,
      `DTSTAMP:${stamp(e.updated_at || e.starts_at)}`,
      `LAST-MODIFIED:${stamp(e.updated_at || e.starts_at)}`,
      `DTSTART:${stamp(e.starts_at)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(`[${TYPE[e.type] || e.type}] ${e.title}`)}`,
    )
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export default async function handler(req, res) {
  const token = String(req.query?.token || '')
  if (!UUID.test(token)) return res.status(400).send('invalid token')

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).send('not configured')

  const r = await fetch(`${url}/rest/v1/rpc/calendar_feed`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  })
  if (!r.ok) return res.status(502).send('upstream error')

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="pws.ics"')
  res.setHeader('Cache-Control', 'private, max-age=300')
  return res.status(200).send(buildIcs(await r.json()))
}
