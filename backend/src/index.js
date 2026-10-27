import 'dotenv/config'
import { createApp } from './app.js'
import { prisma } from './lib/prisma.js'

const port = Number(process.env.PORT || 4000)
const app = createApp()

const server = app.listen(port, () => {
  console.log(`Shop Inventory API listening on http://localhost:${port}`)
})

async function shutdown() {
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
