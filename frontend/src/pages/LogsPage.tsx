import { Activity, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import type { UsageLog } from '../types'

export function LogsPage({
  usageLogs,
  onRefresh,
}: {
  usageLogs: UsageLog[]
  onRefresh: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = usageLogs.filter((log) =>
    `${log.request_id} ${log.provider_name} ${log.model_name}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">OBSERVABILITY</p><h1>Request Logs</h1></div>
        <button className="secondary-button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
      </section>
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request logs..." /></div>
          <span>{filtered.length} results</span>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Request ID</th><th>Provider</th><th>Model</th><th>Billing</th><th>Status</th><th>Latency</th><th>Prompt</th><th>Completion</th><th>Total Tokens</th><th>Cost</th></tr></thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td className="muted-cell">{log.request_id}</td>
                    <td>{log.provider_name}</td>
                    <td>{log.model_name}</td>
                    <td><span className="type-chip">{log.is_byok ? 'BYOK' : 'System'}</span></td>
                    <td><span className={`http-status ${log.status_code >= 400 ? 'error' : ''}`}>{log.status_code}</span></td>
                    <td>{log.latency_ms.toFixed(2)} ms</td>
                    <td>{log.prompt_tokens}</td>
                    <td>{log.completion_tokens}</td>
                    <td>{log.total_tokens}</td>
                    <td>${log.cost_usd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state large">
            <Activity size={28} />
            <strong>No requests recorded</strong>
            <p>Usage entries will appear after chat requests are processed.</p>
          </div>
        )}
      </section>
    </>
  )
}
