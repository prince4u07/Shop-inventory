import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { dbError } from '../lib/errors.js'
import { toInt, toNum, likeSafe } from '../lib/validate.js'

export const inventoryRouter = Router()

const errInvalidId = { error: 'Invalid product id' }

function stockStatus(stock, threshold) {
  if (stock <= 0) return 'out_of_stock'
  if (stock <= threshold) return 'low_stock'
  return 'in_stock'
}

function decorate(p) {
  return {
    productId: p.productId,
    name: p.name,
    sku: p.sku,
    category: p.category,
    subCategory: p.subCategory,
    brand: p.brand,
    size: p.size,
    color: p.color,
    costPrice: Number(p.costPrice),
    sellingPrice: Number(p.sellingPrice),
    currentStock: p.currentStock,
    reorderThreshold: p.reorderThreshold,
    supplier: p.supplier,
    imageUrl: p.imageUrl,
    stockValue: Number(p.sellingPrice) * p.currentStock,
    lastUpdated: p.lastUpdated,
    status: stockStatus(p.currentStock, p.reorderThreshold),
  }
}

inventoryRouter.get('/filters', async (req, res) => {
  const rows = await prisma.inventory.findMany({ select: { category: true, subCategory: true, brand: true, size: true } })
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort()
  res.json({
    categories: uniq(rows.map((r) => r.category)),
    subCategories: uniq(rows.map((r) => r.subCategory)),
    brands: uniq(rows.map((r) => r.brand)),
    sizes: uniq(rows.map((r) => r.size)),
  })
})

inventoryRouter.get('/lookup', async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 200)
  const items = await prisma.inventory.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: likeSafe(search), mode: 'insensitive' } },
            { sku: { contains: likeSafe(search), mode: 'insensitive' } },
            { brand: { contains: likeSafe(search), mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: [{ name: 'asc' }, { size: 'asc' }],
    take: 15,
  })
  res.json(
    items.map((p) => ({
      productId: p.productId,
      name: p.name,
      sku: p.sku,
      brand: p.brand,
      size: p.size,
      color: p.color,
      sellingPrice: Number(p.sellingPrice),
      currentStock: p.currentStock,
      stockStatus: stockStatus(p.currentStock, p.reorderThreshold),
    })),
  )
})

