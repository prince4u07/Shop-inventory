import pg from 'pg'
import 'dotenv/config'

const base = process.env.BASE_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'
const dbPort = process.env.DB_PORT || '5432'
const url = base.replace(':5432', ':' + dbPort).replace(/\/postgres$/, '/postgres')
const target = process.env.DATABASE_URL || `postgresql://postgres:postgres@127.0.0.1:${dbPort}/shopdb`

async function main() {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['shopdb'])
  if (rows.length === 0) {
    await client.query('CREATE DATABASE shopdb')
    console.log('database shopdb created')
  } else {
    console.log('database shopdb already exists')
  }
  await client.end()
  console.log('target:', target)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
