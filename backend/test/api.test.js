import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import assert from 'node:assert'

let app
let server
let port

async function main() {
  app = createApp()
  await new Promise((r) => {
    server = app.listen(0, () => {
      port = server.address().port
      r()
    })
  })
  const api = (path, opts = {}) =>
    fetch(`http://localhost:${port}/api${path}`, {
      headers: { 'content-type': 'application/json' },
      ...opts,
    })

  const results = []
  const expectError = async (name, path, opts, status, mustContain) => {
    const r = await api(path, { method: 'POST', ...opts })
    const body = await r.json()
    const ok = r.status === status && (!mustContain || String(body.error).includes(mustContain))
    results.push([name, ok ? 'PASS' : `FAIL status=${r.status} body=${JSON.stringify(body).slice(0, 120)}`, ''])
  }
  const expectOk = async (name, path, opts, status = 200) => {
    const r = await api(path, { ...opts })
    const body = await r.json()
    const ok = r.status === status
    results.push([name, ok ? 'PASS' : `FAIL status=${r.status} body=${JSON.stringify(body).slice(0, 120)}`, ''])
    return body
  }

  const products = await prisma.inventory.findMany({ take: 3, orderBy: { productId: 'asc' } })
  const p = products[0]

  await expectOk('GET /inventory lists items', '/inventory', {})
  await expectOk('GET /inventory filters by status', '/inventory?status=low_stock', {})
  await expectOk('GET /inventory/lookup autocomplete', `/inventory/lookup?search=${encodeURIComponent(p.name.split(' ')[0])}`, {})
  await expectError('POST /inventory requires fields', '/inventory', { body: JSON.stringify({}) }, 400, 'required')
  await expectError('POST /inventory rejects bad category', '/inventory', { body: JSON.stringify({ name: 'X', sku: `SKU-DUP-${Date.now()}`, category: 'Grocery', costPrice: 1, sellingPrice: 2 }) }, 400, 'Clothing or Footwear')

  const created = await expectOk('POST /inventory creates product', '/inventory', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Kurta', sku: `SKU-TST-${Date.now()}`, category: 'Clothing', subCategory: 'Ethnic', brand: 'W', size: 'M', color: 'Green', costPrice: 700, sellingPrice: 1299, reorderThreshold: 2, initialStock: 4 }),
  }, 201)
  assert.strictEqual(created.currentStock, 4, 'initialStock should post through adjustments')

  const patched = await expectOk('PUT /inventory edits non-stock fields', `/inventory/${created.productId}`, {
    method: 'PUT',
    body: JSON.stringify({ sellingPrice: 1399 }),
  })
  assert.strictEqual(patched.sellingPrice, 1399)

  await expectError('PUT /inventory blocks direct stock edit', `/inventory/${created.productId}`, {
    method: 'PUT',
    body: JSON.stringify({ currentStock: 100 }),
  }, 422, 'Stock cannot be edited directly')

  const newQty = created.currentStock
  await expectError('POST /sales rejects qty > stock (front-end guard)', '/sales', {
    method: 'POST',
    body: JSON.stringify({ productId: created.productId, qtySold: newQty + 1, paymentMode: 'Cash' }),
  }, 422, 'Quantity exceeds available stock')

  const paid = await expectOk('POST /sales ok', '/sales', {
    method: 'POST',
    body: JSON.stringify({ productId: created.productId, qtySold: 2, discount: 100, paymentMode: 'UPI' }),
  }, 201)
  assert.strictEqual(paid.currentStock, created.currentStock - 2, 'trigger should have deducted 2')
  assert.strictEqual(paid.lineTotal, 1399 * 2 - 100)

  await expectError('POST /returns rejects over-return', '/returns', {
    method: 'POST',
    body: JSON.stringify({ originalSaleId: paid.sale.saleId, productId: created.productId, qtyReturned: 3, reason: 'other', resellable: true }),
  }, 422, 'remain returnable')

  await expectError('POST /returns rejects foreign product', '/returns', {
    method: 'POST',
    body: JSON.stringify({ originalSaleId: paid.sale.saleId, productId: products[1].productId, qtyReturned: 1, reason: 'other', resellable: true }),
  }, 422)

  const resell = await expectOk('POST /returns ok (resellable)', '/returns', {
    method: 'POST',
    body: JSON.stringify({ originalSaleId: paid.sale.saleId, productId: created.productId, qtyReturned: 1, reason: 'wrong_size', resellable: true }),
  }, 201)
  assert.strictEqual(resell.currentStock, created.currentStock - 1, 'resellable return restocks 1')

  await expectOk('POST /returns ok (non-resellable)', '/returns', {
    method: 'POST',
    body: JSON.stringify({ originalSaleId: paid.sale.saleId, productId: created.productId, qtyReturned: 1, reason: 'damaged', resellable: false }),
  }, 201)

  await expectOk('GET /sales list', '/sales', {})
  await expectOk('GET /sale by id', `/sales/${paid.sale.saleId}`, {})

  const dash = await expectOk('GET /dashboard', '/dashboard', {})
  assert.ok(dash.revenue >= 0 && dash.trend.length === 7)

  const insights = await expectOk('GET /insights', '/insights', {})
  assert.ok(Array.isArray(insights.fastMovers) && Array.isArray(insights.needsRestock))

  const adj = await expectOk('POST /:id/adjustments stock-in', `/inventory/${created.productId}/adjustments`, {
    method: 'POST',
    body: JSON.stringify({ qtyChanged: 10, reason: 'stock_in', note: 'carton in' }),
  }, 201)
  assert.strictEqual(adj.currentStock, created.currentStock + 9)

  await expectError('adjustment invalid reason', `/inventory/${created.productId}/adjustments`, {
    method: 'POST',
    body: JSON.stringify({ qtyChanged: 1, reason: 'bogus' }),
  }, 400, 'stock_in')

  const csvInv = await api('/reports/inventory.csv')
  const csvSales = await api('/reports/sales.csv')
  results.push(['inventory CSV', csvInv.ok && csvInv.headers.get('content-type').includes('csv') ? 'PASS' : 'FAIL', ''])
  results.push(['sales CSV', csvSales.ok ? 'PASS' : 'FAIL', ''])

  console.table(results.map((r) => ({ check: r[0], result: r[1] })))
  const failed = results.filter((r) => r[1].startsWith('FAIL')).length
  console.log(failed ? `FAILURES: ${failed}` : 'ALL API CHECKS PASSED')
  process.exitCode = failed ? 1 : 0
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    if (server) server.close()
    await prisma.$disconnect()
  })
