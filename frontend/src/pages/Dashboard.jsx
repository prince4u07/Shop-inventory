import { useEffect, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api, fmt } from '../lib/api.js'
import { SummaryCard, inputCls, ErrorBox } from '../components/ui.jsx'

export function Dashboard() {
  const [date, setDate] = useState(fmt.today())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [sales, setSales] = useState([])

  useEffect(() => {
    let cancelled = false
    async function go() {
      try {
        const [d, rows] = await Promise.all([api(`/dashboard?date=${date}`), api(`/sales?date=${date}`)])
        if (!cancelled) {
          setData(d)
          setSales(rows)
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
  }, [date])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Daily Sales</h1>
        <div className="flex items-center gap-2">
          <input type="date" className={`${inputCls} w-44`} value={date} max={fmt.today()} onChange={(e) => setDate(e.target.value)} />
          <a href={`/api/reports/sales.csv?date=${date}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            Export CSV
          </a>
        </div>
      </div>

      <ErrorBox error={error} />
      {!data ? <div className="py-10 text-center text-slate-400">Loading…</div> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <SummaryCard label="Units Sold" value={data.unitsSold} sub={`${data.salesCount} bill(s)`} />
            <SummaryCard label="Revenue" value={fmt.money(data.revenue)} />
            <SummaryCard label="Returns" value={`${data.unitsReturned} u`} sub={fmt.money(data.returnsValue)} />
            <SummaryCard label="Net Sales" value={fmt.money(data.netSales)} sub="sales − returns" />
            <SummaryCard label="Best Seller" value={data.bestSeller ? `${data.bestSeller.units} u` : '—'} sub={data.bestSeller ? data.bestSeller.name : 'no sales yet'} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">7-Day Sales Trend</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.trend} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="units" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="rev" orientation="right" tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value, name) => (name === 'Revenue' ? fmt.money(value) : value)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="units" dataKey="units" name="Units Sold" fill="#93c5fd" radius={[3, 3, 0, 0]} barSize={28} />
                  <Line yAxisId="rev" dataKey="revenue" name="Revenue" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Payment Modes</h2>
              {data.paymentModes.length === 0 ? <p className="text-sm text-slate-400">No sales yet</p> : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {data.paymentModes.map((m) => (
                      <tr key={m.mode}>
                        <td className="py-1.5">{m.mode}</td>
                        <td className="py-1.5 text-right tabular-nums">{m.units} u</td>
                        <td className="py-1.5 text-right tabular-nums font-medium">{fmt.money(m.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {data.unitsReturned > 0 ? (
                <p className="mt-3 text-xs text-slate-400">
                  {data.restockableUnits} returned unit(s) were resellable and went back to inventory
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Transactions ({sales.length})</h2>
              <div className="max-h-96 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5">Product</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-right">Price</th>
                      <th className="px-2 py-1.5 text-right">Disc</th>
                      <th className="px-2 py-1.5 text-right">Total</th>
                      <th className="px-2 py-1.5">Mode</th>
                      <th className="px-2 py-1.5">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sales.length === 0 ? (
                      <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">No transactions</td></tr>
                    ) : (
                      sales.map((s) => (
                        <tr key={s.saleId} className="hover:bg-slate-50">
                          <td className="px-2 py-1.5">{s.saleId}</td>
                          <td className="px-2 py-1.5">{s.product.name} <span className="text-xs text-slate-400">{s.product.sku}</span></td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {s.qtySold}{s.unitsReturned ? <span className="ml-1 text-xs text-slate-400">(−{s.unitsReturned})</span> : null}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{fmt.money(s.sellingPrice)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{s.discount ? fmt.money(s.discount) : '—'}</td>
                          <td className="px-2 py-1.5 text-right font-medium tabular-nums">{fmt.money(s.lineTotal)}</td>
                          <td className="px-2 py-1.5">{s.paymentMode}</td>
                          <td className="px-2 py-1.5 text-slate-400">{s.saleTime ? String(s.saleTime).slice(0, 5) : ''}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
