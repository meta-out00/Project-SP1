import { Activity } from 'lucide-react'
import { PageHeading } from '../components/Shared'
import type { Analytics, Provider, UsageLog } from '../types'

export function DashboardPage({
  analytics,
  providers,
  logs,
}: {
  analytics: Analytics | null
  providers: Provider[]
  logs: UsageLog[]
}) {
  const models = new Set(providers.map((provider) => provider.default_model))
  const cards = [
    { label: 'Providers', value: providers.length, tone: 'blue' },
    { label: 'Models', value: models.size, tone: 'purple' },
    { label: 'API Requests', value: analytics?.total_requests ?? 0, tone: 'green' },
    { label: 'Errors', value: analytics?.failed_requests ?? 0, tone: 'red' },
  ]

  return (
    <>
      <PageHeading eyebrow="OVERVIEW" title="Dashboard" />
      <section className="metric-grid">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <div className={`metric-icon ${card.tone}`}><Activity size={18} /></div>
            <div><p>{card.label}</p><strong>{card.value}</strong></div>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Traffic</p><h2>Request Status</h2></div></div>
          <div className="status-summary">
            <div><span className="success-dot" /><strong>{analytics?.success_requests ?? 0}</strong><p>Successful</p></div>
            <div><span className="error-dot" /><strong>{analytics?.failed_requests ?? 0}</strong><p>Failed</p></div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="panel-kicker">Performance</p><h2>Processing Time</h2></div></div>
          <div className="latency-value"><strong>{analytics?.avg_latency_ms ?? 0}</strong><span> ms average</span></div>
        </article>
      </section>
      <article className="panel">
        <div className="panel-heading"><div><p className="panel-kicker">Recent activity</p><h2>Recent Requests</h2></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Model</th><th>Provider</th><th>Status</th><th>Latency</th><th>Cost</th></tr></thead>
            <tbody>
              {logs.slice(0, 8).map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td><strong>{log.model_name}</strong></td>
                  <td>{log.provider_name}</td>
                  <td><span className={`request-status ${log.status_code < 400 ? 'success' : 'failure'}`}>{log.status_code}</span></td>
                  <td>{log.latency_ms.toFixed(2)} ms</td>
                  <td>${log.cost_usd.toFixed(6)}</td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan={6}><div className="table-empty">No requests found</div></td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </>
  )
}
