import { useState } from 'react'
import { supabase } from '../lib/supabase'

function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (authError) setError('Correo o contraseña incorrectos.')
    setSubmitting(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark large">R</span>
        <p className="eyebrow">RINCÓN · ADMINISTRACIÓN</p>
        <h1>Bienvenido de nuevo</h1>
        <p className="muted">Inicia sesión para gestionar tu restaurante.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Correo electrónico<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="tu@restaurante.com" /></label>
          <label>Contraseña<input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="••••••••" /><button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Ocultar' : 'Mostrar'} contraseña</button></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full-width" type="submit" disabled={submitting}>{submitting ? 'Verificando...' : 'Entrar al panel'}</button>
        </form>
      </section>
    </main>
  )
}

export default AuthScreen
