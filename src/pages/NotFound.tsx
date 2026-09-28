import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="card">
      <h1>Page not found</h1>
      <Link to="/">Back to opportunities</Link>
    </div>
  )
}
