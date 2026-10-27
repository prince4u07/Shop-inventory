// Neutralize CSV-formula injection: spreadsheet-opened exports must never
// execute =, +, -, @ prefixed cells. The guard quote must be added BEFORE
// CSV double-quoting, otherwise the quote hides the trigger from the check
// while Excel still unquotes it back to an executable formula.
const SHEET_TRIGGER = /^\s*[=+\-@\t\r]/

export function toCsv(rows) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    let s = String(v instanceof Date ? v.toISOString() : v)
    if (SHEET_TRIGGER.test(s)) s = `'` + s
    if (/[\r\n"]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
    return s
  }
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
}
