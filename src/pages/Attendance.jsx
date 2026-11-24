import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { downloadCsv, monthRange } from '../lib/format'
import { Empty, ErrorText, Icon, RoleBadge } from '../components/ui'

export default function Attendance() {
  const { t } = useT()
  const now = new Date()
  const [range, setRange] = useState(() => {
    const [from, to] = monthRange(now.getFullYear(), now.getMonth())
    return { from, to }
  })
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('name')

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.rpc('attendance_report', { p_from: range.from, p_to: range.to })
    if (error) setError(error)
    setRows(data || [])
  }, [range])
  useEffect(() => { load() }, [load])

  const preset = (k) => {
    const d = new Date()
    if (k === 'this') { const [from, to] = monthRange(d.getFullYear(), d.getMonth()); setRange({ from, to }) }
    if (k === 'last') { const x = new Date(d.getFullYear(), d.getMonth() - 1, 1); const [from, to] = monthRange(x.getFullYear(), x.getMonth()); setRange({ from, to }) }
    if (k === '3m') { const x = new Date(d.getFullYear(), d.getMonth() - 2, 1); const [from] = monthRange(x.getFullYear(), x.getMonth()); const [, to] = monthRange(d.getFullYear(), d.getMonth()); setRange({ from, to }) }
  }

  const rate = (r) => (r.total ? Math.round(((r.present + r.late) / r.total) * 100) : null)
  const sorted = [...rows].sort((a, b) =>
    sort === 'rate' ? (rate(a) ?? 101) - (rate(b) ?? 101) : sort === 'absent' ? b.absent - a.absent : (a.display_name || '').localeCompare(b.display_name || ''))

  function exportCsv() {
    downloadCsv(`attendance_${range.from}_${range.to}.csv`, [
      [t('members.name'), t('members.role'), t('att.total'), t('att.present'), t('att.late'), t('att.absent'), t('att.rate')],
      ...sorted.map((r) => [r.display_name, t(`role.${r.role}`), r.total, r.present, r.late, r.absent, rate(r) === null ? '' : `${rate(r)}%`]),
    ])
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.attendance')}</h1>
          <p className="muted">{t('att.reportHint')}</p>
        </div>
        <button className="btn ghost" onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={16} /> CSV</button>
      </div>

      <div className="toolbar">
        <div className="range">
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span>~</span>
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
        <div className="seg small">
          <button onClick={() => preset('this')}>{t('att.thisMonth')}</button>
          <button onClick={() => preset('last')}>{t('att.lastMonth')}</button>
          <button onClick={() => preset('3m')}>{t('att.last3')}</button>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">{t('att.sortName')}</option>
          <option value="rate">{t('att.sortRate')}</option>
          <option value="absent">{t('att.sortAbsent')}</option>
        </select>
      </div>

      <ErrorText error={error} />
      {sorted.length === 0 ? <Empty>{t('att.noData')}</Empty> : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('members.name')}</th><th>{t('members.role')}</th>
                <th className="num">{t('att.total')}</th><th className="num">{t('att.present')}</th>
                <th className="num">{t('att.late')}</th><th className="num">{t('att.absent')}</th><th>{t('att.rate')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const p = rate(r)
                return (
                  <tr key={r.user_id}>
                    <td><strong>{r.display_name}</strong></td>
                    <td><RoleBadge role={r.role} /></td>
                    <td className="num">{r.total}</td>
                    <td className="num ok">{r.present}</td>
                    <td className="num warn-text">{r.late}</td>
                    <td className="num bad">{r.absent}</td>
                    <td>
                      {p === null ? '—' : (
                        <div className="rate"><span className="rate-bar"><i style={{ width: `${p}%` }} className={p < 60 ? 'low' : ''} /></span>{p}%</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
