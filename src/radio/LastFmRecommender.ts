import { Track } from "@/core/types"
import { parseDurationSec } from "@/utils/format"
import { MAX_AUTOPLAY_SEC, MAX_RETRIES } from "@/config/radio"
import { searchPlayDl, VideoResult } from "@/radio/RadioSearchService"
import {
  getSimilarTracks,
  getSimilarArtists,
  getArtistTopTracks,
  searchTrack,
  LastFmSimilarTrack,
} from "@/services/lastfm/LastFmService"
import { logger } from "@/utils/logger"

export interface RadioResult {
  track: Omit<Track, "requestedBy">
  canonicalTitle?: string
}

const SEPARATORS = [
  { pattern: /\sft\.\s|\sfeat\.\s|\bfeat\./i, label: "feat" },
  { pattern: /\s[-–—|]\s/, label: "dash" },
  { pattern: /\s\/\/\s/, label: "slash" },
  { pattern: /\s?:\s/, label: "colon" },
]

export function extractArtist(title: string): string {
  const clean = title.replace(/\[.*?\]|\(.*?\)/g, "").trim()

  for (const { pattern } of SEPARATORS) {
    const match = title.search(pattern)
    if (match > 0) {
      const artist = title.slice(0, match).trim()
      if (artist.length > 0 && artist.length < clean.length) {
        return artist
      }
    }
  }

  return ""
}

export function extractSongOnly(title: string): string {
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

function filterVideos(
  videos: VideoResult[],
  excludeIds: Set<string>,
): VideoResult[] {
  return videos.filter((v) => {
    if (v.id && excludeIds.has(v.id)) return false
    const durSec = parseDurationSec(v.durationRaw)
    return durSec <= MAX_AUTOPLAY_SEC
  })
}

async function resolveToYouTube(
  artist: string,
  track: string,
  excludeIds: Set<string>,
): Promise<RadioResult | null> {
  const query = `${artist} ${track}`
  const videos = await searchPlayDl(query)
  if (!videos.length) return null

  const filtered = filterVideos(videos, excludeIds)
  if (!filtered.length) return null

  const picked = filtered[0]
  return {
    track: {
      title: picked.title ?? "Unknown",
      url: picked.url ?? `https://youtube.com/watch?v=${picked.id}`,
      duration: picked.durationRaw,
      id: picked.id,
      thumbnail: picked.id
        ? `https://img.youtube.com/vi/${picked.id}/hqdefault.jpg`
        : undefined,
    },
    canonicalTitle: `${artist} - ${track}`,
  }
}

async function tryLastFmRecommendation(
  artist: string,
  track: string,
  excludeIds: Set<string>,
  last5Titles: Set<string>,
): Promise<RadioResult | null> {
  const candidates = await getSimilarTracks(artist, track, 15)
  if (candidates.length === 0) return null

  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const picks = shuffled.slice(0, MAX_RETRIES)

  for (const cand of picks) {
    const fullTitle = `${cand.artist} ${cand.name}`.toLowerCase()
    if (last5Titles.has(fullTitle)) continue

    const result = await resolveToYouTube(cand.artist, cand.name, excludeIds)
    if (result) return result
  }

  return null
}

async function tryArtistSwitch(
  currentArtist: string,
  excludeIds: Set<string>,
  last5Titles: Set<string>,
): Promise<RadioResult | null> {
  logger.debug("radio", "Rotando artista — buscando artista similar", { currentArtist })
  const similarArtists = await getSimilarArtists(currentArtist, 5)
  if (similarArtists.length === 0) return null

  const shuffled = [...similarArtists].sort(() => Math.random() - 0.5)

  for (const similar of shuffled) {
    const topTracks = await getArtistTopTracks(similar.name, 10)
    if (topTracks.length === 0) continue

    const candidates = [...topTracks].sort(() => Math.random() - 0.5)
    const picks = candidates.slice(0, MAX_RETRIES)

    for (const cand of picks) {
      const fullTitle = `${cand.artist} ${cand.name}`.toLowerCase()
      if (last5Titles.has(fullTitle)) continue

      const result = await resolveToYouTube(cand.artist, cand.name, excludeIds)
      if (result) {
        logger.info("radio", "Artista rotado exitosamente", {
          from: currentArtist,
          to: similar.name,
          track: result.track.title,
          id: result.track.id,
        })
        return result
      }
    }
  }

  return null
}

async function discoverArtistViaLastFm(
  songTitle: string,
  excludeIds: Set<string>,
  last5Titles: Set<string>,
): Promise<RadioResult | null> {
  const results = await searchTrack(songTitle, 5)
  if (results.length === 0) return null

  const best = results[0]
  logger.debug("radio", "Artista descubierto via Last.fm search", {
    song: songTitle,
    artist: best.artist,
    track: best.name,
  })

  return tryLastFmRecommendation(best.artist, best.name, excludeIds, last5Titles)
}

export async function findRelated(
  lastTrackTitle: string,
  last5History: string[],
  shouldSwitch = false,
  currentArtist: string | null = null,
): Promise<RadioResult | null> {
  if (!lastTrackTitle) return null

  const artist = extractArtist(lastTrackTitle)
  const songOnly = extractSongOnly(lastTrackTitle)

  const excludeIds = new Set(last5History.map((t) => {
    const match = t.match(/v=([a-zA-Z0-9_-]+)/)
    return match?.[1]
  }).filter(Boolean) as string[])

  const last5Titles = new Set(last5History.map((t) => t.toLowerCase()))

  if (shouldSwitch && currentArtist) {
    const switchResult = await tryArtistSwitch(currentArtist, excludeIds, last5Titles)
    if (switchResult) return switchResult
  }

  let lastfmResult: RadioResult | null = null

  if (artist) {
    logger.debug("radio", "Buscando recomendación Last.fm (con artista)", {
      artist,
      track: songOnly,
    })
    lastfmResult = await tryLastFmRecommendation(artist, songOnly, excludeIds, last5Titles)
  } else {
    logger.debug("radio", "Buscando recomendación Last.fm (solo canción, descubriendo artista)", {
      song: songOnly,
    })
    lastfmResult = await discoverArtistViaLastFm(songOnly, excludeIds, last5Titles)
  }

  if (lastfmResult) {
    logger.info("radio", "Recomendación Last.fm encontrada", {
      title: lastfmResult.track.title,
      id: lastfmResult.track.id,
      canonicalTitle: lastfmResult.canonicalTitle,
    })
    return lastfmResult
  }

  logger.debug("radio", "Last.fm sin resultados, fallback a YouTube")

  const fallbackQuery = artist ? `${artist} music` : songOnly
  const videos = await searchPlayDl(fallbackQuery)
  if (!videos.length) return null

  const filtered = filterVideos(videos, excludeIds)
  if (!filtered.length) return null

  const shuffled = [...filtered].sort(() => Math.random() - 0.5)
  const picked = shuffled[0]

  return {
    track: {
      title: picked.title ?? "Unknown",
      url: picked.url ?? `https://youtube.com/watch?v=${picked.id}`,
      duration: picked.durationRaw,
      id: picked.id,
      thumbnail: picked.id
        ? `https://img.youtube.com/vi/${picked.id}/hqdefault.jpg`
        : undefined,
    },
  }
}
