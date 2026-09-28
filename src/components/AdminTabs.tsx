import { NavLink } from 'react-router-dom'

export default function AdminTabs() {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      <NavLink to="/admin/insights">Insights</NavLink>
      <NavLink to="/admin" end>
        Manage
      </NavLink>
    </nav>
  )
}
