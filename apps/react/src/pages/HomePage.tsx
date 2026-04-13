import { Link } from 'react-router-dom'

const rootStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  background: '#f8fafc',
}

const cardStyle: React.CSSProperties = {
  maxWidth: '860px',
  margin: '0 auto',
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '24px',
}

const linkStyle: React.CSSProperties = {
  color: '#0f766e',
  fontWeight: 700,
}

export function HomePage() {
  return (
    <main style={rootStyle}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>Gantt Editor React Demo</h1>
        <p>
          This app mirrors the Vue demo shell and router shape and starts with a single migrated route.
        </p>
        <ul>
          <li>
            <Link to="/small-example" style={linkStyle}>
              Small example
            </Link>
          </li>
        </ul>
      </section>
    </main>
  )
}
