export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: options.body ? { 'content-type': 'application/json' } : {},
    ...options,
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* csv/binary */
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`)
  }
  return body
}

export const fmt = {
  money(n) {
    return Number(n ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
  },
  money2(n) {
    return Number(n ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
  },
  today() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },
}
