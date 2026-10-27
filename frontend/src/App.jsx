import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Inventory } from './pages/Inventory.jsx'
import { Sale } from './pages/Sale.jsx'
import { Return } from './pages/Return.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Restock } from './pages/Restock.jsx'
import { Reports } from './pages/Reports.jsx'

const nav = [
  { to: '/inventory', label: 'Inventory' },
  { to: '/sale', label: 'New Sale' },
  { to: '/return', label: 'Return' },
  { to: '/dashboard', label: 'Daily Sales' },
  { to: '/restock', label: 'Restock' },
  { to: '/reports', label: 'Reports' },
]

const linkCls = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-100 hover:bg-slate-700/60'
  }`

export function App() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="bg-slate-900 text-slate-100 sticky top-0 z-30 shadow">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="text-white font-semibold tracking-tight">
            StyleMart <span className="text-slate-400 font-normal">— Inventory &amp; Sales</span>
          </div>
          <nav className="flex gap-1 flex-wrap">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkCls}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/sale" element={<Sale />} />
          <Route path="/return" element={<Return />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/restock" element={<Restock />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      <footer className="bg-slate-900 text-center text-xs text-slate-400 py-2">
        Stock updates automatically via sales &amp; returns — PostgreSQL triggers
      </footer>
    </div>
  )
}
