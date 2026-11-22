import {
    Activity,
    BarChart3,
    Boxes,
    ChevronDown,
    CircleGauge,
    KeyRound,
    Layers3,
    LogOut,
    Menu,
    MessageSquare,
    RefreshCw,
    Settings,
    Users,
    X,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import { apiFetch } from './api'
import { LoginScreen } from './components/LoginScreen'
import { Modal } from './components/Shared'
import { ApiKeysPage } from './pages/ApiKeysPage'
import { DashboardPage } from './pages/DashboardPage'
import { LogsPage } from './pages/LogsPage'
import { ModelsPage } from './pages/ModelsPage'
import { PlaygroundPage } from './pages/PlaygroundPage'
import { ProvidersPage } from './pages/ProvidersPage'
import { RolesPage } from './pages/RolesPage'
import { SettingsPage } from './pages/SettingsPage'
import type { ApiKey, Provider, Role, UsageLog, UsageSummary } from './types'

type Page = 'dashboard' | 'playground' | 'providers' | 'models' | 'api-keys' | 'users' | 'logs' | 'settings'
type ModalName = 'provider' | 'api-key' | 'api-key-created' | 'role' | null

const pages: Array<{ id: Page; label: string; icon: typeof CircleGauge }> = [
  { id: 'dashboard', label: 'Dashboard', icon: CircleGauge },
  { id: 'playground', label: 'Playground', icon: MessageSquare },
  { id: 'providers', label: 'Providers', icon: Boxes },
  { id: 'models', label: 'Models', icon: Layers3 },
  { id: 'api-keys', label: 'API Keys', icon: KeyRound },
  { id: 'users', label: 'Users / Roles', icon: Users },
  { id: 'logs', label: 'Request Logs', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function App() {
  const [token, setToken] = useState(localStorage.getItem('gateway_token') || '')
  const [page, setPage] = useState<Page>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([])
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<ModalName>(null)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [createdApiKey, setCreatedApiKey] = useState('')
  const [copiedApiKey, setCopiedApiKey] = useState(false)

  async function loadData(authToken = token) {
    if (!authToken) return
    setLoading(true)
    setError('')
    try {
      const [providerData, keyData, roleData, usageData, summaryData] = await Promise.all([
        apiFetch<Provider[]>('/admin/providers', authToken),
        apiFetch<ApiKey[]>('/admin/api-keys', authToken),
        apiFetch<Role[]>('/admin/roles', authToken),
        apiFetch<UsageLog[]>('/admin/usage-logs?limit=100&offset=0', authToken),
        apiFetch<UsageSummary>('/admin/analytics/summary', authToken),
      ])
      setProviders(providerData)
      setApiKeys(keyData)
      setRoles(roleData)
      setUsageLogs(usageData)
      setUsageSummary(summaryData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load gateway data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) void loadData(token)
  }, [token])

  const models = useMemo(() => {
    const seen = new Set<string>()
    return providers.filter((provider) => {
      if (seen.has(provider.default_model)) return false
      seen.add(provider.default_model)
      return true
    })
  }, [providers])

  function logout() {
    localStorage.removeItem('gateway_token')
    setToken('')
  }

  async function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await apiFetch<Provider>('/admin/providers', token, {
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
      setError(err instanceof Error ? err.message : 'Unable to create provider')
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
      setCreatedApiKey(created.raw_api_key)
      setCopiedApiKey(false)
      setModal('api-key-created')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create API key')
    }
  }

  async function copyCreatedApiKey() {
    try {
      await navigator.clipboard.writeText(createdApiKey)
      setCopiedApiKey(true)
    } catch {
      setError('Unable to copy automatically. Select the key and copy it manually.')
    }
  }

  async function revokeApiKey(id: number) {
    if (!window.confirm('Revoke this API key?')) return
    try {
      await apiFetch<ApiKey>(`/admin/api-keys/${id}`, token, { method: 'DELETE' })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke API key')
    }
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await apiFetch<Role>('/admin/roles', token, {
        method: 'POST',
        body: JSON.stringify({
          role_name: String(form.get('role_name')),
          description: String(form.get('description') || '') || null,
          default_rate_limit_per_minute: Number(form.get('rpm') || 60),
          default_max_budget_usd: Number(form.get('budget') || 0) || null,
          allowed_models: String(form.get('allowed_models') || '*'),
        }),
      })
      setModal(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create role')
    }
  }

  async function updateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingRole) return
    const form = new FormData(event.currentTarget)
    const budgetText = String(form.get('budget') || '').trim()
    try {
      await apiFetch<Role>(`/admin/roles/${editingRole.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          description: String(form.get('description') || '') || null,
          default_rate_limit_per_minute: Number(form.get('rpm') || 60),
          default_max_budget_usd: budgetText ? Number(budgetText) : null,
          allowed_models: String(form.get('allowed_models') || '*'),
        }),
      })
      setModal(null)
      setEditingRole(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update role')
    }
  }

  async function deleteRole(role: Role) {
    if (!window.confirm(`Delete role "${role.role_name}"?`)) return
    try {
      await apiFetch<{ message: string }>(`/admin/roles/${role.id}`, token, { method: 'DELETE' })
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
          <div className="brand-mark"><BarChart3 size={19} /></div>
          <div><strong>AI Gateway</strong><span>Admin Console</span></div>
        </div>
        <nav>
          <p className="nav-label">WORKSPACE</p>
          {pages.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={page === item.id ? 'active' : ''}
                onClick={() => {
                  setPage(item.id)
                  setSidebarOpen(false)
                }}
              >
                <Icon size={18} /><span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="server-status"><i /> API Online</div>
          <button className="logout-button" onClick={logout}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="topbar-title"><span>AI Gateway</span><ChevronDown size={14} /></div>
          <div className="topbar-actions">
            <button className="icon-button" onClick={() => void loadData()} title="Refresh" disabled={loading}><RefreshCw size={17} /></button>
            <div className="avatar">A</div>
          </div>
        </header>

        <div className="content">
          {error && (
            <div className="alert">
              <span>{error}</span>
              <button onClick={() => setError('')}><X size={15} /></button>
            </div>
          )}

          {page === 'dashboard' && (
            <DashboardPage
              providers={providers}
              models={models}
              usageLogs={usageLogs}
              usageSummary={usageSummary}
              onRefresh={() => void loadData()}
            />
          )}
          {page === 'playground' && <PlaygroundPage models={models} />}
          {page === 'providers' && (
            <ProvidersPage providers={providers} onAdd={() => setModal('provider')} />
          )}
          {page === 'models' && <ModelsPage models={models} />}
          {page === 'api-keys' && (
            <ApiKeysPage apiKeys={apiKeys} onCreate={() => setModal('api-key')} onRevoke={revokeApiKey} />
          )}
          {page === 'users' && (
            <RolesPage
              roles={roles}
              onAdd={() => {
                setEditingRole(null)
                setModal('role')
              }}
              onEdit={(role) => {
                setEditingRole(role)
                setModal('role')
              }}
              onDelete={deleteRole}
            />
          )}
          {page === 'logs' && <LogsPage usageLogs={usageLogs} onRefresh={() => void loadData()} />}
          {page === 'settings' && <SettingsPage />}
        </div>
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
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button>
              <button className="primary-button" type="submit">Add Provider</button>
            </div>
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
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button>
              <button className="primary-button" type="submit">Create Key</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'api-key-created' && (
        <Modal
          title="API Key Created"
          subtitle="Copy this key now. It cannot be shown again."
          onClose={() => setModal(null)}
        >
          <div className="created-key-content">
            <label>API key</label>
            <div className="created-key-box">
              <input
                readOnly
                value={createdApiKey}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button type="button" className="primary-button" onClick={() => void copyCreatedApiKey()}>
                {copiedApiKey ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="created-key-actions">
            <button type="button" className="primary-button" onClick={() => setModal(null)}>Done</button>
          </div>
        </Modal>
      )}

      {modal === 'role' && (
        <Modal
          title={editingRole ? `Edit ${editingRole.role_name}` : 'Add Role'}
          subtitle="Configure a role policy and model access"
          onClose={() => {
            setModal(null)
            setEditingRole(null)
          }}
        >
          <form className="modal-form" onSubmit={editingRole ? updateRole : createRole}>
            <div className="form-grid">
              {!editingRole && <label>Role name<input name="role_name" required placeholder="researcher" /></label>}
              <label>Requests per minute<input name="rpm" type="number" min="1" defaultValue={editingRole?.default_rate_limit_per_minute ?? 60} /></label>
              <label className="full-span">Description<input name="description" defaultValue={editingRole?.description ?? ''} placeholder="Role description" /></label>
              <label>Maximum budget (USD)<input name="budget" type="number" min="0" step="0.01" defaultValue={editingRole?.default_max_budget_usd ?? ''} placeholder="Leave empty for unlimited" /></label>
              <label>Allowed models<input name="allowed_models" defaultValue={editingRole?.allowed_models ?? '*'} placeholder="* or mock-,gemini-" /></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => {
                setModal(null)
                setEditingRole(null)
              }}>Cancel</button>
              <button className="primary-button" type="submit">{editingRole ? 'Save Changes' : 'Add Role'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default App
