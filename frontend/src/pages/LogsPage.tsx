import { useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeading } from '../components/Shared'
import type { AuditLog, UsageLog } from '../types'

export function LogsPage({
  usageLogs,
  auditLogs,
}: {
  usageLogs: UsageLog[]
  auditLogs: AuditLog[]
}) {
  const [tab, setTab] = useState<'usage' | 'audit'>('usage')
  const [search, setSearch] = useState('')
  const usageFiltered = usageLogs.filter((log) =>
    `${log.request_id} ${log.model_name} ${log.provider_name}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <PageHeading eyebrow="OBSERVABILITY" title="Logs" />
      <section className="panel">
        <div className="tab-row">
          <button className={tab === 'usage' ? 'active' : ''} onClick={() => setTab('usage')}>Request Logs</button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Audit Logs</button>
        </div>
        {tab === 'usage' ? (
          <>
            <div className="table-toolbar">
              <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request logs..." /></div>
              <span>{usageFiltered.length} results</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Time</th><th>Request ID</th><th>Model</th><th>Provider</th><th>Tokens</th><th>Latency</th><th>Cost</th><th>Status</th><th>BYOK</th></tr></thead>
                <tbody>
                  {usageFiltered.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.created_at).toLocaleString()}</td>
                      <td className="muted-cell">{log.request_id}</td>
                      <td><strong>{log.model_name}</strong></td>
                      <td>{log.provider_name}</td>
                      <td>{log.total_tokens}</td>
                      <td>{log.latency_ms.toFixed(2)} ms</td>
                      <td>${log.cost_usd.toFixed(6)}</td>
                      <td><span className={`request-status ${log.status_code < 400 ? 'success' : 'failure'}`}>{log.status_code}</span></td>
                      <td>{log.is_byok ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Details</th><th>IP Address</th></tr></thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td><span className="type-chip">{log.action}</span></td>
                    <td>{log.target_resource}</td>
                    <td className="muted-cell">{log.details || '—'}</td>
                    <td>{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
