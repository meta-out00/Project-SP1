import { useEffect, useState, type FormEvent } from 'react'
import {
  Activity, Boxes, ChevronRight, CircleGauge, KeyRound, Layers3,
  ChevronDown, LogOut, Menu, MessageSquare, RefreshCw, Settings, User, Users, X,
} from 'lucide-react'
import { apiFetch } from './api'
import { LoginScreen } from './components/LoginScreen'
import { Modal } from './components/Shared'
import { DashboardPage } from './pages/DashboardPage'
import { ProvidersPage } from './pages/ProvidersPage'
import { ModelsPage } from './pages/ModelsPage'
import { ApiKeysPage } from './pages/ApiKeysPage'
import { RolesPage } from './pages/RolesPage'
import { LogsPage } from './pages/LogsPage'
import { PlaygroundPage } from './pages/PlaygroundPage'
import { SettingsPage } from './pages/SettingsPage'
import type { Analytics, ApiKey, AuditLog, Provider, Role, UsageLog } from './types'

type Page = 'dashboard' | 'playground' | 'providers' | 'models' | 'api-keys' | 'roles' | 'logs' | 'settings'
type ModalName = 'provider' | 'api-key' | 'api-key-created' | 'role' | null

const pages: Array<{ id: Page; label: string; icon: typeof CircleGauge }> = [
  { id: 'dashboard', label: 'Dashboard', icon: CircleGauge },
  { id: 'playground', label: 'Chat Playground', icon: MessageSquare },
  { id: 'providers', label: 'Providers', icon: Boxes },
  { id: 'models', label: 'Models', icon: Layers3 },
  { id: 'api-keys', label: 'API Keys', icon: KeyRound },
  { id: 'roles', label: 'Users / Roles', icon: Users },
  { id: 'logs', label: 'Request Logs', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('gateway_token') || '')
  const [page, setPage] = useState<Page>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [modal, setModal] = useState<ModalName>(null)
  const [createdKey, setCreatedKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  async function loadData(authToken = token) {
    if (!authToken) return
    setLoading(true)
    setError('')
    try {
      const [providerData, keyData, roleData, usageData, auditData, analyticsData] = await Promise.all([
        apiFetch<Provider[]>('/admin/providers', authToken),
        apiFetch<ApiKey[]>('/admin/api-keys', authToken),
        apiFetch<Role[]>('/admin/roles', authToken),
        apiFetch<UsageLog[]>('/admin/usage-logs?limit=100', authToken),
        apiFetch<AuditLog[]>('/admin/audit-logs?limit=100', authToken),
        apiFetch<Analytics>('/admin/analytics/summary', authToken),
      ])
      setProviders(providerData)
      setApiKeys(keyData)
      setRoles(roleData)
      setUsageLogs(usageData)
      setAuditLogs(auditData)
      setAnalytics(analyticsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load gateway data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) void loadData(token)
  }, [token])

  function logout() {
    localStorage.removeItem('gateway_token')
    setToken('')
  }

  async function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await apiFetch('/admin/providers', token, {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name')),
          provider_type: String(form.get('provider_type')),
          base_url: String(form.get('base_url')),
          api_key: String(form.get('api_key') || '') || null,
          default_model: String(form.get('default_model')),
          priority: Number(form.get('priority') || 1),
        }),
      })
      setModal(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add provider')
    }
  }

  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const expiresAt = String(form.get('expires_at') || '').trim()
    try {
      const created = await apiFetch<ApiKey & { raw_api_key: string }>('/admin/api-keys', token, {
        method: 'POST',
        body: JSON.stringify({
          key_name: String(form.get('key_name')),
          role_name: String(form.get('role_name') || '') || null,
          rate_limit_per_minute: Number(form.get('rpm') || 0) || null,
          max_budget_usd: Number(form.get('budget') || 0) || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      })
      setCreatedKey(created.raw_api_key)
      setCopied(false)
      setModal('api-key-created')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create API key')
    }
  }

  async function revokeApiKey(id: number) {
    if (!window.confirm('Revoke this API key?')) return
    try {
      await apiFetch(`/admin/api-keys/${id}`, token, { method: 'DELETE' })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke API key')
    }
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const budgetText = String(form.get('budget') || '').trim()
    const body = {
      description: String(form.get('description') || '') || null,
      default_rate_limit_per_minute: Number(form.get('rpm') || 60),
      default_max_budget_usd: budgetText ? Number(budgetText) : null,
      allowed_models: String(form.get('allowed_models') || '*'),
    }
    try {
      if (editingRole) {
        await apiFetch(`/admin/roles/${editingRole.id}`, token, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await apiFetch('/admin/roles', token, {
          method: 'POST',
          body: JSON.stringify({ role_name: String(form.get('role_name')), ...body }),
        })
      }
      setModal(null)
      setEditingRole(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save role')
    }
  }

  async function deleteRole(role: Role) {
    if (!window.confirm(`Delete role "${role.role_name}"?`)) return
    try {
      await apiFetch(`/admin/roles/${role.id}`, token, { method: 'DELETE' })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete role')
    }
  }

  if (!token) return <LoginScreen onLogin={setToken} />

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Layers3 size={18} /></div>
          <div><strong>AI Gateway</strong><span>Admin Console</span></div>
        </div>
        <nav>
          {pages.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => { setPage(item.id); setSidebarOpen(false) }}>
                <Icon size={17} /><span>{item.label}</span><ChevronRight className="nav-arrow" size={14} />
              </button>
            )
          })}
        </nav>
        <button className="logout" onClick={logout}><LogOut size={16} /> Sign out</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
          <div className="topbar-actions">
            <button className="refresh-button" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw size={15} /> Refresh
            </button>
            <div className="profile-menu">
              <button className="profile-button" onClick={() => setProfileOpen((open) => !open)}>
                <span className="profile-avatar"><User size={16} /></span>
                <span className="profile-copy"><strong>Admin</strong><small>Administrator</small></span>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <div className="profile-dropdown">
                  <button onClick={() => { setPage('settings'); setProfileOpen(false) }}><Settings size={14} /> Account settings</button>
                  <button className="profile-signout" onClick={logout}><LogOut size={14} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {error && <div className="error-banner">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}

        {page === 'dashboard' && <DashboardPage analytics={analytics} providers={providers} logs={usageLogs} />}
        {page === 'providers' && <ProvidersPage providers={providers} onAdd={() => setModal('provider')} />}
        {page === 'models' && <ModelsPage providers={providers} />}
        {page === 'api-keys' && <ApiKeysPage apiKeys={apiKeys} onCreate={() => setModal('api-key')} onRevoke={revokeApiKey} />}
        {page === 'roles' && <RolesPage roles={roles} onAdd={() => { setEditingRole(null); setModal('role') }} onEdit={(role) => { setEditingRole(role); setModal('role') }} onDelete={deleteRole} />}
        {page === 'logs' && <LogsPage usageLogs={usageLogs} auditLogs={auditLogs} />}
        {page === 'playground' && <PlaygroundPage providers={providers} />}
        {page === 'settings' && <SettingsPage />}
      </main>

      {modal === 'provider' && (
        <Modal title="Add Provider" subtitle="Register an OpenAI-compatible or mock provider" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={createProvider}>
            <div className="form-grid">
              <label>Provider name<input name="name" required placeholder="openai-primary" /></label>
              <label>Provider type<select name="provider_type" defaultValue="openai_compatible"><option value="openai_compatible">openai_compatible</option><option value="mock">mock</option></select></label>
              <label>Base URL<input name="base_url" required placeholder="https://api.openai.com/v1" /></label>
              <label>Default model<input name="default_model" required placeholder="gpt-4o-mini" /></label>
              <label>API key<input name="api_key" type="password" placeholder="Optional provider key" /></label>
              <label>Priority<input name="priority" type="number" min="1" defaultValue="1" /></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" type="submit">Add Provider</button></div>
          </form>
        </Modal>
      )}

      {modal === 'api-key' && (
        <Modal title="Create API Key" subtitle="The raw key is shown once after creation" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={createApiKey}>
            <div className="form-grid">
              <label>Key name<input name="key_name" required placeholder="Production app" /></label>
              <label>Role<select name="role_name" defaultValue="student">{roles.map((role) => <option key={role.id} value={role.role_name}>{role.role_name}</option>)}</select></label>
              <label>Requests per minute<input name="rpm" type="number" min="1" placeholder="Use role default" /></label>
              <label>Maximum budget (USD)<input name="budget" type="number" min="0" step="0.01" placeholder="Use role default" /></label>
              <label className="full-span">Expires at<input name="expires_at" type="datetime-local" /></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" type="submit">Create Key</button></div>
          </form>
        </Modal>
      )}

      {modal === 'api-key-created' && (
        <Modal title="API Key Created" subtitle="Copy this key now. It cannot be shown again." onClose={() => setModal(null)}>
          <div className="created-key-content">
            <label>API key</label>
            <div className="created-key-box">
              <input readOnly value={createdKey} onFocus={(event) => event.currentTarget.select()} />
              <button className="primary-button" onClick={async () => { await navigator.clipboard.writeText(createdKey); setCopied(true) }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
          <div className="created-key-actions"><button className="primary-button" onClick={() => setModal(null)}>Done</button></div>
        </Modal>
      )}

      {modal === 'role' && (
        <Modal title={editingRole ? `Edit ${editingRole.role_name}` : 'Add Role'} subtitle="Configure quotas and model access" onClose={() => { setModal(null); setEditingRole(null) }}>
          <form className="modal-form" onSubmit={saveRole}>
            <div className="form-grid">
              {!editingRole && <label>Role name<input name="role_name" required placeholder="researcher" /></label>}
              <label>Requests per minute<input name="rpm" type="number" min="1" defaultValue={editingRole?.default_rate_limit_per_minute ?? 60} /></label>
              <label>Maximum budget (USD)<input name="budget" type="number" min="0" step="0.01" defaultValue={editingRole?.default_max_budget_usd ?? ''} /></label>
              <label className="full-span">Description<input name="description" defaultValue={editingRole?.description ?? ''} /></label>
              <label className="full-span">Allowed models<input name="allowed_models" defaultValue={editingRole?.allowed_models ?? '*'} placeholder="* or mock-,gemini-,gpt-" /></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setModal(null); setEditingRole(null) }}>Cancel</button><button className="primary-button" type="submit">{editingRole ? 'Save Changes' : 'Add Role'}</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
