// strict input coercion: no boolean->number, array->number or "1e5"->int leaks
// ints are also capped to the int32 range the DB columns can actually hold —
// 2^31-scale values crash Prisma's INT4 conversion with a 500 if they slip through
export function toInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= -2147483648 && v <= 2147483647 ? v : NaN
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) {
    const n = parseInt(v.trim(), 10)
    return n >= -2147483648 && n <= 2147483647 ? n : NaN
  }
  return NaN
}

export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v)
  return NaN
}

// 'YYYY-MM-DD' must be a real calendar date (rejects 2026-13-99, 2026-02-30…)
export function isDayStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const t = new Date(Date.UTC(y, m - 1, d, 12))
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

// escape LIKE wildcards so "50%" doesn't become a pattern match
export function likeSafe(s) {
  return String(s).replace(/[\\%_]/g, (ch) => '\\' + ch)
}
