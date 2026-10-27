import { useEffect, useMemo, useState } from 'react'
import { api, fmt } from '../lib/api.js'
import { StatusBadge, SummaryCard, Field, Modal, inputCls, ErrorBox, Toast } from '../components/ui.jsx'

const EMPTY_PRODUCT = {
  name: '', sku: '', category: 'Clothing', subCategory: '', brand: '', size: '', color: '',
  costPrice: '', sellingPrice: '', reorderThreshold: 3, supplier: '', imageUrl: '', initialStock: '',
}

export function Inventory() {
  const [data, setData] = useState({ items: [], summary: null })
  const [filters, setFilters] = useState({ search: '', category: '', subCategory: '', brand: '', size: '', status: '' })
  const [opts, setOpts] = useState({ categories: [], subCategories: [], brands: [], sizes: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState(null) // {mode:'add'|'edit'|'adjust', product}

  const load = useMemo(
    () => async (f) => {
      setLoading(true)
      try {
        const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
        const [inv, o] = await Promise.all([api(`/inventory?${qs}`), api('/inventory/filters')])
        setData(inv)
        setOpts(o)
        setError('')
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    load(filters)
  }, [filters, load])

  const saved = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
    load(filters)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <button
          onClick={() => setModal({ mode: 'add' })}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Product
        </button>
      </div>

      <ErrorBox error={error} />
      <Toast message={toast} />

      {data.summary ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="Total Products" value={data.summary.totalProducts} sub={`${data.summary.totalUnits} units`} />
          <SummaryCard label="Total Stock Value" value={fmt.money(data.summary.totalStockValue)} sub="at selling price" />
          <SummaryCard label="Low Stock" value={data.summary.lowStockCount} sub="at or below reorder point" />
          <SummaryCard label="Out of Stock" value={data.summary.outOfStockCount} sub="needs immediate restock" />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        <Field label="Search">
          <input className={inputCls} placeholder="Name or SKU…" value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </Field>
        <Field label="Category">
          <select className={inputCls} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value, subCategory: '' })}>
            <option value="">All</option>
            {opts.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Sub-category">
          <select className={inputCls} value={filters.subCategory} onChange={(e) => setFilters({ ...filters, subCategory: e.target.value })}>
            <option value="">All</option>
            {opts.subCategories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Brand">
          <select className={inputCls} value={filters.brand} onChange={(e) => setFilters({ ...filters, brand: e.target.value })}>
            <option value="">All</option>
            {opts.brands.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Size">
          <select className={inputCls} value={filters.size} onChange={(e) => setFilters({ ...filters, size: e.target.value })}>
            <option value="">All</option>
            {opts.sizes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </Field>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">Brand</th>
              <th className="px-3 py-2.5">Size</th>
              <th className="px-3 py-2.5">Color</th>
              <th className="px-3 py-2.5 text-right">Stock</th>
              <th className="px-3 py-2.5 text-right">Price</th>
              <th className="px-3 py-2.5 text-right">Stock Value</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No products match the filters</td></tr>
            ) : (
              data.items.map((p) => (
                <tr key={p.productId} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-400">{p.sku}{p.subCategory ? ` · ${p.subCategory}` : ''}</div>
                  </td>
                  <td className="px-3 py-2">{p.category}</td>
                  <td className="px-3 py-2">{p.brand || '—'}</td>
                  <td className="px-3 py-2">{p.size || '—'}</td>
                  <td className="px-3 py-2">{p.color || '—'}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{p.currentStock}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.money(p.sellingPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt.money(p.stockValue)}</td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setModal({ mode: 'edit', product: p })} className="text-blue-600 hover:underline">Edit</button>
                    <span className="mx-2 text-slate-300">|</span>
                    <button onClick={() => setModal({ mode: 'adjust', product: p })} className="text-blue-600 hover:underline">Stock-in</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal ? <ProductModal modal={modal} onClose={() => setModal(null)} onSaved={saved} /> : null}
    </div>
  )
}

function ProductModal({ modal, onClose, onSaved }) {
  const { mode, product } = modal
  const [form, setForm] = useState(mode === 'edit' ? { ...pickFields(product) } : { ...EMPTY_PRODUCT })
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('stock_in')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      if (mode === 'adjust') {
        const n = parseInt(qty, 10)
        if (!Number.isInteger(n) || n === 0) throw new Error('Enter a non-zero quantity (use a negative number for a downward correction)')
        await api(`/inventory/${product.productId}/adjustments`, {
          method: 'POST',
          body: JSON.stringify({ qtyChanged: reason === 'correction' ? -n : n, reason, note }),
        })
        onSaved('Stock adjustment recorded')
      } else if (mode === 'edit') {
        await api(`/inventory/${product.productId}`, { method: 'PUT', body: JSON.stringify(form) })
        onSaved('Product updated')
      } else {
        await api('/inventory', { method: 'POST', body: JSON.stringify(form) })
        onSaved('Product added')
      }
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={mode === 'adjust' ? `Stock adjustment — ${product.name}` : mode === 'edit' ? `Edit — ${product.name}` : 'Add Product'} onClose={onClose} wide>
      <ErrorBox error={error} />
      {mode === 'adjust' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Current stock: <span className="font-semibold text-slate-900">{product.currentStock}</span>. Adjustments are logged to the stock_adjustments audit table.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reason">
              <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="stock_in">Stock In (add units)</option>
                <option value="correction">Correction (remove units)</option>
              </select>
            </Field>
            <Field label="Quantity" hint={reason === 'correction' ? 'entered value will be subtracted' : 'entered value will be added'}>
              <input type="number" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 10" />
            </Field>
          </div>
          <Field label="Note">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. new carton from supplier" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={submit} disabled={busy} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Saving…' : 'Apply Adjustment'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="SKU"><input className={inputCls} value={form.sku} disabled={mode === 'edit'} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label="Category">
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option>Clothing</option>
                <option>Footwear</option>
              </select>
            </Field>
            <Field label="Sub-category"><input className={inputCls} value={form.subCategory} onChange={(e) => setForm({ ...form, subCategory: e.target.value })} placeholder="Shirt / Sneakers / …" /></Field>
            <Field label="Brand"><input className={inputCls} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Size"><input className={inputCls} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="L / UK-8 / …" /></Field>
            <Field label="Color"><input className={inputCls} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
            <Field label="Supplier"><input className={inputCls} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
            <Field label="Cost Price (₹)"><input type="number" className={inputCls} value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></Field>
            <Field label="Selling Price (₹)"><input type="number" className={inputCls} value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} /></Field>
            <Field label="Reorder Threshold" hint="stock at or below this shows Low Stock"><input type="number" className={inputCls} value={form.reorderThreshold} onChange={(e) => setForm({ ...form, reorderThreshold: e.target.value })} /></Field>
            {mode === 'add' ? (
              <Field label="Initial Stock" hint="recorded as a stock_in ledger entry, not a direct edit">
                <input type="number" className={inputCls} value={form.initialStock} onChange={(e) => setForm({ ...form, initialStock: e.target.value })} />
              </Field>
            ) : (
              <Field label="Current Stock" hint="read-only — changes only via sales, returns or adjustments">
                <input className={inputCls} value={product.currentStock} disabled />
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={submit} disabled={busy} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function pickFields(p) {
  return {
    name: p.name, sku: p.sku, category: p.category, subCategory: p.subCategory || '', brand: p.brand || '',
    size: p.size || '', color: p.color || '', costPrice: p.costPrice, sellingPrice: p.sellingPrice,
    reorderThreshold: p.reorderThreshold, supplier: p.supplier || '', imageUrl: p.imageUrl || '',
  }
}
