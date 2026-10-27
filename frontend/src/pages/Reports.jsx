import { useState } from 'react'
import { api, fmt } from '../lib/api.js'
import { Field, inputCls, ErrorBox } from '../components/ui.jsx'

export function Reports() {
  const [date, setDate] = useState(fmt.today())
  const [sales, setSales] = useState([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = async (d = date) => {
    try {
      const rows = await api(`/sales?date=${d}`)
      setSales(rows)
      setLoaded(true)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Reports &amp; Export</h1>
      <ErrorBox error={error} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Inventory Report</h2>
          <p className="mt-1 text-sm text-slate-500">Full product list with current stock, prices, quantity × price stock value and status — as of now.</p>
          <a href="/api/reports/inventory.csv"
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Download inventory.csv
          </a>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Daily Sales Report</h2>
          <Field label="Date" hint="preview the transactions before exporting">
            <div className="flex gap-2">
              <input type="date" className={inputCls} value={date} max={fmt.today()}
                onChange={(e) => {
                  setDate(e.target.value)
                  load(e.target.value)
                }} />
              <button onClick={() => load()} className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                Preview
              </button>
              <a href={`/api/reports/sales.csv?date=${date}`}
                className="whitespace-nowrap rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Download CSV
              </a>
            </div>
          </Field>
          {loaded ? (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1">#</th>
                  <th className="py-1">Product</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.length === 0 ? (
                  <tr><td colSpan={4} className="py-3 text-center text-slate-400">No transactions on this date</td></tr>
                ) : (
                  sales.slice(0, 10).map((s) => (
                    <tr key={s.saleId}>
                      <td className="py-1">{s.saleId}</td>
                      <td className="py-1">{s.product.name}</td>
                      <td className="py-1 text-right tabular-nums">{s.qtySold}</td>
                      <td className="py-1 text-right tabular-nums">{fmt.money(s.lineTotal)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : null}
          {loaded && sales.length > 10 ? <p className="mt-1 text-xs text-slate-400">and {sales.length - 10} more…</p> : null}
        </div>
      </div>
    </div>
  )
}
