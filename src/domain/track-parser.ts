const SEPARATORS = [
  { pattern: /\sft\.\s|\sfeat\.\s|\bfeat\./i },
  { pattern: /\s[-–—|│]\s/ },
  { pattern: /\s\/\/\s/ },
  { pattern: /\s?:\s/ },
] as const

export const youtubeThumbnail = (id: string): string =>
  `https://img.youtube.com/vi/${id}/hqdefault.jpg`

export const extractArtist = (title: string): string => {
  const jpOpen = title.indexOf("「")
  if (jpOpen > 0) return title.slice(0, jpOpen).trim()

  const clean = title.replace(/\[.*?\]|\(.*?\)/g, "").trim()

  for (const { pattern } of SEPARATORS) {
    const match = title.search(pattern)
    if (match > 0) {
      const artist = title.slice(0, match).trim()
      if (artist.length > 0 && artist.length < clean.length) return artist
    }
  }

  return ""
}

export const extractSong = (title: string): string => {
  const jpOpen = title.indexOf("「")
  const jpClose = title.indexOf("」")
  if (jpOpen >= 0 && jpClose > jpOpen) {
    return title.slice(jpOpen + 1, jpClose).trim()
  }

  const clean = title.replace(/\[.*?\]|\(.*?\)/g, "").trim()

  for (const { pattern } of SEPARATORS) {
    const match = clean.match(pattern)
    if (match && match.index !== undefined && match.index > 0) {
      let song = clean.slice(match.index + match[0].length).trim()
      for (const { pattern: p2 } of SEPARATORS) {
        const m2 = song.match(p2)
        if (m2 && m2.index !== undefined && m2.index >= 0) {
          song = song.slice(m2.index + m2[0].length).trim()
          break
        }
      }
      if (song.length > 0) return song
    }
  }

  return clean
}

export const sanitizeYouTubeUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    const vid = parsed.searchParams.get("v")
    if (vid) return `https://www.youtube.com/watch?v=${vid}`
  } catch {}
  return url
}

export const extractVideoId = (url: string): string | undefined => {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get("v") ?? undefined
  } catch {
    return undefined
  }
}
