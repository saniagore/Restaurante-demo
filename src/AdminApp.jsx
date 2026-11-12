import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import AuthScreen from './components/AuthScreen'
import Dashboard from './components/Dashboard'
import OrdersBoard from './components/OrdersBoard'
import MenuManager from './components/MenuManager'
import { isAdminSession } from './lib/auth'
import './Admin.css'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('dashboard')

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (mounted) {
        setSession(currentSession)
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) return <div className="loading-screen">Cargando panel...</div>
  if (!session) return <AuthScreen />
  if (!isAdminSession(session)) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Acceso no autorizado</h1>
          <p className="muted">Tu cuenta no tiene permisos de administración.</p>
          <button className="primary-button full-width" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </section>
      </main>
    )
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <div><strong>Mesa abierta</strong><small>Panel interno</small></div>
        </div>
        <nav className="main-nav" aria-label="Navegación principal">
          <div className="nav-group">
            <p className="nav-label">Operación</p>
            <button className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('dashboard')}>
              <span>⌂</span> Resumen
            </button>
            <button className={activeView === 'orders' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('orders')}>
              <span>▣</span> Órdenes
            </button>
          </div>
          <div className="nav-group">
            <p className="nav-label">Catálogo</p>
            <button className={activeView === 'menu' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('menu')}>
              <span>◈</span> Menú
            </button>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip"><span className="avatar">{(session.user.email || 'A')[0].toUpperCase()}</span><span>{session.user.email}</span></div>
          <button className="logout-button" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="main-content">
        {activeView === 'dashboard' ? <Dashboard onOpenOrders={() => setActiveView('orders')} /> : activeView === 'orders' ? <OrdersBoard /> : <MenuManager />}
      </main>
    </div>
  )
}

export default App
