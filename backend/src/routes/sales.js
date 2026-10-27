import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { dbError } from '../lib/errors.js'
import { toInt, toNum, isDayStr } from '../lib/validate.js'
import { todayStr } from '../lib/dates.js'

export const salesRouter = Router()

const MODES = ['Cash', 'UPI', 'Card']

function badDay(res, raw) {
  return res.status(400).json({ error: `Invalid date "${String(raw).slice(0, 40)}" (expected a real YYYY-MM-DD date)` })
}

salesRouter.post('/', async (req, res) => {
  try {
    const b = req.body || {}
    const pid = toInt(b.productId)
    const qty = toInt(b.qtySold)
    const disc = b.discount === undefined || b.discount === null || b.discount === '' ? 0 : toNum(b.discount)

    if (!Number.isInteger(pid)) return res.status(400).json({ error: 'productId must be an integer' })
    if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: 'qtySold must be a positive integer' })
    if (disc === undefined || Number.isNaN(disc) || disc < 0) return res.status(400).json({ error: 'discount must be a non-negative number' })
    if (!MODES.includes(b.paymentMode)) return res.status(400).json({ error: "paymentMode must be 'Cash', 'UPI' or 'Card'" })

    // Frontend stock availability snapshot for pre-DB validation
    const available = await prisma.inventory.findUnique({ where: { productId: pid }, select: { currentStock: true, sellingPrice: true, name: true } })
    if (!available) return res.status(404).json({ error: 'Product not found' })
    if (qty > available.currentStock) {
      return res.status(422).json({ error: `Quantity exceeds available stock. Available: ${available.currentStock}` })
    }

    const sale = await prisma.$transaction(async (tx) => {
      // row lock against the inventory record keeps concurrent sales atomic
      const rows = await tx.$queryRaw`SELECT current_stock, selling_price FROM inventory WHERE product_id = ${pid} FOR UPDATE`
      const inv = rows[0]
      if (!inv) {
        const err = new Error('Product not found')
        err.expected = true
        throw err
      }
      if (qty > inv.current_stock) {
        const err = new Error(`Insufficient stock: requested ${qty}, available ${inv.current_stock}`)
        err.expected = true
        err.status = 422
        throw err
      }
      if (disc > qty * Number(inv.selling_price) + 1e-9) {
        const err = new Error(`Discount exceeds line total (max ₹${qty * Number(inv.selling_price)})`)
        err.expected = true
        err.status = 400
        throw err
      }
      return tx.salesTransaction.create({
        data: {
          productId: pid,
          qtySold: qty,
          sellingPrice: inv.selling_price,
          discount: disc,
          paymentMode: b.paymentMode,
        },
      })
    })

    const product = await prisma.inventory.findUnique({ where: { productId: pid } })
    res.status(201).json({
      sale,
      currentStock: product.currentStock,
      lineTotal: Number(sale.sellingPrice) * sale.qtySold - Number(sale.discount),
    })
  } catch (e) {
    if (e && e.expected) return res.status(e.status).json({ error: e.message })
    dbError(res, e)
  }
})

salesRouter.get('/', async (req, res) => {
  const raw = req.query.date
  if (raw !== undefined && !isDayStr(String(raw))) return badDay(res, raw)
  const day = raw ? String(raw) : todayStr()
  const rows = await prisma.$queryRaw`
    SELECT s.sale_id, s.qty_sold, s.selling_price::float8, s.discount::float8, s.payment_mode,
           s.sale_date::text, s.sale_time::text,
           p.name AS p_name, p.sku AS p_sku, p.size AS p_size, p.color AS p_color, p.brand AS p_brand,
           COALESCE((SELECT SUM(r.qty_returned) FROM returns r WHERE r.original_sale_id = s.sale_id), 0)::int AS units_returned
      FROM sales_transactions s
      JOIN inventory p ON p.product_id = s.product_id
     WHERE s.sale_date = ${day}::date
     ORDER BY s.sale_id DESC`
  res.json(
    rows.map((s) => ({
      saleId: Number(s.sale_id),
      product: { name: s.p_name, sku: s.p_sku, size: s.p_size, color: s.p_color, brand: s.p_brand },
      qtySold: Number(s.qty_sold),
      sellingPrice: Number(s.selling_price),
      discount: Number(s.discount),
      paymentMode: s.payment_mode,
      saleDate: s.sale_date,
      saleTime: s.sale_time,
      lineTotal: Number(s.selling_price) * Number(s.qty_sold) - Number(s.discount),
      unitsReturned: Number(s.units_returned),
    })),
  )
})

salesRouter.get('/:id', async (req, res) => {
  const id = toInt(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid sale id' })
  const s = await prisma.salesTransaction.findUnique({
    where: { saleId: id },
    include: {
      product: { select: { name: true, sku: true, size: true, color: true, brand: true, sellingPrice: true, currentStock: true } },
      returns: { select: { returnId: true, qtyReturned: true, reason: true, resellable: true, returnDate: true } },
    },
  })
  if (!s) return res.status(404).json({ error: 'Sale not found' })
  res.json({
    saleId: s.saleId,
    productId: s.productId,
    product: s.product,
    qtySold: s.qtySold,
    sellingPrice: Number(s.sellingPrice),
    discount: Number(s.discount),
    paymentMode: s.paymentMode,
    saleDate: s.saleDate,
    saleTime: s.saleTime,
    unitsReturned: s.returns.reduce((a, r) => a + r.qtyReturned, 0),
    returns: s.returns,
  })
})
