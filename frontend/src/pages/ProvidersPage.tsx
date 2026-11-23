import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { PageHeading, StatusBadge } from '../components/Shared'
import type { Provider } from '../types'

export function ProvidersPage({
  providers,
  onAdd,
}: {
  providers: Provider[]
  onAdd: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = providers.filter((item) =>
    `${item.name} ${item.provider_type} ${item.default_model}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <PageHeading eyebrow="CONFIGURATION" title="Providers" action={
        <button className="primary-button" onClick={onAdd}><Plus size={16} /> Add Provider</button>
      } />
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search providers..." /></div>
          <span>{filtered.length} results</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Provider</th><th>Type</th><th>Base URL</th><th>Default Model</th><th>Priority</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((provider) => (
                <tr key={provider.id}>
                  <td><strong>{provider.name}</strong></td>
                  <td><span className="type-chip">{provider.provider_type}</span></td>
                  <td className="muted-cell">{provider.base_url}</td>
                  <td>{provider.default_model}</td>
                  <td>{provider.priority}</td>
                  <td><StatusBadge active={provider.is_active} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
