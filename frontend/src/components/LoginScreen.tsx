import { useState, type FormEvent } from 'react'
import { Layers3 } from 'lucide-react'
import { apiFetch } from '../api'

export function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin1234')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch<{ access_token: string }>('/admin/login', '', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      localStorage.setItem('gateway_token', data.access_token)
      onLogin(data.access_token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><Layers3 size={21} /></div>
        <p className="eyebrow">AI GATEWAY</p>
        <h1>Admin Console</h1>
        <p className="login-subtitle">Sign in to manage providers and usage.</p>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button login-button" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
