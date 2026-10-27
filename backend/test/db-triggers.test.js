import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()
const results = []

async function expectError(name, fn, mustContain) {
  try {
    await fn()
    results.push([name, 'FAIL (no error raised)', ''])
    return null
  } catch (e) {
    const ok = !mustContain || e.message.includes(mustContain)
    results.push([name, ok ? 'PASS' : `FAIL (${e.message.slice(0, 80)})`, mustContain || ''])
  }
}

async function main() {
  const p = await prisma.inventory.findFirst({ where: { sku: 'SKU-CLT-004' } })
  const stock = p.currentStock
  console.log(`using ${p.name} (${p.sku}) stock=${stock}`)

  // 1) direct stock edit must be blocked
  await expectError('direct UPDATE current_stock blocked', () =>
    prisma.inventory.update({ where: { productId: p.productId }, data: { currentStock: 9999 } }), 'stock changes must flow')

  // 2) oversell must be blocked by BEFORE INSERT trigger
  await expectError('oversale blocked (qty > stock)', () =>
    prisma.salesTransaction.create({ data: { productId: p.productId, qtySold: stock + 10, sellingPrice: p.sellingPrice, paymentMode: 'Cash' } }), 'Insufficient stock')

  // 3) valid sale decrements stock automatically
  await prisma.$transaction(async (tx) => {
    await tx.salesTransaction.create({ data: { productId: p.productId, qtySold: 2, sellingPrice: p.sellingPrice, discount: 0, paymentMode: 'UPI' } })
  })
  const after = await prisma.inventory.findUnique({ where: { productId: p.productId } })
  results.push(['sale decrements stock via trigger', after.currentStock === stock - 2 ? 'PASS' : `FAIL (${stock} -> ${after.currentStock})`, after.currentStock])

  // 4) return increments stock when resellable
  const row = await prisma.salesTransaction.findFirst({ where: { productId: p.productId }, orderBy: { saleId: 'desc' } })
  const beforeReturn = (await prisma.inventory.findUnique({ where: { productId: p.productId } })).currentStock
  await prisma.return.create({ data: { originalSaleId: row.saleId, productId: p.productId, qtyReturned: 1, reason: 'wrong_size', resellable: true } })
  const afterReturn = (await prisma.inventory.findUnique({ where: { productId: p.productId } })).currentStock
  results.push(['resellable return increments stock', afterReturn === beforeReturn + 1 ? 'PASS' : `FAIL (${beforeReturn} -> ${afterReturn})`, afterReturn])

  // 5) non-resellable return must NOT increment stock
  const before2 = (await prisma.inventory.findUnique({ where: { productId: p.productId } })).currentStock
  await prisma.return.create({ data: { originalSaleId: row.saleId, productId: p.productId, qtyReturned: 1, reason: 'damaged', resellable: false } })
  const after2 = (await prisma.inventory.findUnique({ where: { productId: p.productId } })).currentStock
  results.push(['non-resellable return does not restock', after2 === before2 ? 'PASS' : `FAIL (${before2} -> ${after2})`, after2])

  // 6) cannot return more than sold
  await expectError('over-return blocked', () =>
    prisma.return.create({ data: { originalSaleId: row.saleId, productId: p.productId, qtyReturned: 5, reason: 'other', resellable: true } }), 'Cannot return')

  // 7) product mismatch between return and sale blocked
  const other = await prisma.inventory.findFirst({ where: { NOT: { productId: p.productId } } })
  await expectError('return for foreign product blocked', () =>
    prisma.return.create({ data: { originalSaleId: row.saleId, productId: other.productId, qtyReturned: 1, reason: 'other', resellable: true } }), 'does not belong')

  // 8) adjustment below zero blocked
  await expectError('negative stock adjustment blocked', () =>
    prisma.stockAdjustment.create({ data: { productId: p.productId, qtyChanged: -99999, reason: 'correction' } }), 'negative stock')

  // 9) valid adjustment applies & logs
  const before3 = (await prisma.inventory.findUnique({ where: { productId: p.productId } })).currentStock
  const adj = await prisma.stockAdjustment.create({ data: { productId: p.productId, qtyChanged: 5, reason: 'correction', note: 'found extra carton' } })
  const after3 = (await prisma.inventory.findUnique({ where: { productId: p.productId } })).currentStock
  results.push(['stock adjustment applies + audits', adj.adjustedStock === before3 + 5 && after3 === before3 + 5 ? 'PASS' : 'FAIL', `adj.adjustedStock=${adj.adjustedStock}`])

  console.table(results.map((r) => ({ check: r[0], result: r[1], detail: String(r[2]) })))
  const failed = results.filter((r) => String(r[1]).startsWith('FAIL'))
  process.exitCode = failed.length ? 1 : 0
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
