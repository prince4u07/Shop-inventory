import { useEffect, useState } from 'react'
import { api, fmt } from '../lib/api.js'
import { Field, StatusBadge, inputCls, ErrorBox, Toast } from '../components/ui.jsx'

export function Sale() {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState([])
  const [showMatches, setShowMatches] = useState(false)
  const [product, setProduct] = useState(null)
  const [form, setForm] = useState({ qty: 1, discount: 0, paymentMode: 'Cash' })
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const searching = query.trim().length >= 2

  useEffect(() => {
    if (!searching) {
      setMatches([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const items = await api(`/inventory/lookup?search=${encodeURIComponent(query.trim())}`)
        setMatches(items)
        setShowMatches(true)
      } catch (e) {
        setError(e.message)
      }
    }, 180)
    return () => clearTimeout(t)
  }, [query, searching])

  const pick = (p) => {
    setProduct(p)
    setQuery(`${p.name} (${p.sku})`)
    setShowMatches(false)
    setError('')
  }

  const qtyError = product && form.qty > product.currentStock
    ? `Quantity exceeds available stock. Available: ${product.currentStock}`
    : ''

  const cost = product ? product.sellingPrice * form.qty - form.discount : 0

  const submit = async () => {
    if (!product || qtyError) return
    setBusy(true)
    setError('')
    try {
      await api('/sales', {
        method: 'POST',
        body: JSON.stringify({ productId: product.productId, qtySold: form.qty, discount: form.discount, paymentMode: form.paymentMode }),
      })
      setToast(`Sale recorded — stock updated to ${product.currentStock - form.qty} units`)
      setTimeout(() => setToast(''), 4000)
      setProduct({ ...product, currentStock: product.currentStock - form.qty })
      setForm({ qty: 1, discount: 0, paymentMode: 'Cash' })
      setQuery('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">New Sale</h1>
      <ErrorBox error={error} />
      <Toast message={toast} />

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <Field label="Product" hint="search by name, brand or SKU">
          <div className="relative">
            <input
              className={inputCls}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setProduct(null)
              }}
              onFocus={() => searching && setShowMatches(true)}
              onBlur={() => setTimeout(() => setShowMatches(false), 150)}
              placeholder="Start typing…"
              autoComplete="off"
            />
            {showMatches && searching ? (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {matches.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-400">No products found</div>
                ) : (
                  matches.map((m) => (
                    <button
                      key={m.productId}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(m)}
                    >
                      <span>
                        <span className="font-medium">{m.name}</span>
                        <span className="block text-xs text-slate-400">{m.sku} · {m.brand}{m.size ? ` · ${m.size}` : ''}</span>
                      </span>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="tabular-nums text-slate-700">{fmt.money(m.sellingPrice)}</span>
                        <span className="text-xs text-slate-400">{m.currentStock} left</span>
                        <StatusBadge status={m.stockStatus} />
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </Field>

        {product ? (
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            {product.name} · {product.sku}
            <span className="float-right">
              Price <span className="font-semibold text-slate-900">{fmt.money(product.sellingPrice)}</span> ·{' '}
              <span className="font-semibold text-slate-900">{product.currentStock}</span> in stock
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantity">
            <input type="number" min="1" className={inputCls} value={form.qty} onChange={(e) => setForm({ ...form, qty: parseInt(e.target.value || 0, 10) })} />
          </Field>
          <Field label="Discount (₹)">
            <input type="number" min="0" className={inputCls} value={form.discount} onChange={(e) => setForm({ ...form, discount: Number(e.target.value || 0) })} />
          </Field>
          <Field label="Payment Mode">
            <select className={inputCls} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
              <option>Cash</option>
              <option>UPI</option>
              <option>Card</option>
            </select>
          </Field>
        </div>

        {qtyError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{qtyError}</div> : null}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="text-sm text-slate-500">
            Total: <span className="text-lg font-semibold text-slate-900">{fmt.money(cost)}</span>
          </div>
          <button onClick={submit} disabled={!product || !!qtyError || busy || form.qty < 1}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? 'Recording…' : 'Record Sale'}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Stock is deducted automatically by a database trigger — inventory.current_stock is never edited manually.
        </p>
      </div>
    </div>
  )
}
