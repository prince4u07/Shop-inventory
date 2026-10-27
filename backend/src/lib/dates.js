// Calendar-day hell is real: Prisma serializes JS Dates for `date` columns
// in UTC, which can shift local-midnight dates across days. Rule of thumb:
// - day windows/filtering  -> pass 'YYYY-MM-DD' TEXT to SQL with ::date casts
// - column values (Prisma create) -> always build Dates at UTC noon
export function utcNoon(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

export function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
