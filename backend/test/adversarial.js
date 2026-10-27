// Reverse / adversarial testing for the Shop Inventory API.
// Sections: A positive smoke · B invalid/negative inputs · C SQL-injection battery
//           D CSV/sheet-injection · E fuzz & infrastructure · F concurrency races
//           G second-order injection · H cleanup + integrity
// Hard rule: NO response may ever be a 5xx — any 5xx is a FAIL. Backend must survive.
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import pg from 'pg'

const PREFIX = 'ADVS-'
const results = []
let server, port, base

const req = async (method, path, bodyRaw, extraHeaders = {}) => {
  const t0 = Date.now()
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(bodyRaw !== undefined ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
    body: bodyRaw !== undefined ? (typeof bodyRaw === 'string' ? bodyRaw : JSON.stringify(bodyRaw)) : undefined,
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { status: res.status, body, text, ms: Date.now() - t0 }
}

async function rec(name, r, expectStatus, opts = {}) {
  const is5xx = r.status >= 500
  let ok = !is5xx
  if (expectStatus !== undefined) ok = ok && r.status === expectStatus
  if (opts.errorContains) ok = ok && String(r.body?.error || r.body?.raw || '').includes(opts.errorContains)
  if (opts.latencyLt) ok = ok && r.ms < opts.latencyLt
  results.push([name, ok ? 'PASS' : `FAIL(${r.status})`, r.status, is5xx])
  return ok
}

const INJ = [
  "' OR '1'='1",
  "'; DROP TABLE sales_transactions; --",
  "'; DROP TABLE inventory; --",
  "1' UNION SELECT NULL, current_user, NULL --",
  "'; DELETE FROM inventory; --",
  "'||pg_sleep(3)||'",
  "admin'/**/OR/**/1=1/**/--",
  "\\' OR 1=1 --",
  "%27 OR 1=1 --",
  "' OR sku LIKE '%%",
  "1 UNION ALL SELECT 1",
  "'; CLUSTER; --",
  "' AND 1=CAST((SELECT COUNT(*) FROM returns) AS INT) --",
]

async function main() {
  const app = createApp()
  await new Promise((r) => {
    server = app.listen(0, () => {
      port = server.address().port
      base = `http://localhost:${port}/api`
      r()
    })
  })

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()

  const tablesBefore = await db.query(
    "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'",
  )
  const salesBefore = await db.query('SELECT count(*)::int n FROM sales_transactions')
  const invBefore = await db.query('SELECT count(*)::int n FROM inventory')

  /* ============ A. POSITIVE SMOKE ============ */
  const created = await req('POST', '/inventory', {
    name: 'Adv Probe Shirt', sku: `${PREFIX}001`, category: 'Clothing', subCategory: 'Shirt',
    brand: 'AdvTest', size: 'M', color: 'Black', costPrice: 100, sellingPrice: 250, reorderThreshold: 2, initialStock: 12,
  })
  await rec('A1 create product w/ opening stock', created, 201)
  await rec('A2 product fields back', { status: created.body.currentStock === 12 ? 200 : 999, body: {} }, 200)
  const pid = created.body.productId

  await rec('A3 get product', await req('GET', `/inventory/${pid}`), 200)
  await rec('A4 filters endpoint', await req('GET', '/inventory/filters'), 200)
  await rec('A5 sale ok', await req('POST', '/sales', { productId: pid, qtySold: 2, discount: 10, paymentMode: 'UPI' }), 201)
  await rec('A6 stock after sale', { status: (await req('GET', `/inventory/${pid}`)).body.product.currentStock === 10 ? 200 : 999, body: {} }, 200)
  const saleList = await req('GET', '/sales')
  await rec('A7 sales list today', saleList, 200)
  const mySale = saleList.body.find((s) => s.product.sku === `${PREFIX}001`)
  await rec('A8 sale by id', await req('GET', `/sales/${mySale.saleId}`), 200)
  await rec('A9 resellable return', await req('POST', '/returns', { originalSaleId: mySale.saleId, productId: pid, qtyReturned: 1, reason: 'wrong_size', resellable: true }), 201)
  await rec('A10 stock after return', { status: (await req('GET', `/inventory/${pid}`)).body.product.currentStock === 11 ? 200 : 999, body: {} }, 200)
  await rec('A11 dashboard', await req('GET', '/dashboard'), 200)
  await rec('A12 insights', await req('GET', '/insights'), 200)
  await rec('A13 inventory csv', await req('GET', '/reports/inventory.csv'), 200)
  await rec('A14 sales csv', await req('GET', '/reports/sales.csv'), 200)
  await rec('A15 return by product listing', await req('GET', '/returns'), 200)

  /* ============ B. INVALID / NEGATIVE INPUTS ============ */
  const B = async (name, method, path, bodyRaw, expectStatus, opts) =>
    rec(name, await req(method, path, bodyRaw), expectStatus, opts)

  await B('B1 GET bad product id (text)', 'GET', '/inventory/abc', undefined, 400)
  await B('B2 GET product id with quote', 'GET', "/inventory/1'%20OR%20'1'='1", undefined, 400)
  await B('B3 GET nonexistent product id', 'GET', '/inventory/99999999', undefined, 404)
  await B('B4 GET sale id text', 'GET', '/sales/boom', undefined, 400)
  await B('B5 GET nonexistent sale', 'GET', '/sales/99999999', undefined, 404)
  await B('B6 adjustments bad id', 'POST', `/inventory/1.5/adjustments`, { qtyChanged: 1, reason: 'stock_in' }, 400)
  await B('B7 PUT non-numeric id', 'PUT', '/inventory/undefined', { name: 'x' }, 400)
  await B('B8 sale productId boolean', 'POST', '/sales', { productId: true, qtySold: 1, paymentMode: 'Cash' }, 400)
  await B('B9 sale productId array', 'POST', '/sales', { productId: [1], qtySold: 1, paymentMode: 'Cash' }, 400)
  await B('B10 sale productId float', 'POST', '/sales', { productId: 1.5, qtySold: 1, paymentMode: 'Cash' }, 400)
  await B('B11 sale qty zero', 'POST', '/sales', { productId: pid, qtySold: 0, paymentMode: 'Cash' }, 400)
  await B('B12 sale qty negative', 'POST', '/sales', { productId: pid, qtySold: -1, paymentMode: 'Cash' }, 400)
  await B('B13 sale qty float', 'POST', '/sales', { productId: pid, qtySold: 1.5, paymentMode: 'Cash' }, 400)
  await B('B14 sale qty string-num ok? (lenient accept)', 'POST', '/sales', { productId: pid, qtySold: '1', paymentMode: 'Cash' }, 201)
  await B('B15 sale discount negative', 'POST', '/sales', { productId: pid, qtySold: 1, discount: -5, paymentMode: 'Cash' }, 400)
  await B('B16 sale discount string garbage', 'POST', '/sales', { productId: pid, qtySold: 1, discount: '5;"DROP', paymentMode: 'Cash' }, 400)
  await B('B17 sale paymentMode injection', 'POST', '/sales', { productId: pid, qtySold: 1, paymentMode: "Cash' OR '1'='1" }, 400)
  await B('B18 sale paymentMode unknown', 'POST', '/sales', { productId: pid, qtySold: 1, paymentMode: 'Bitcoin' }, 400)
  await B('B19 sale missing fields', 'POST', '/sales', {}, 400)
  await B('B20 sale huge qty (DB guarded)', 'POST', '/sales', { productId: pid, qtySold: 999999, paymentMode: 'Cash' }, 422, { errorContains: 'avai' })
  await B('B21 sale unknown product', 'POST', '/sales', { productId: 99999999, qtySold: 1, paymentMode: 'Cash' }, 404)
  await B('B22 create product missing name', 'POST', '/inventory', { sku: 'X1', category: 'Clothing' }, 400)
  await B('B23 create bad category', 'POST', '/inventory', { name: 'x', sku: 'X2', category: 'Grocery' }, 400)
  await B('B24 create negative cost', 'POST', '/inventory', { name: 'x', sku: 'X3', category: 'Clothing', costPrice: -1, sellingPrice: 1 }, 400)
  await B('B25 create negative initialStock', 'POST', '/inventory', { name: 'x', sku: 'X4', category: 'Clothing', costPrice: 1, sellingPrice: 1, initialStock: -3 }, 400)
  await B('B26 create initialStock float', 'POST', '/inventory', { name: 'x', sku: 'X5', category: 'Clothing', costPrice: 1, sellingPrice: 1, initialStock: 2.5 }, 400)
  await B('B27 create duplicate sku', 'POST', '/inventory', { name: 'dup', sku: `${PREFIX}001`, category: 'Clothing', costPrice: 1, sellingPrice: 1 }, 409)
  await B('B28 edit claim direct stock', 'PUT', `/inventory/${pid}`, { currentStock: 12345 }, 422, { errorContains: 'Stock cannot be edited directly' })
  await B('B29 PUT negative price', 'PUT', `/inventory/${pid}`, { sellingPrice: -2 }, 400)
  await B('B30 PUT bad category', 'PUT', `/inventory/${pid}`, { category: 'Toys' }, 400)
  await B('B31 PUT non-string name', 'PUT', `/inventory/${pid}`, { name: 123 }, 400)
  await B('B32 adjustment qty zero', 'POST', `/inventory/${pid}/adjustments`, { qtyChanged: 0, reason: 'stock_in' }, 400)
  await B('B33 adjustment qty float', 'POST', `/inventory/${pid}/adjustments`, { qtyChanged: 1.5, reason: 'stock_in' }, 400)
  await B('B34 adjustment bad reason', 'POST', `/inventory/${pid}/adjustments`, { qtyChanged: 1, reason: 'theft' }, 400)
  await B('B35 adjustment huge negative (DB guard)', 'POST', `/inventory/${pid}/adjustments`, { qtyChanged: -999999, reason: 'correction' }, 422, { errorContains: 'negative stock' })
  await B('B36 adjustment unknown product', 'POST', '/inventory/99999999/adjustments', { qtyChanged: 1, reason: 'stock_in' }, 404)
  await B('B37 return bad sale', 'POST', '/returns', { originalSaleId: 'abc', productId: pid, qtyReturned: 1, reason: 'other', resellable: true }, 400)
  await B('B38 return resellable string', 'POST', '/returns', { originalSaleId: mySale.saleId, productId: pid, qtyReturned: 1, reason: 'other', resellable: 'yes' }, 400)
  await B('B39 return qty zero', 'POST', '/returns', { originalSaleId: mySale.saleId, productId: pid, qtyReturned: 0, reason: 'other', resellable: true }, 400)
  await B('B40 return unknown sale', 'POST', '/returns', { originalSaleId: 99999999, productId: pid, qtyReturned: 1, reason: 'other', resellable: true }, 404, { errorContains: 'Original sale not found' })
  await B('B41 dashboard invalid date', 'GET', '/dashboard?date=2026-13-45', undefined, 400)
  await B('B42 dashboard injection date', 'GET', "/dashboard?date=2026-01-01';--", undefined, 400)
  await B('B43 sales list invalid date', 'GET', '/sales?date=2026-02-30', undefined, 400)
  await B('B44 returns list invalid date', 'GET', '/returns?date=not-a-date', undefined, 400)
  await B('B45 sales csv invalid date', 'GET', '/reports/sales.csv?date=1999-99-99', undefined, 400)
  await B('B46 unknown endpoint', 'GET', '/definitely/not/here', undefined, 404)
  await B('B47 inventory bad status enum', 'GET', '/inventory?status=xxx_stock', undefined, 400)
  await B('B48 insights fine (odd params tolerated)', 'GET', '/insights?window=999&leadTime=-5', undefined, 200)

  // --- second-round loopholes ---
  await B('B49 discount > line gross rejected', 'POST', '/sales', { productId: pid, qtySold: 1, discount: 5000, paymentMode: 'Cash' }, 400, { errorContains: 'Discount exceeds line total' })
  await B('B50 discount == line gross allowed (free item)', 'POST', '/sales', { productId: pid, qtySold: 1, discount: 250, paymentMode: 'Cash' }, 201)
  await B('B51 int32 overflow initialStock -> 400 not 500', 'POST', '/inventory', { name: 'ovf', sku: 'OVF-A', category: 'Clothing', costPrice: 1, sellingPrice: 2, initialStock: 2147483648 }, 400)
  await B('B52 int32 overflow productId -> 400 not 500', 'POST', '/sales', { productId: 3000000000, qtySold: 1, paymentMode: 'Cash' }, 400)
  await B('B53 int32 overflow adjustment qty -> 400 not 500', 'POST', `/inventory/${pid}/adjustments`, { qtyChanged: -2147483649, reason: 'correction' }, 400)
  await B('B54 damaged + resellable rejected', 'POST', '/returns', { originalSaleId: mySale.saleId, productId: pid, qtyReturned: 1, reason: 'damaged', resellable: true }, 422, { errorContains: 'Damaged items cannot be resellable' })
  const lup = await req('POST', '/inventory', { name: 'Adv Case SKU', sku: `${PREFIX}LUP-lower`, category: 'Clothing', costPrice: 1, sellingPrice: 2 })
  await rec('B55 create lower-case sku ok (normalized)', lup, 201)
  await B('B56 sku upper-case variant rejected', 'POST', '/inventory', { name: 'Adv Case Dup', sku: `${PREFIX}LUP-LOWER`, category: 'Clothing', costPrice: 1, sellingPrice: 2 }, 409)
  const ins2 = await req('GET', '/insights?leadTime=1e308&safetyStock=1e308')
  await rec('B57 insights clamps to finite ranges', { status: ins2.body?.leadTime === 365 && ins2.body?.safetyStock === 100000 ? 200 : 999, body: {} }, 200)

  /* ============ C. SQL INJECTION BATTERY ============ */
  // all these MUST yield <500; DB must be intact afterwards
  const salesBeforeSectionC = await db.query('SELECT count(*)::int n FROM sales_transactions')
  let cIdx = 0
  for (const inj of INJ) {
    cIdx++
    const enc = encodeURIComponent(inj)
    await rec(`C${cIdx}.1 search inv`, await req('GET', `/inventory?search=${enc}`))
    await rec(`C${cIdx}.2 lookup`, await req('GET', `/inventory/lookup?search=${enc}`))
    await rec(`C${cIdx}.3 category filter`, await req('GET', `/inventory?category=${enc}`))
    await rec(`C${cIdx}.4 dashboard date`, await req('GET', `/dashboard?date=${enc}`), 400)
    await rec(`C${cIdx}.5 sales date`, await req('GET', `/sales?date=${enc}`), 400)
    await rec(`C${cIdx}.6 returns date`, await req('GET', `/returns?date=${enc}`), 400)
    await rec(`C${cIdx}.7 csv date`, await req('GET', `/reports/sales.csv?date=${enc}`), 400)
    await rec(`C${cIdx}.8 insights window`, await req('GET', `/insights?window=${enc}`), 200)
  }
  // injection into stored fields (second-order: name later read by aggregate/list queries)
  const injectedName = `X'; DROP TABLE stock_adjustments; --${Date.now()}`
  const injProd = await req('POST', '/inventory', {
    name: injectedName, sku: `${PREFIX}INJ`, category: 'Clothing', costPrice: 1, sellingPrice: 2,
  })
  await rec('C-inject stored product name', injProd, 201)
  await rec('C-store reflected in list', await req('GET', '/inventory/lookup?search=DROP%20TABLE'), 200)
  await rec('C-store reflected in csv', await req('GET', '/reports/inventory.csv'), 200)
  await rec('C-store in dashboard joins', (await req('GET', '/dashboard')).status === 200 ? { status: 200, body: {} } : { status: 999, body: {} }, 200)

  // time-based blind: `'||pg_sleep(3)||'` in search must answer fast (no SQL execution)
  const t = await req('GET', `/inventory/lookup?search=${encodeURIComponent("'||pg_sleep(3)||'")}`)
  await rec('C-pgsleep not executed (<1.5s)', t, undefined, { latencyLt: 1500 })

  // DB integrity after the whole injection battery
  const tablesAfter = await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")
  const salesAfter = await db.query('SELECT count(*)::int n FROM sales_transactions')
  await rec('C-integrity tables intact', { status: tablesAfter.rows[0].n === tablesBefore.rows[0].n ? 200 : 999, body: {} }, 200)
  await rec('C-integrity sales intact', { status: salesAfter.rows[0].n === salesBeforeSectionC.rows[0].n ? 200 : 999, body: {} }, 200)
  await rec('C-integrity sku unique index active', { status: (await db.query("SELECT count(*)::int n FROM pg_indexes WHERE indexname = 'inventory_sku_key'")).rows[0].n === 1 ? 200 : 999, body: {} }, 200)

  /* ============ D. CSV / SPREADSHEET FORMULA INJECTION ============ */
  const sheet = await req('POST', '/inventory', {
    name: '=HYPERLINK("http://evil","click")', sku: `${PREFIX}SHEET`, category: 'Footwear', costPrice: 1, sellingPrice: 2, supplier: '@cmd|calc A1',
  })
  await rec('D1 sheet-payload product stored', sheet, 201)
  const csvRes = await req('GET', '/reports/inventory.csv')
  // after naive CSV-unquote (drop "" pairs), no cell may start with a formula trigger
  const unquoted = csvRes.text.replace(/""/g, '').replace(/"/g, '')
  const badCellLine = unquoted.split(/\r?\n/).some((line) => line.split(',').some((c) => /^[=+\-@\t\r]/.test(c)))
  await rec('D2 csv formula neutralized', { status: badCellLine ? 999 : 200, body: {} }, 200)

  /* ============ E. FUZZ / INFRASTRUCTURE ============ */
  await rec('E1 malformed JSON body', await req('POST', '/sales', '{"productId": 1, "qtySold": NaN}'), 400)
  await rec('E2 truncated JSON', await req('POST', '/sales', '{"productId": '), 400)
  await rec('E3 discount Infinity literal', await req('POST', '/sales', '{"productId": ' + pid + ', "qtySold": 1, "discount": 1e999, "paymentMode": "Cash"}'), 400)
  await rec('E4 no content-type junk body', await req('POST', '/sales', 'productId=1&qtySold=1', { 'content-type': 'text/plain' }), 400)
  await rec('E5 null byte in name', await req('POST', '/inventory', { name: 'bad\x00name', sku: `${PREFIX}NUL`, category: 'Clothing', costPrice: 1, sellingPrice: 2 }), 201)
  await rec('E6 emoji/unicode name ok', await req('POST', '/inventory', { name: 'Kurta 🎉 émoji', sku: `${PREFIX}EMO`, category: 'Clothing', costPrice: 1, sellingPrice: 2 }), 201)
  await rec('E7 huge body -> 413 or 400 (not 5xx)', await req('POST', '/sales', JSON.stringify({ productId: pid, qtySold: 1, paymentMode: 'Cash', junk: 'x'.repeat(150000) })), 413, {})
  await rec('E8 deep nested productId', await req('POST', '/sales', '{"productId": {"nested": {"deep": 1}}, "qtySold": 1, "paymentMode": "Cash"}'), 400)
  await rec('E9 unknown route verb', await req('DELETE', `/inventory/${pid}`), 404)
  await rec('E10 health after everything', await req('GET', '/health'), 200)

  /* ============ F. CONCURRENCY RACES ============ */
  const race = await req('POST', '/inventory', {
    name: 'Adv Race Item', sku: `${PREFIX}RACE`, category: 'Clothing', costPrice: 10, sellingPrice: 20, initialStock: 10,
  })
  const raceId = race.body.productId
  const saleResps = await Promise.allSettled(
    Array.from({ length: 20 }, () => req('POST', '/sales', { productId: raceId, qtySold: 1, paymentMode: 'Cash' })),
  )
  const sold = saleResps.filter((p) => p.value && p.value.status === 201).length
  const blocked = saleResps.filter((p) => p.value && p.value.status === 422).length
  const raceStock = (await req('GET', `/inventory/${raceId}`)).body.product.currentStock
  results.push(['F1 no oversell under 20 parallel', sold === 10 && blocked === 10 && raceStock === 0 ? 'PASS' : `FAIL sold=${sold} blocked=${blocked} stock=${raceStock}`, '', false])

  const stock10 = sold // sanity
  if (stock10 !== 10) results.push(['F1b sold count sanity', `FAIL sold=${sold}`, '', false])

  // create a 3-unit sale on a fresh product, then 6 parallel 1-unit returns: exactly 3 must pass
  const race2 = await req('POST', '/inventory', {
    name: 'Adv Return Race', sku: `${PREFIX}RACE2`, category: 'Footwear', costPrice: 10, sellingPrice: 20, initialStock: 5,
  })
  const race2Id = race2.body.productId
  await req('POST', '/sales', { productId: race2Id, qtySold: 3, paymentMode: 'UPI' })
  const saleList2 = await req('GET', '/sales')
  const rSale = saleList2.body.find((s) => s.product.sku === `${PREFIX}RACE2`)
  const retResps = await Promise.allSettled(
    Array.from({ length: 6 }, () => req('POST', '/returns', { originalSaleId: rSale.saleId, productId: race2Id, qtyReturned: 1, reason: 'other', resellable: true })),
  )
  const returned = retResps.filter((p) => p.value && p.value.status === 201).length
  const retBlocked = retResps.filter((p) => p.value && p.value.status === 422).length
  const race2Stock = (await req('GET', `/inventory/${race2Id}`)).body.product.currentStock
  // stock: 5 initial, -3 sale, +3 resellable returns => 5
  results.push(['F3 no over-return under 6 parallel (3 passed, qty-3 cap)', returned === 3 && retBlocked === 3 && race2Stock === 5 ? 'PASS' : `FAIL ret=${returned} blocked=${retBlocked} stock=${race2Stock}`, '', false])

  console.table(results.map((r) => ({ check: r[0], result: r[1], status: r[2], is5xx: r[3] })).slice(-40))
  await finish(db)
}

async function finish(db) {
  // cleanup ADV artifacts (reverse FK order), then integrity checks
  const advIds = (await db.query('SELECT product_id FROM inventory WHERE sku LIKE $1', [`${PREFIX}%`])).rows.map((r) => r.product_id)
  if (advIds.length > 0) {
    await db.query('DELETE FROM returns WHERE product_id = ANY($1)', [advIds])
    await db.query('DELETE FROM sales_transactions WHERE product_id = ANY($1)', [advIds])
    await db.query('DELETE FROM stock_adjustments WHERE product_id = ANY($1)', [advIds])
    await db.query('DELETE FROM inventory WHERE product_id = ANY($1)', [advIds])
  }
  const triggerCount = await db.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname LIKE '%stock%' OR tgname LIKE '%sale%' OR tgname LIKE '%return%' OR tgname LIKE '%adjustment%'")
  const invCount = await db.query('SELECT count(*)::int n FROM inventory')
  console.log(`cleanup: removed ${advIds.length} adversarial products`)
  console.log(`triggers alive: ${triggerCount.rows[0].n}, inventory rows now: ${invCount.rows[0].n}`)
  const health = await req('GET', '/health')
  const fails = results.filter((r) => String(r[1]).startsWith('FAIL')).map((r) => [r[0], r[1]])
  const fivexx = results.filter((r) => r[3])
  console.log(`TOTAL CASES: ${results.length} · FAILURES: ${fails.length} · 5xx RESPONSES: ${fivexx.length}`)
  if (fails.length > 0) console.table(fails.map(([n, r]) => ({ check: n, result: r })))
  console.log(fails.length === 0 && fivexx.length === 0 && health.status === 200 ? 'ALL ADVERSARIAL CHECKS PASSED — BACKEND SURVIVED' : 'FAILURES DETECTED — SEE ABOVE')
  await db.end()
  if (server) server.close()
  await prisma.$disconnect()
  process.exitCode = fails.length === 0 && fivexx.length === 0 ? 0 : 1
}

main().catch(async (e) => {
  console.error('SUITE ERROR — backend kept running?', e)
  if (server) server.close()
  await prisma.$disconnect()
  process.exitCode = 1
})
