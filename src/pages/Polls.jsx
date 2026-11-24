import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { POLL_SELECT, PollCard, PollForm, isOpen } from '../components/Polls'
import { OpenWeeksModal, WeekVoteCard } from '../components/WeeklyTraining'
import { useWeeklyTraining } from '../lib/weekly'
import { useAuth } from '../lib/auth'
import { Empty, Icon } from '../components/ui'

export default function Polls() {
  const { t } = useT()
  const [polls, setPolls] = useState([])
  const [events, setEvents] = useState([])
  const [tab, setTab] = useState('open')
  const [modal, setModal] = useState(null)
  const { isTrainer } = useAuth()
  const weekly = useWeeklyTraining()

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 864e5).toISOString()
    const [p, e] = await Promise.all([
      supabase.from('polls').select(POLL_SELECT + ', events(id,title)').order('created_at', { ascending: false }).limit(200),
      supabase.from('events').select('id,title,starts_at').gte('starts_at', since).order('starts_at').limit(100),
    ])
    setPolls(p.data || [])
    setEvents(e.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const list = polls.filter((p) => (tab === 'open' ? isOpen(p) : !isOpen(p)))
  const done = () => { setModal(null); load() }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('nav.polls')}</h1>
        <div className="head-actions">
          {isTrainer && weekly.available && <button className="btn ghost" onClick={() => setModal('weeks')}><Icon name="calendar" size={16} /> {t('wk.open')}</button>}
          <button className="btn primary" onClick={() => setModal('new')}><Icon name="plus" size={16} /> {t('poll.new')}</button>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>{t('poll.tabOpen')} <span>{polls.filter(isOpen).length + weekly.weeks.length}</span></button>
        <button className={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>{t('poll.tabClosed')}</button>
      </div>
      {tab === 'open' && weekly.weeks.length > 0 && (
        <section>
          <h2 className="sec-title">{t('wk.section')}</h2>
          <div className="grid-cards">
            {weekly.weeks.map((w) => <WeekVoteCard key={w.weekStart} week={w} minPeople={weekly.minPeople} onChange={weekly.reload} />)}
          </div>
        </section>
      )}
      {list.length === 0 ? (tab === 'open' && weekly.weeks.length > 0 ? null : <Empty>{t('poll.empty')}</Empty>) : (
        <div className="grid-cards">{list.map((p) => <PollCard key={p.id} poll={p} onChange={load} onEdit={(x) => setModal({ poll: x })} />)}</div>
      )}
      {modal === 'weeks' && <OpenWeeksModal minPeople={weekly.minPeople} onClose={() => setModal(null)} onSaved={(keep) => { weekly.reload(); if (!keep) setModal(null) }} />}
      {modal === 'new' && <PollForm events={events} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.poll && <PollForm poll={modal.poll} events={events} onClose={() => setModal(null)} onSaved={done} />}
    </div>
  )
}
