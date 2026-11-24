import { Navigate, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/auth'
import { useT } from './lib/i18n'
import { TypesProvider } from './lib/types'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Schedule from './pages/Schedule'
import EventDetail from './pages/EventDetail'
import Polls from './pages/Polls'
import Training from './pages/Training'
import Attendance from './pages/Attendance'
import Files from './pages/Files'
import Foreign from './pages/Foreign'
import Admin from './pages/Admin'
import MyPage from './pages/MyPage'

export default function App() {
  const { t } = useT()
  if (!isConfigured) {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h2>{t('setup.title')}</h2>
          <p className="muted">{t('setup.body')}</p>
          <pre className="code">VITE_SUPABASE_URL=...{'\n'}VITE_SUPABASE_ANON_KEY=...</pre>
        </div>
      </div>
    )
  }
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

function Gate() {
  const { loading, user, profile, approved, can } = useAuth()
  const { t } = useT()

  if (loading) return <div className="center-screen"><div className="spinner" aria-label={t('common.loading')} /></div>
  if (!user) return <Login />
  if (!profile || !approved || !profile.display_name) return <Onboarding />

  const guard = (ok, el) => (ok ? el : <Navigate to="/" replace />)

  return (
    <TypesProvider>
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/polls" element={<Polls />} />
        <Route path="/training" element={<Training />} />
        <Route path="/attendance" element={guard(can('attendance'), <Attendance />)} />
        <Route path="/files" element={<Files />} />
        <Route path="/foreign" element={guard(can('foreign'), <Foreign />)} />
        <Route path="/admin" element={guard(can('settings') || can('members'), <Admin />)} />
        <Route path="/members" element={<Navigate to="/admin" replace />} />
        <Route path="/me" element={<MyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    </TypesProvider>
  )
}
