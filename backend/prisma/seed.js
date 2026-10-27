import { PrismaClient } from '@prisma/client'
import { randomInt } from 'node:crypto'
import 'dotenv/config'

// uniform, crypto-backed randomness (a hand-rolled LCG loses precision over 2^53
// and skews every "random" pick toward constant values)
const rand = (n) => randomInt(n)

function utcNoon(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}
function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const prisma = new PrismaClient()

const products = [
  // Clothing - shirts & tshirts
  ['Oxford Formal Shirt', 'SKU-CLT-001', 'Clothing', 'Shirt', 'Park Avenue', 'L', 'White', 899, 1499, 4, 'Raymond'],
  ['Oxford Formal Shirt', 'SKU-CLT-002', 'Clothing', 'Shirt', 'Park Avenue', 'M', 'Blue', 899, 1499, 4, 'Raymond'],
  ['Checked Casual Shirt', 'SKU-CLT-003', 'Clothing', 'Shirt', 'Levis', 'XL', 'Red', 1100, 1899, 3, 'Levis Store'],
  ['Cotton Round-Neck T-Shirt', 'SKU-CLT-004', 'Clothing', 'T-Shirt', 'Roadster', 'M', 'Black', 349, 699, 5, 'Myntra Retail'],
  ['Cotton Round-Neck T-Shirt', 'SKU-CLT-005', 'Clothing', 'T-Shirt', 'Roadster', 'L', 'Black', 349, 699, 5, 'Myntra Retail'],
  ['Printed Slim T-Shirt', 'SKU-CLT-006', 'Clothing', 'T-Shirt', 'Puma', 'M', 'Grey', 499, 999, 4, 'Puma Outlet'],
  ['Polo Collar T-Shirt', 'SKU-CLT-007', 'Clothing', 'T-Shirt', 'Allen Solly', 'L', 'Navy', 549, 1099, 3, 'ABFRL'],
  ['Slim Fit Chino', 'SKU-CLT-008', 'Clothing', 'Bottoms', 'US Polo', '32', 'Beige', 999, 1799, 3, 'Arvind'],
  ['Regular Fit Jeans', 'SKU-CLT-009', 'Clothing', 'Bottoms', 'Pepe Jeans', '34', 'Indigo', 1499, 2799, 3, 'Pepe Showroom'],
  ['Regular Fit Jeans', 'SKU-CLT-010', 'Clothing', 'Bottoms', 'Pepe Jeans', '32', 'Indigo', 1499, 2799, 3, 'Pepe Showroom'],
  ['Bomber Jacket', 'SKU-CLT-011', 'Clothing', 'Outerwear', 'Jack & Jones', 'L', 'Olive', 2200, 3999, 2, 'JJ Distributors'],
  ['Floral Kurta Set', 'SKU-CLT-012', 'Clothing', 'Ethnic', 'W', 'M', 'Pink', 1300, 2499, 2, 'W Women Store'],
  // Footwear
  ['Canvas Sneakers', 'SKU-SHOE-001', 'Footwear', 'Sneakers', 'Sparx', 'UK-8', 'White', 950, 1699, 4, 'Sparx Depot'],
  ['Canvas Sneakers', 'SKU-SHOE-002', 'Footwear', 'Sneakers', 'Sparx', 'UK-9', 'White', 950, 1699, 4, 'Sparx Depot'],
  ['Running Shoes', 'SKU-SHOE-003', 'Footwear', 'Sports Shoes', 'Nike', 'UK-7', 'Red', 3200, 5495, 3, 'Nike Factory'],
  ['Running Shoes', 'SKU-SHOE-004', 'Footwear', 'Sports Shoes', 'Nike', 'UK-8', 'Red', 3200, 5495, 3, 'Nike Factory'],
  ['Running Shoes', 'SKU-SHOE-005', 'Footwear', 'Sports Shoes', 'Nike', 'UK-9', 'Black', 3200, 5495, 3, 'Nike Factory'],
  ['Leather Formal Shoes', 'SKU-SHOE-006', 'Footwear', 'Formal Shoes', 'Bata', 'UK-8', 'Brown', 1400, 2499, 3, 'Bata Shop'],
  ['Leather Formal Shoes', 'SKU-SHOE-007', 'Footwear', 'Formal Shoes', 'Bata', 'UK-9', 'Brown', 1400, 2499, 3, 'Bata Shop'],
  ['Ethnic Mojari', 'SKU-SHOE-008', 'Footwear', 'Ethnic', 'Bata', 'UK-7', 'Tan', 800, 1499, 2, 'Bata Shop'],
  ['Kids School Shoes', 'SKU-SHOE-009', 'Footwear', 'Kids', 'Liberty', 'UK-5', 'Black', 500, 999, 4, 'Liberty Mart'],
  ['Kids School Shoes', 'SKU-SHOE-010', 'Footwear', 'Kids', 'Liberty', 'UK-6', 'Black', 500, 999, 4, 'Liberty Mart'],
  ['Flip Flops', 'SKU-SHOE-011', 'Footwear', 'Flip Flops', 'Bata', 'UK-8', 'Blue', 180, 449, 5, 'Bata Shop'],
  ['Flip Flops', 'SKU-SHOE-012', 'Footwear', 'Flip Flops', 'Bata', 'UK-9', 'Blue', 180, 449, 5, 'Bata Shop'],
]