inventoryRouter.get('/:id', async (req, res) => {
  const id = toInt(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json(errInvalidId)
  try {
    const p = await prisma.inventory.findUnique({ where: { productId: id } })
    if (!p) return res.status(404).json({ error: 'Product not found' })
    const adjustments = await prisma.stockAdjustment.findMany({
      where: { productId: id },
      orderBy: { adjustmentId: 'desc' },
      take: 20,
    })
    res.json({ product: decorate(p), adjustments })
  } catch (e) {
    dbError(res, e)
  }
})

inventoryRouter.get('/', async (req, res) => {
  const { search, category, subCategory, brand, size, status } = req.query
  if (status && !['in_stock', 'low_stock', 'out_of_stock'].includes(String(status))) {
    return res.status(400).json({ error: "status must be 'in_stock', 'low_stock' or 'out_of_stock'" })
  }
  const where = {}
  if (search) {
    const safe = likeSafe(String(search).slice(0, 200))
    where.OR = [
      { name: { contains: safe, mode: 'insensitive' } },
      { sku: { contains: safe, mode: 'insensitive' } },
      { supplier: { contains: safe, mode: 'insensitive' } },
    ]
  }
  if (category) where.category = String(category).slice(0, 100)
  if (subCategory) where.subCategory = String(subCategory).slice(0, 100)
  if (brand) where.brand = String(brand).slice(0, 100)
  if (size) where.size = String(size).slice(0, 100)
  const items = await prisma.inventory.findMany({
    where,
    orderBy: [{ name: 'asc' }, { sku: 'asc' }],
  })
  const decorated = items.map(decorate)
  const filtered = status ? decorated.filter((p) => p.status === status) : decorated
  res.json({
    items: filtered,
    summary: {
      totalProducts: decorated.length,
      totalUnits: decorated.reduce((s, p) => s + p.currentStock, 0),
      totalStockValue: decorated.reduce((s, p) => s + p.stockValue, 0),
      lowStockCount: decorated.filter((p) => p.status === 'low_stock').length,
      outOfStockCount: decorated.filter((p) => p.status === 'out_of_stock').length,
    },
  })
})

inventoryRouter.post('/', async (req, res) => {
  try {
    const b = req.body || {}
    if (typeof b.name !== 'string' || !b.name.trim() || typeof b.sku !== 'string' || !b.sku.trim() || typeof b.category !== 'string') {
      return res.status(400).json({ error: 'name, sku and category (strings) are required' })
    }
    if (!['Clothing', 'Footwear'].includes(b.category)) {
      return res.status(400).json({ error: 'category must be Clothing or Footwear' })
    }
    const costPrice = toNum(b.costPrice)
    const sellingPrice = toNum(b.sellingPrice)
    const reorderThreshold = toInt(b.reorderThreshold)
    const initialStock = b.initialStock === undefined || b.initialStock === null || b.initialStock === '' ? 0 : toInt(b.initialStock)
    if (Number.isNaN(costPrice) || costPrice < 0) return res.status(400).json({ error: 'costPrice must be a non-negative number' })
    if (Number.isNaN(sellingPrice) || sellingPrice < 0) return res.status(400).json({ error: 'sellingPrice must be a non-negative number' })
    if (Number.isNaN(initialStock) || initialStock < 0) return res.status(400).json({ error: 'initialStock must be a non-negative integer' })
    if (b.reorderThreshold !== undefined && Number.isNaN(reorderThreshold)) return res.status(400).json({ error: 'reorderThreshold must be an integer' })

    const str = (v) => (typeof v === 'string' ? v.replace(/\0/g, '').trim().slice(0, 300) || null : null)
    const product = await prisma.inventory.create({
      data: {
        name: b.name.replace(/\0/g, '').trim().slice(0, 300),
        sku: b.sku.replace(/\0/g, '').trim().slice(0, 100).toUpperCase(),
        category: b.category,
        subCategory: str(b.subCategory),
        brand: str(b.brand),
        size: str(b.size),
        color: str(b.color),
        costPrice,
        sellingPrice,
        reorderThreshold: Number.isInteger(reorderThreshold) && reorderThreshold >= 0 ? reorderThreshold : 3,
        supplier: str(b.supplier),
        imageUrl: str(b.imageUrl),
      },
    })

    if (initialStock > 0) {
      await prisma.stockAdjustment.create({
        data: { productId: product.productId, qtyChanged: initialStock, reason: 'stock_in', note: 'Opening stock at product creation', createdBy: 'owner' },
      })
    }
    res.status(201).json(decorate(await prisma.inventory.findUnique({ where: { productId: product.productId } })))
  } catch (e) {
    dbError(res, e)
  }
})

inventoryRouter.put('/:id', async (req, res) => {
  const id = toInt(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json(errInvalidId)
  try {
    const b = req.body || {}
    const existing = await prisma.inventory.findUnique({ where: { productId: id } })
    if (!existing) return res.status(404).json({ error: 'Product not found' })
    if ('currentStock' in b) {
      return res.status(422).json({ error: 'Stock cannot be edited directly. Use stock-in / correction adjustments or sales & returns.' })
    }
    if ('category' in b && !['Clothing', 'Footwear'].includes(b.category)) {
      return res.status(400).json({ error: 'category must be Clothing or Footwear' })
    }
    const data = {}
    for (const f of ['name', 'sku', 'subCategory', 'brand', 'size', 'color', 'supplier', 'imageUrl']) {
      if (f in b) {
        if (b[f] !== null && typeof b[f] !== 'string') return res.status(400).json({ error: `${f} must be a string or null` })
        const cleaned = b[f] === null ? null : String(b[f]).replace(/\0/g, '').trim().slice(0, 300)
        data[f] = f === 'sku' && cleaned ? cleaned.toUpperCase() : cleaned || null
      }
    }
    for (const f of ['costPrice', 'sellingPrice']) {
      if (f in b) {
        const v = toNum(b[f])
        if (Number.isNaN(v) || v < 0) return res.status(400).json({ error: `${f} must be a non-negative number` })
        data[f] = v
      }
    }
    if ('reorderThreshold' in b) {
      const v = toInt(b.reorderThreshold)
      if (Number.isNaN(v) || v < 0) return res.status(400).json({ error: 'reorderThreshold must be a non-negative integer' })
      data.reorderThreshold = v
    }
    const updated = await prisma.inventory.update({ where: { productId: id }, data })
    res.json(decorate(updated))
  } catch (e) {
    dbError(res, e)
  }
})

inventoryRouter.post('/:id/adjustments', async (req, res) => {
  const id = toInt(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json(errInvalidId)
  try {
    const b = req.body || {}
    const qtyChanged = toInt(b.qtyChanged)
    if (Number.isNaN(qtyChanged) || qtyChanged === 0) {
      return res.status(400).json({ error: 'qtyChanged must be a non-zero integer' })
    }
    if (!['stock_in', 'correction'].includes(b.reason)) {
      return res.status(400).json({ error: "reason must be 'stock_in' or 'correction'" })
    }
    const existing = await prisma.inventory.findUnique({ where: { productId: id }, select: { productId: true } })
    if (!existing) return res.status(404).json({ error: 'Product not found' })
    const adj = await prisma.stockAdjustment.create({
      data: {
        productId: id,
        qtyChanged,
        reason: b.reason,
        note: typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null,
        createdBy: typeof b.createdBy === 'string' && b.createdBy.trim() ? b.createdBy.trim().slice(0, 100) : 'owner',
      },
    })
    const product = await prisma.inventory.findUnique({ where: { productId: id } })
    res.status(201).json({ adjustment: adj, currentStock: product.currentStock })
  } catch (e) {
    dbError(res, e)
  }
})
