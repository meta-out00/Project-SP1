import { Plus } from 'lucide-react'
import { PageHeading } from '../components/Shared'
import type { Role } from '../types'

export function RolesPage({
  roles,
  onAdd,
  onEdit,
  onDelete,
}: {
  roles: Role[]
  onAdd: () => void
  onEdit: (role: Role) => void
  onDelete: (role: Role) => void
}) {
  return (
    <>
      <PageHeading eyebrow="POLICY MANAGEMENT" title="Users / Roles" action={
        <button className="primary-button" onClick={onAdd}><Plus size={16} /> Add Role</button>
      } />
      <section className="card-grid">
        {roles.map((role) => (
          <article className="role-card" key={role.id}>
            <div className="role-card-heading">
              <div className="role-avatar">{role.role_name.slice(0, 2).toUpperCase()}</div>
              <div><h2>{role.role_name}</h2><p>{role.description || 'No description'}</p></div>
            </div>
            <div className="role-stats">
              <div><span>RPM</span><strong>{role.default_rate_limit_per_minute}</strong></div>
              <div><span>Budget</span><strong>{role.default_max_budget_usd == null ? 'Unlimited' : `$${role.default_max_budget_usd}`}</strong></div>
            </div>
            <p className="allowed-models"><span>Allowed models</span><strong>{role.allowed_models}</strong></p>
            <div className="role-actions">
              <button className="secondary-button" onClick={() => onEdit(role)}>Edit</button>
              {role.role_name !== 'admin' && <button className="danger-text" onClick={() => onDelete(role)}>Delete</button>}
            </div>
          </article>
        ))}
      </section>
    </>
  )
}