const LOW_STOCK = [5, 6, 10, 17]      // drive these low via sales
const HOT_SELLERS = [1, 3, 4, 12, 13] // sell-through leaders

async function main() {
  const count = await prisma.inventory.count()
  if (count > 0 && !process.argv.includes('--append')) {
    console.log('inventory already seeded; use --append to add more data')
    return
  }

  // 1) create products at 0 stock
  const created = []
  for (const [name, sku, category, sub, brand, size, color, cost, price, threshold, supplier] of products) {
    const p = await prisma.inventory.create({
      data: { name, sku, category, subCategory: sub, brand, size, color, costPrice: cost, sellingPrice: price, reorderThreshold: threshold, supplier },
    })
    created.push(p)
  }

  // 2) initial stock-in through the ledger (trigger applies the stock)
  for (const p of created) {
    const qty = 12 + rand(40)
    await prisma.stockAdjustment.create({
      data: { productId: p.productId, qtyChanged: qty, reason: 'stock_in', note: 'Initial opening stock', createdBy: 'owner' },
    })
  }

  // 3) sales across the last 10 days; dates are UTC-noon so `date` columns
  //    keep the intended calendar day regardless of timezone interpretation
  const modes = ['Cash', 'UPI', 'Card']
  const today = utcNoon(todayStr())
  const DAY_MS = 86400000
  for (let day = 0; day <= 9; day++) {
    const nSales = day === 0 ? rand(10) + 6 : rand(14) + 4
    for (let i = 0; i < nSales; i++) {
      const p = created[rand(created.length)]
      const qty = 1 + rand(4)
      try {
        await createSale(prisma, p, qty, today, day, modes)
      } catch {
        // stock ran out for this demo product; top up quietly and move on
        await prisma.stockAdjustment.create({ data: { productId: p.productId, qtyChanged: 10, reason: 'stock_in', note: 'Seed top-up' } })
      }
    }
  }

  // 4) drive a few SKUs low / out via correction adjustments for demo realism
  const targets = { 'SKU-SHOE-005': 0, 'SKU-CLT-004': 2, 'SKU-CLT-011': 1, 'SKU-SHOE-003': 3 }
  for (const p of created) {
    const target = targets[p.sku]
    if (target === undefined) continue
    const fresh = await prisma.inventory.findUnique({ where: { productId: p.productId } })
    if (fresh.currentStock > target) {
      await prisma.stockAdjustment.create({
        data: { productId: p.productId, qtyChanged: target - fresh.currentStock, reason: 'correction', note: 'Demo: shrinkage/festive stock-out' },
      })
    }
  }

  // 5) sample returns (guaranteed: two multi-unit sales found anywhere)
  const todaySales = await prisma.salesTransaction.findMany({ where: { saleDate: today }, orderBy: { saleId: 'asc' } })
  const multi = todaySales.filter((s) => s.qtySold > 1)
  const r1 = multi[0]
  if (r1) await prisma.return.create({ data: { originalSaleId: r1.saleId, productId: r1.productId, qtyReturned: 1, reason: 'wrong_size', resellable: true, returnDate: today } })
  const r2 = multi[1]
  if (r2) await prisma.return.create({ data: { originalSaleId: r2.saleId, productId: r2.productId, qtyReturned: 1, reason: 'damaged', resellable: false, returnDate: today } })

  const inv = await prisma.inventory.aggregate({ _sum: { currentStock: true }, _count: true })
  const sales = await prisma.salesTransaction.count()
  const rets = await prisma.return.count()
  console.log(`seeded: products=${inv._count}, units-in-stock=${inv._sum.currentStock}, sales=${sales}, returns=${rets}`)
}

async function createSale(prisma, product, qty, today, day, modes) {
  // UTC-noon arithmetic keeps every sale on its intended calendar day
  const saleDate = new Date(today.getTime() - day * 86400000)
  const hour = 10 + rand(10)
  const minute = rand(60)
  const saleTime = new Date(Date.UTC(2000, 0, 1, hour, minute)) // UTC fields keep the intended wall time on time columns
  await prisma.$transaction(async (tx) => {
    await tx.salesTransaction.create({
      data: {
        productId: product.productId,
        qtySold: qty,
        sellingPrice: product.sellingPrice,
        discount: rand(5) * 25,
        paymentMode: modes[rand(3)],
        saleDate,
        saleTime,
      },
    })
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
