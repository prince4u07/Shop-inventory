import express from 'express'
import { inventoryRouter } from './routes/inventory.js'
import { salesRouter } from './routes/sales.js'
import { returnsRouter } from './routes/returns.js'
import { dashboardRouter } from './routes/dashboard.js'
import { insightsRouter } from './routes/insights.js'
import { reportsRouter } from './routes/reports.js'

// light per-IP, in-memory sliding window: 300 req / 10 s is far above any
// legitimate UI burst but blunts script floods / connection-pool exhaustion
const rushWindowMs = 10_000
const rushLimit = 600
const recent = new Map()
setInterval(() => {
  const cutoff = Date.now() - rushWindowMs
  for (const [ip, hits] of recent) {
    const alive = hits.filter((t) => t > cutoff)
    if (alive.length === 0) recent.delete(ip)
    else recent.set(ip, alive)
  }
}, rushWindowMs).unref()

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || '?'
  const now = Date.now()
  const hits = (recent.get(ip) || []).filter((t) => t > now - rushWindowMs)
  if (hits.length >= rushLimit) return res.status(429).json({ error: 'Too many requests — slow down' })
  hits.push(now)
  recent.set(ip, hits)
  next()
}

export function createApp() {
  const app = express()
  // NO wide-open cors: the UI calls /api through the same-origin Vite proxy.
  app.set('trust proxy', false)
  app.use(rateLimit)
  app.use(express.json({ limit: '100kb' }))

  const api = express.Router()
  api.get('/health', (req, res) => res.json({ ok: true }))
  api.use('/inventory', inventoryRouter)
  api.use('/sales', salesRouter)
  api.use('/returns', returnsRouter)
  api.use('/dashboard', dashboardRouter)
  api.use('/insights', insightsRouter)
  api.use('/reports', reportsRouter)
  app.use('/api', api)

  // unknown API paths -> JSON 404 (keeps API responses consistent)
  app.use('/api', (req, res) => res.status(404).json({ error: `Unknown endpoint: ${req.method} ${req.originalUrl.slice(0, 120)}` }))

  // body-parse and other framework errors -> precise JSON statuses
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' })
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' })
    res.status(err.statusCode || 500).json({ error: String(err.message || 'Internal server error').slice(0, 300) })
  })
  return app
}
