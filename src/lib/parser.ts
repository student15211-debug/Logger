export const normalizeQuestion = (input: string): string | null => {
  const compact = input.trim().replace(/\s+/g, '')
  const match = compact.match(/^(\d+)([a-z])?((?:\([a-z]+\))*)$/i)
  if (!match) return null
  const [, number, suffix, structured] = match
  const parts = [...structured.matchAll(/\(([a-z]+)\)/gi)].map(m => m[1].toLowerCase())
  return `${Number(number)}${suffix?.toUpperCase() || ''}${parts.map(part => `(${part})`).join('')}`
}

const tokenParts = (label: string) => {
  const m = label.match(/^(\d+)([A-Z])?(.*)$/)!
  return [Number(m[1]), m[2]?.toLowerCase() || '', ...[...m[3].matchAll(/\(([a-z]+)\)/g)].map(x => x[1])]
}
export const compareQuestions = (a: string, b: string) => {
  const x = tokenParts(a), y = tokenParts(b)
  if (x[0] !== y[0]) return Number(x[0]) - Number(y[0])
  for (let i = 1; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1
    if (y[i] === undefined) return 1
    const diff = String(x[i]).localeCompare(String(y[i]), undefined, { numeric: true })
    if (diff) return diff
  }
  return 0
}
export const parseQuestions = (raw: string) => {
  const tokens = raw.replace(/\band\b/gi, ',').replace(/&/g, ',').split(/[,;\n\r\t ]+/)
  const seen = new Set<string>()
  return tokens.map(normalizeQuestion).filter((v): v is string => !!v)
    .filter(v => { const key = v.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true })
    .sort(compareQuestions)
}
