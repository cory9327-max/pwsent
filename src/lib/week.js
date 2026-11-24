// 주(월요일 시작) 계산 도우미. 날짜는 'YYYY-MM-DD' 문자열로 다룹니다.
const pad = (n) => String(n).padStart(2, '0')
export const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function addDaysStr(s, n) {
  const d = new Date(`${s}T12:00:00`)
  d.setDate(d.getDate() + n)
  return dstr(d)
}

/** 그 날짜가 속한 주의 월요일 */
export function mondayOf(s) {
  const d = new Date(`${s}T12:00:00`)
  return addDaysStr(s, -((d.getDay() + 6) % 7))
}

export const slotLabel = (s) => `${s.name} ${s.start}${s.end ? `–${s.end}` : ''}`
