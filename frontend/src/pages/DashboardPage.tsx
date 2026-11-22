import { Activity, Boxes, Clock3, Database, Layers3, RefreshCw, ShieldCheck } from 'lucide-react'
import { MetricCard } from '../components/Shared'
import type { Provider, UsageLog, UsageSummary } from '../types'

export function DashboardPage({
  providers,
  models,
  usageLogs,
  usageSummary,
  onRefresh,
}: {
  providers: Provider[]
  models: Provider[]
  usageLogs: UsageLog[]
  usageSummary: UsageSummary | null
  onRefresh: () => void
}) {
  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">OVERVIEW</p><h1>Dashboard</h1></div>
        <button className="secondary-button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
      </section>

      <section className="metric-grid">
        <MetricCard label="Providers" value={providers.length} icon={<Boxes size={19} />} />
        <MetricCard label="Models" value={models.length} icon={<Layers3 size={19} />} tone="green" />
        <MetricCard label="API Requests" value={usageSummary?.total_requests ?? 0} icon={<Activity size={19} />} tone="purple" />
        <MetricCard label="Errors" value={usageSummary?.failed_requests ?? 0} icon={<ShieldCheck size={19} />} tone="amber" />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">ACTIVITY</p><h2>Request Status</h2></div></div>
          {usageSummary ? (
            <div className="status-metrics">
              <div><strong>{usageSummary.success_requests}</strong><span>Successful</span></div>
              <div className="failed"><strong>{usageSummary.failed_requests}</strong><span>Failed</span></div>
              <div><strong>{usageSummary.total_tokens}</strong><span>Total tokens</span></div>
            </div>
          ) : (
            <div className="empty-state compact"><Database size={22} /><div><strong>Loading request metrics</strong></div></div>
          )}
        </article>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">PERFORMANCE</p><h2>Processing Time</h2></div></div>
          {usageSummary ? (
            <div className="latency-metric">
              <Clock3 size={22} />
              <div><strong>{usageSummary.avg_latency_ms.toFixed(2)} ms</strong><span>Average processing time</span></div>
            </div>
          ) : (
            <div className="empty-state compact"><Clock3 size={22} /><div><strong>Loading latency</strong></div></div>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">RECENT</p><h2>Recent Requests</h2></div></div>
        {usageLogs.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Request ID</th><th>Provider</th><th>Model</th><th>Status</th><th>Latency</th><th>Tokens</th></tr></thead>
              <tbody>{usageLogs.slice(0, 8).map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td className="muted-cell">{log.request_id}</td>
                  <td>{log.provider_name}</td>
                  <td>{log.model_name}</td>
                  <td><span className={`http-status ${log.status_code >= 400 ? 'error' : ''}`}>{log.status_code}</span></td>
                  <td>{log.latency_ms.toFixed(2)} ms</td>
                  <td>{log.total_tokens}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><Activity size={26} /><strong>No requests recorded</strong><p>Usage entries will appear after chat requests are processed.</p></div>
        )}
      </section>
    </>
  )
}
