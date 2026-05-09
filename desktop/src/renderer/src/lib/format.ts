export function fmtElapsed(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}m${String(r).padStart(2, '0')}s`
}

export function fmtNumber(n: number, pad = 2): string {
  return String(n).padStart(pad, '0')
}

export function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}K`
}
