import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { toCsv } from '../lib/csv.js'
import { dbError } from '../lib/errors.js'
import { isDayStr } from '../lib/validate.js'
import { todayStr } from '../lib/dates.js'

export const reportsRouter = Router()

reportsRouter.get('/inventory.csv', async (req, res) => {
  try {
    const rows = await prisma.inventory.findMany({ orderBy: [{ name: 'asc' }, { sku: 'asc' }] })
    const csv = toCsv(
      rows.map((p) => ({
        product_id: p.productId,
        name: p.name,
        sku: p.sku,
        category: p.category,
        sub_category: p.subCategory,
        brand: p.brand,
        size: p.size,
        color: p.color,
        cost_price: p.costPrice.toString(),
        selling_price: p.sellingPrice.toString(),
        current_stock: p.currentStock,
        reorder_threshold: p.reorderThreshold,
        supplier: p.supplier || '',
        status: p.currentStock <= 0 ? 'Out of Stock' : p.currentStock <= p.reorderThreshold ? 'Low Stock' : 'In Stock',
        stock_value: (Number(p.sellingPrice) * p.currentStock).toFixed(2),
        last_updated: p.lastUpdated.toISOString(),
      })),
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="inventory.csv"')
    res.send('\ufeff' + csv)
  } catch (e) {
    dbError(res, e)
  }
})

reportsRouter.get('/sales.csv', async (req, res) => {
  try {
    let day = req.query.date !== undefined ? String(req.query.date).slice(0, 10) : todayStr()
    if (!isDayStr(day)) {
      return res.status(400).json({ error: `Invalid date "${String(req.query.date).slice(0, 40)}" (expected a real YYYY-MM-DD date)` })
    }
    const rows = await prisma.$queryRaw`
      SELECT s.sale_id, s.product_id, s.sale_date::text, s.sale_time::text, s.qty_sold, s.selling_price::float8, s.discount::float8, s.payment_mode,
             p.name, p.sku, p.brand, p.size
        FROM sales_transactions s
        JOIN inventory p ON p.product_id = s.product_id
       WHERE s.sale_date = ${day}::date
       ORDER BY s.sale_id ASC`
    const csv = toCsv(
      rows.map((s) => ({
        sale_id: s.sale_id,
        sale_date: s.sale_date,
        sale_time: String(s.sale_time).slice(0, 8),
        product_id: s.product_id,
        name: s.name,
        sku: s.sku,
        brand: s.brand || '',
        size: s.size || '',
        qty_sold: s.qty_sold,
        selling_price: s.selling_price,
        discount: s.discount,
        payment_mode: s.payment_mode,
        line_total: (Number(s.selling_price) * Number(s.qty_sold) - Number(s.discount)).toFixed(2),
      })),
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="sales-${day}.csv"`)
    res.send('\ufeff' + csv)
  } catch (e) {
    dbError(res, e)
  }
})
