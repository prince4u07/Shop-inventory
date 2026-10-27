import { useEffect, useState } from 'react'
import { api, fmt } from '../lib/api.js'
import { Field, inputCls, ErrorBox } from '../components/ui.jsx'

export function Restock() {
  const [windowDays, setWindowDays] = useState(7)
  const [leadTime, setLeadTime] = useState(7)
  const [safetyStock, setSafetyStock] = useState(5)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function go() {
      try {
        const d = await api(`/insights?window=${windowDays}&leadTime=${leadTime}&safetyStock=${safetyStock}`)
        if (!cancelled) {
          setData(d)
          setError('')
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    go()
    return () => {
      cancelled = true
    }
  }, [windowDays, leadTime, safetyStock])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Fast-Moving &amp; Restock Suggestions</h1>
        <div className="flex items-end gap-3">
          <Field label="Analysis window">
            <select className={inputCls} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </Field>
          <Field label="Lead time (days)">
            <input type="number" min="1" className={`${inputCls} w-28`} value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value || 1))} />
          </Field>
          <Field label="Safety stock">
            <input type="number" min="0" className={`${inputCls} w-28`} value={safetyStock} onChange={(e) => setSafetyStock(Number(e.target.value || 0))} />
          </Field>
        </div>
      </div>

      <ErrorBox error={error} />

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Top 10 Fast-Movers</h2>
        <p className="mb-3 text-xs text-slate-400">Sell-through = units sold over last {windowDays} days ÷ current stock, ranked highest first</p>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Units Sold ({windowDays}d)</th>
              <th className="px-3 py-2 text-right">Current Stock</th>
              <th className="px-3 py-2 text-right">Sell-Through</th>
              <th className="px-3 py-2 text-right">Units/Day</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : data.fastMovers.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No sales in this window</td></tr>
            ) : (
              data.fastMovers.map((r, i) => (
                <tr key={r.productId} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{i + 1}</span>
                    <span className="font-medium">{r.name}</span>
                    <span className="ml-1 text-xs text-slate-400">{r.brand}{r.size ? ` · ${r.size}` : ''} · {r.sku}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.unitsSold}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.currentStock}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{(r.sellThrough * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.avgDailySales.toFixed(1)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Restock Suggestions</h2>
        <p className="mb-3 text-xs text-slate-400">
          Reorder Qty = (avg daily sales × {leadTime}d lead time) + {safetyStock} safety stock − current stock · products at or below reorder point
        </p>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Current Stock</th>
              <th className="px-3 py-2 text-right">Reorder Point</th>
              <th className="px-3 py-2 text-right">Avg Daily Sales</th>
              <th className="px-3 py-2 text-right">Sell-Through</th>
              <th className="px-3 py-2 text-right">Suggested Reorder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : data.needsRestock.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Nothing at or below the reorder point 🎉</td></tr>
            ) : (
              data.needsRestock.map((r) => (
                <tr key={r.productId} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="ml-1 text-xs text-slate-400">{r.brand}{r.size ? ` · ${r.size}` : ''}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.currentStock}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.reorderThreshold}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.avgDailySales}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{(r.sellThrough * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{r.reorderQty} units</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
