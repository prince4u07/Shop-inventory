const hints = [
  ['Direct edits to inventory.current_stock', 422],
  ['Insufficient stock', 422],
  ['Cannot return', 422],
  ['would leave negative stock', 422],
  ['does not belong to sale', 422],
  ['Product not found', 404],
  ['Original sale not found', 404],
]

export function dbError(res, e, fallbackStatus = 500) {
  const code = e?.code || ''
  const raw = (e && (e.meta?.message || e.meta?.reason || e.message)) || 'Internal server error'

  // Prisma known-request codes -> precise HTTP codes
  if (code === 'P2002') return res.status(409).json({ error: 'Duplicate value: a record with this unique field already exists' })
  if (code === 'P2025') return res.status(404).json({ error: 'Record not found' })
  if (code === 'P2003' || code === 'P2014') return res.status(422).json({ error: raw.split('\n')[0].slice(0, 300) })

  // validation-stage errors are always the caller's fault (wrong types/ranges)
  if (e?.name === 'PrismaClientValidationError' || /out of range for the type|invalid input syntax|INT4|INT8|check constraint|cannot store/.test(String(raw))) {
    return res.status(400).json({ error: String(raw).split('\n').filter(Boolean).pop().slice(0, 200) })
  }

  for (const [needle, status] of hints) {
    if (raw.includes(needle) || (e?.meta && JSON.stringify(e.meta).includes(needle))) {
      return res.status(status).json({ error: raw })
    }
  }
  if (e?.meta?.target) {
    return res.status(409).json({ error: raw.slice(0, 300) })
  }
  console.error(e)
  return res.status(fallbackStatus).json({ error: raw.slice(0, 300) })
}
