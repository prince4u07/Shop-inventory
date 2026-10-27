import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { dbError } from '../lib/errors.js'

export const insightsRouter = Router()

const LEAD_TIME_DAYS = 7
const SAFETY_STOCK = 5

insightsRouter.get('/', async (req, res) => {
  try {
    const windowDays = [7, 30].includes(Number(req.query.window)) ? Number(req.query.window) : 7
    const rawLead = Number(req.query.leadTime)
    const rawSafety = Number(req.query.safetyStock)
    // clang clamps to finite, sane business ranges (1e308 used to echo back as 1e+308)
    const leadTime = Number.isFinite(rawLead) && rawLead >= 0 ? Math.min(rawLead, 365) : LEAD_TIME_DAYS
    const safetyStock = Number.isFinite(rawSafety) && rawSafety >= 0 ? Math.min(rawSafety, 100000) : SAFETY_STOCK

    const rows = []
    const clean = await prisma.$queryRaw`      WITH sold AS (
        SELECT product_id, SUM(qty_sold) AS units
          FROM sales_transactions
         WHERE sale_date >= CURRENT_DATE - (${windowDays}::int - 1)
         GROUP BY product_id
      )
      SELECT i.product_id AS "productId",
             i.name, i.sku, i.brand, i.size, i.color, i.category,
             i.sub_category AS "subCategory",
             i.current_stock AS "currentStock",
             i.reorder_threshold AS "reorderThreshold",
             (i.selling_price)::float8 AS "sellingPrice",
             COALESCE(s.units, 0)::float8 AS "unitsSold",
             COALESCE(s.units, 0)::float8 / ${windowDays}::float8 AS "avgDailySales",
             COALESCE(s.units, 0)::float8 / GREATEST(i.current_stock, 1)::float8 AS "sellThrough"
        FROM inventory i
        LEFT JOIN sold s ON s.product_id = i.product_id
       ORDER BY "sellThrough" DESC, i.current_stock ASC`

    const fastMovers = clean.filter((r) => r.unitsSold > 0).slice(0, 10).map((r) => ({
      ...r,
      sellThrough: Number(r.sellThrough.toFixed(3)),
    }))

    const needsRestock = clean
      .filter((r) => r.currentStock <= r.reorderThreshold)
      .map((r) => {
        const reorderQty = Math.max(0, Math.ceil(r.avgDailySales * leadTime + safetyStock - r.currentStock))
        return {
          productId: r.productId,
          name: r.name,
          sku: r.sku,
          brand: r.brand,
          size: r.size,
          category: r.category,
          currentStock: r.currentStock,
          reorderThreshold: r.reorderThreshold,
          unitsSold: r.unitsSold,
          avgDailySales: Number(r.avgDailySales.toFixed(2)),
          sellThrough: Number(r.sellThrough.toFixed(3)),
          reorderQty,
          leadTime,
          safetyStock,
        }
      })
      .sort((a, b) => b.sellThrough - a.sellThrough)

    res.json({ windowDays, leadTime, safetyStock, fastMovers, needsRestock })
  } catch (e) {
    dbError(res, e)
  }
})
