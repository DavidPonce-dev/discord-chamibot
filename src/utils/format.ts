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

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

const NBSP = "\u00A0"

export function buildProgressBar(pos: number, total: number, width = 36): string {
  if (total <= 0) return `[${NBSP.repeat(width)}] ${formatTime(pos)} / ?:??`
  const units = Math.round((pos / total) * width * 2)
  let bar = ""
  for (let i = 0; i < width; i++) {
    const filled = units - i * 2
    if (filled >= 2) bar += "█"
    else if (filled === 1) bar += "▌"
    else bar += NBSP
  }
  return `[${bar}] ${formatTime(pos)} / ${formatTime(total)}`
}
