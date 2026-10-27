import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { dbError } from '../lib/errors.js'
import { toInt, isDayStr } from '../lib/validate.js'
import { todayStr } from '../lib/dates.js'

export const returnsRouter = Router()

const REASONS = ['damaged', 'wrong_size', 'other']

returnsRouter.post('/', async (req, res) => {
  try {
    const b = req.body || {}
    const saleId = toInt(b.originalSaleId)
    const pid = toInt(b.productId)
    const qty = toInt(b.qtyReturned)

    if (!Number.isInteger(saleId)) return res.status(400).json({ error: 'originalSaleId must be an integer' })
    if (!Number.isInteger(pid)) return res.status(400).json({ error: 'productId must be an integer' })
    if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: 'qtyReturned must be a positive integer' })
    if (!REASONS.includes(b.reason)) return res.status(400).json({ error: "reason must be 'damaged', 'wrong_size' or 'other'" })
    if (typeof b.resellable !== 'boolean') return res.status(400).json({ error: 'resellable must be true or false' })
    if (b.reason === 'damaged' && b.resellable) {
      return res.status(422).json({ error: 'Damaged items cannot be resellable — stock will not increase for damaged returns' })
    }

    const sale = await prisma.salesTransaction.findUnique({ where: { saleId }, include: { product: true } })
    if (!sale) return res.status(404).json({ error: 'Original sale not found' })
    if (sale.productId !== pid) {
      return res.status(422).json({ error: `Sale #${saleId} was for "${sale.product.name}" (SKU ${sale.product.sku}), not this product` })
    }
    const already = await prisma.return.aggregate({ where: { originalSaleId: saleId }, _sum: { qtyReturned: true } })
    const remaining = sale.qtySold - (already._sum.qtyReturned || 0)
    if (qty > remaining) {
      return res.status(422).json({ error: `Only ${remaining} unit(s) of sale #${saleId} remain returnable (sold ${sale.qtySold}, already returned ${already._sum.qtyReturned || 0})` })
    }

    const ret = await prisma.return.create({
      data: { originalSaleId: saleId, productId: pid, qtyReturned: qty, reason: b.reason, resellable: b.resellable },
    })
    const product = await prisma.inventory.findUnique({ where: { productId: pid } })
    res.status(201).json({ ret, currentStock: product.currentStock })
  } catch (e) {
    dbError(res, e)
  }
})

returnsRouter.get('/', async (req, res) => {
  const raw = req.query.date
  if (raw !== undefined && !isDayStr(String(raw))) {
    return res.status(400).json({ error: `Invalid date "${String(raw).slice(0, 40)}" (expected a real YYYY-MM-DD date)` })
  }
  const day = raw ? String(raw) : todayStr()
  const rows = await prisma.$queryRaw`
    SELECT r.return_id, r.original_sale_id, r.qty_returned, r.reason, r.resellable, r.return_date::text,
           p.name AS p_name, p.sku AS p_sku, p.size AS p_size, p.color AS p_color, p.brand AS p_brand,
           s.selling_price::float8
      FROM returns r
      JOIN inventory p ON p.product_id = r.product_id
      JOIN sales_transactions s ON s.sale_id = r.original_sale_id
     WHERE r.return_date = ${day}::date
     ORDER BY r.return_id DESC`
  res.json(
    rows.map((r) => ({
      returnId: Number(r.return_id),
      originalSaleId: Number(r.original_sale_id),
      product: { name: r.p_name, sku: r.p_sku, size: r.p_size, color: r.p_color, brand: r.p_brand },
      qtyReturned: Number(r.qty_returned),
      reason: r.reason,
      resellable: r.resellable,
      returnDate: r.return_date,
      unitsValue: Number(r.selling_price) * Number(r.qty_returned),
    })),
  )
})
