import { useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeading, StatusBadge } from '../components/Shared'
import type { Provider } from '../types'

export function ModelsPage({ providers }: { providers: Provider[] }) {
  const [search, setSearch] = useState('')
  const filtered = providers.filter((item) =>
    `${item.default_model} ${item.name}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <PageHeading eyebrow="MODEL ROUTING" title="Models" />
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models..." /></div>
          <span>{filtered.length} models</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Model</th><th>Provider</th><th>Base URL</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((provider) => (
                <tr key={provider.id}>
                  <td><strong>{provider.default_model}</strong></td>
                  <td>{provider.name}</td>
                  <td className="muted-cell">{provider.base_url}</td>
                  <td><span className="type-chip">{provider.provider_type}</span></td>
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
