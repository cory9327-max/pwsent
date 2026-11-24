import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { seoulDate } from './format'
import { mondayOf } from './week'

/** 이번 주 이후의 주간 훈련(타임이 있는 훈련 일정)과 투표 현황을 주 단위로 묶어 불러옴 */
export function useWeeklyTraining() {
  const [state, setState] = useState({ weeks: [], minPeople: 3, ready: false, available: true })

  const reload = useCallback(async () => {
    const thisMonday = mondayOf(seoulDate())
    const { data: evs, error } = await supabase.from('events').select('*')
      .not('slots', 'is', null).gte('starts_at', new Date(`${thisMonday}T00:00:00`).toISOString()).order('starts_at')
    if (error) return setState({ weeks: [], minPeople: 3, ready: true, available: false }) // 06 SQL 미실행
    const ids = (evs || []).map((e) => e.id)
    const starts = [...new Set((evs || []).map((e) => mondayOf(seoulDate(e.starts_at))))]
    const [v, s, set] = await Promise.all([
      ids.length ? supabase.from('training_votes').select('*').in('event_id', ids) : { data: [] },
      starts.length ? supabase.from('training_week_skips').select('*').in('week_start', starts) : { data: [] },
      supabase.from('training_settings').select('*').maybeSingle(),
    ])
    const weeks = starts.map((ws) => {
      const events = evs.filter((e) => mondayOf(seoulDate(e.starts_at)) === ws)
      const eids = new Set(events.map((e) => e.id))
      return {
        weekStart: ws,
        events,
        votes: (v.data || []).filter((x) => eids.has(x.event_id)),
        skips: (s.data || []).filter((x) => x.week_start === ws),
      }
    })
    setState({ weeks, minPeople: set.data?.min_people ?? 3, ready: true, available: true })
  }, [])

  useEffect(() => { reload() }, [reload])
  return { ...state, reload }
}
