import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { dbError } from '../lib/errors.js'
import { isDayStr } from '../lib/validate.js'
import { todayStr } from '../lib/dates.js'

export const dashboardRouter = Router()

dashboardRouter.get('/', async (req, res) => {
  // calendar-day arithmetic happens entirely in SQL with text dates —
  // no JS Date timezone conversion can shift the window
  let dayStr = req.query.date
  if (dayStr === undefined || dayStr === '') dayStr = todayStr()
  if (!isDayStr(String(dayStr))) {
    return res.status(400).json({ error: `Invalid date "${String(dayStr).slice(0, 40)}" (expected a real YYYY-MM-DD date)` })
  }
  const day = String(dayStr)

  try {
    const aggRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS bills,
             COALESCE(SUM(s.qty_sold), 0)::int AS units,
             COALESCE(SUM(s.qty_sold * s.selling_price - s.discount), 0)::float8 AS revenue
        FROM sales_transactions s
       WHERE s.sale_date = ${day}::date`
    const sales = aggRows[0]

    const returnsRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(r.qty_returned), 0)::int AS units,
             COALESCE(SUM(CASE WHEN r.resellable THEN r.qty_returned ELSE 0 END), 0)::int AS restockable_units,
             COALESCE(SUM(r.qty_returned * s.selling_price), 0)::float8 AS value
        FROM returns r
        JOIN sales_transactions s ON s.sale_id = r.original_sale_id
       WHERE r.return_date = ${day}::date`
    const rets = returnsRows[0]

    const modeRows = await prisma.$queryRaw`
      SELECT s.payment_mode AS "mode",
             SUM(s.qty_sold)::int AS units,
             COALESCE(SUM(s.qty_sold * s.selling_price - s.discount), 0)::float8 AS revenue
        FROM sales_transactions s
       WHERE s.sale_date = ${day}::date
       GROUP BY s.payment_mode`

    const trendRows = await prisma.$queryRaw`
      SELECT sale_date::text AS day,
             SUM(qty_sold)::int AS units,
             COALESCE(SUM(qty_sold * selling_price - discount), 0)::float8 AS revenue
        FROM sales_transactions
       WHERE sale_date >= ${day}::date - INTERVAL '6 days'
         AND sale_date <= ${day}::date
       GROUP BY sale_date
       ORDER BY sale_date`
    const trendMap = new Map(trendRows.map((r) => [r.day, r]))

    /* build 7 contiguous days ending on the selected date */
    const [y, m, d] = day.split('-').map(Number)
    const trend = []
    for (let i = 6; i >= 0; i--) {
      const t = new Date(Date.UTC(y, m - 1, d))
      t.setUTCDate(t.getUTCDate() - i)
      const iso = t.toISOString().slice(0, 10)
      const row = trendMap.get(iso)
      trend.push({
        date: iso,
        label: t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
        units: row ? Number(row.units) : 0,
        revenue: row ? Number(row.revenue) : 0,
      })
    }

    let bestSeller = null
    const bestRows = await prisma.$queryRaw`
      SELECT s.product_id, SUM(s.qty_sold)::int AS units
        FROM sales_transactions s
       WHERE s.sale_date = ${day}::date
       GROUP BY s.product_id
       ORDER BY units DESC
       LIMIT 1`
    if (bestRows.length > 0) {
      const p = await prisma.inventory.findUnique({ where: { productId: Number(bestRows[0].product_id) }, select: { name: true, sku: true, size: true } })
      bestSeller = { ...p, productId: Number(bestRows[0].product_id), units: Number(bestRows[0].units) }
    }

    const revenue = Number(sales.revenue || 0)
    const returnsValue = Number(rets.value || 0)

    res.json({
      date: day,
      unitsSold: Number(sales.units || 0),
      salesCount: Number(sales.bills || 0),
      revenue,
      unitsReturned: Number(rets.units || 0),
      restockableUnits: Number(rets.restockable_units || 0),
      returnsValue,
      netSales: revenue - returnsValue,
      bestSeller,
      paymentModes: modeRows.map((mm) => ({ mode: mm.mode, units: Number(mm.units), revenue: Number(mm.revenue) })),
      trend,
    })
  } catch (e) {
    dbError(res, e)
  }
})
