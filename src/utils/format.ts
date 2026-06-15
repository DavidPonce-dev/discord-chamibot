export function parseDuration(dur: string | undefined): number {
  if (!dur) return 0
  const parts = dur.split(":").map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

export function parseDurationSec(dur: string | number | null | undefined): number {
  if (dur == null) return 0
  if (typeof dur === "number") return dur
  return parseDuration(dur)
}

export function formatTime(seconds: number, fractional = false): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = fractional ? seconds % 60 : Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

export function calcTotalPages(itemCount: number, perPage: number): number {
  return Math.max(1, Math.ceil(itemCount / perPage))
}

export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages)
}

export function paginate<T>(items: T[], page: number, perPage: number) {
  const totalPages = calcTotalPages(items.length, perPage)
  const clampedPage = clampPage(page, totalPages)
  const startIdx = (clampedPage - 1) * perPage
  return {
    pageItems: items.slice(startIdx, startIdx + perPage),
    page: clampedPage,
    totalPages,
    startIdx,
  }
}

const EMPTY = "\u2591"
const FILLED = "\u2588"

export function buildProgressBar(pos: number, total: number, width = 24): string {
  if (total <= 0) return `[${EMPTY.repeat(width)}] ${formatTime(pos)} / ?:??`
  const filledCount = Math.round((pos / total) * width)
  const bar = FILLED.repeat(filledCount) + EMPTY.repeat(width - filledCount)
  return `[${bar}] ${formatTime(pos)} / ${formatTime(total)}`
}
