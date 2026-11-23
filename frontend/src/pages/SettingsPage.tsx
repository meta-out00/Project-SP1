import { PageHeading } from '../components/Shared'

export function SettingsPage() {
  return (
    <>
      <PageHeading eyebrow="SYSTEM" title="Settings" />
      <section className="settings-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Runtime</p><h2>API Configuration</h2></div></div>
          <dl className="settings-list">
            <div><dt>Admin API</dt><dd>/api/admin</dd></div>
            <div><dt>Chat API</dt><dd>/api/v1/chat/completions</dd></div>
            <div><dt>Health check</dt><dd>/api/health</dd></div>
          </dl>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Security</p><h2>Access</h2></div></div>
          <dl className="settings-list">
            <div><dt>Admin authentication</dt><dd>JWT Bearer</dd></div>
            <div><dt>Virtual API key</dt><dd>SHA-256 + RBAC</dd></div>
            <div><dt>Provider key storage</dt><dd>Fernet encryption</dd></div>
          </dl>
        </article>
      </section>
    </>
  )
}
