import { useState } from 'react'
import { api, fmt } from '../lib/api.js'
import { Field, inputCls, ErrorBox, Toast } from '../components/ui.jsx'

export function Return() {
  const [method, setMethod] = useState('id') // 'id' | 'list'
  const [saleId, setSaleId] = useState('')
  const [listDate, setListDate] = useState(fmt.today())
  const [list, setList] = useState(null)
  const [sale, setSale] = useState(null)
  const [form, setForm] = useState({ qty: 1, reason: 'wrong_size', resellable: true })
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  const loadSale = async (id) => {
    setError('')
    setSale(null)
    try {
      const s = await api(`/sales/${id}`)
      if (s.qtySold === s.unitsReturned) throw new Error('All units of this sale are already returned')
      setSale(s)
    } catch (e) {
      setError(e.message)
    }
  }

  const loadList = async (date) => {
    setError('')
    try {
      const rows = await api(`/sales?date=${date}`)
      setList(rows)
    } catch (e) {
      setError(e.message)
    }
  }

  const maxReturn = sale ? sale.qtySold - sale.unitsReturned : 0

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await api('/returns', {
        method: 'POST',
        body: JSON.stringify({
          originalSaleId: sale.saleId,
          productId: sale.productId,
          qtyReturned: form.qty,
          reason: form.reason,
          resellable: form.resellable,
        }),
      })
      setToast(
        `Return recorded${form.resellable ? ` — ${form.qty} unit(s) added back to stock (now ${r.currentStock})` : ' — marked non-resellable, stock unchanged'}`,
      )
      setTimeout(() => setToast(''), 5000)
      await loadSale(sale.saleId)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Return Entry</h1>
      <ErrorBox error={error} />
      <Toast message={toast} />

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm w-fit">
        {[['id', 'By Sale ID'], ['list', 'By Date / Product']].map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${method === m ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {method === 'id' ? (
        <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <Field label="Sale ID">
            <input className={inputCls} placeholder="e.g. 123" value={saleId} onChange={(e) => setSaleId(e.target.value)} />
          </Field>
          <button onClick={() => loadSale(saleId)} disabled={!saleId}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
            Find Sale
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-end gap-2">
            <Field label="Sale Date">
              <input type="date" className={inputCls} value={listDate}
                onChange={(e) => {
                  setListDate(e.target.value)
                  if (e.target.value) loadList(e.target.value)
                }} />
            </Field>
            <button onClick={() => loadList(listDate)} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Search
            </button>
          </div>
          {list ? (
            <div className="mt-4 max-h-80 overflow-y-auto rounded-md border border-slate-200">
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {list.length === 0 ? (
                    <tr><td className="px-3 py-6 text-center text-slate-400">No sales on this date</td></tr>
                  ) : (
                    list.map((s) => (
                      <tr key={s.saleId} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <button
                            onClick={() => loadSale(s.saleId)}
                            className="text-left text-blue-600 hover:underline"
                            disabled={s.qtySold === s.unitsReturned}
                          >
                            #{s.saleId} · {s.product.name}{s.product.size ? ` (${s.product.size})` : ''} · {s.qtySold} sold
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400">
                          {s.qtySold === s.unitsReturned ? 'fully returned' : `${s.qtySold - s.unitsReturned} returnable`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {sale ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-600">
            Sale <span className="font-semibold text-slate-900">#{sale.saleId}</span> · {sale.product.name} ({sale.product.sku}) ·{' '}
            qty <span className="font-semibold text-slate-900">{sale.qtySold}</span> ·{' '}
            {fmt.money2(sale.sellingPrice)} each · already returned <span className="font-semibold">{sale.unitsReturned}</span> ·{' '}
            <span className="font-semibold">{maxReturn}</span> returnable
          </div>
          {sale.returns.length > 0 ? (
            <div className="rounded bg-slate-50 p-2 text-xs text-slate-500">
              Prior returns: {sale.returns.map((r) => `#${r.returnId} ↔ ${r.qtyReturned}u ${r.reason}${r.resellable ? '' : ' (non-resellable)'}`).join(' · ')}
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Return Quantity">
              <input type="number" min="1" max={maxReturn} className={inputCls} value={form.qty}
                onChange={(e) => setForm({ ...form, qty: parseInt(e.target.value || 0, 10) })} />
            </Field>
            <Field label="Reason">
              <select className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                <option value="damaged">Damaged</option>
                <option value="wrong_size">Wrong Size</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Resellable?" hint="stock is added back only if resellable">
              <select className={inputCls} value={form.resellable} onChange={(e) => setForm({ ...form, resellable: e.target.value === 'true' })}>
                <option value="true">Yes — back to inventory</option>
                <option value="false">No — damaged/write-off</option>
              </select>
            </Field>
          </div>
          {form.qty > maxReturn ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Only {maxReturn} unit(s) remain returnable</div> : null}
          <div className="flex justify-end pt-2">
            <button onClick={submit} disabled={busy || form.qty < 1 || form.qty > maxReturn}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              {busy ? 'Recording…' : 'Record Return'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
