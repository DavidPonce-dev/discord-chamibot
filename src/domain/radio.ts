import type { Ports, MusicRecommendPort, LoggerPort } from "./ports"
import type { RadioResult, VideoSearchResult, GuildSession, Track } from "./types"
import * as Queue from "./queue"
import { extractArtist, extractSong, youtubeThumbnail } from "./track-parser"
import { parseDurationSec } from "../shared/format"
import { MAX_AUTOPLAY_SEC, MAX_RETRIES, ARTIST_ROTATION_LIMIT } from "../config/radio"

type Last5Set = Set<string>
type ExcludeIds = ReadonlySet<string>

const filterVideos = (
  videos: readonly VideoSearchResult[],
  excludeIds: ExcludeIds,
): readonly VideoSearchResult[] =>
  videos.filter(v => {
    if (v.id && excludeIds.has(v.id)) return false
    const durSec = parseDurationSec(v.durationRaw)
    return durSec <= MAX_AUTOPLAY_SEC
  })

const resolveToYouTube = async (
  searchPort: Ports["search"],
  artist: string,
  track: string,
  excludeIds: ExcludeIds,
): Promise<RadioResult | null> => {
  const query = `${artist} ${track}`
  const videos = await searchPort.searchVideos(query, 15)
  const filtered = filterVideos(videos, excludeIds)
  if (filtered.length === 0) return null

  const picked = filtered[0]
  return {
    track: {
      title: picked.title ?? "Unknown",
      url: picked.url ?? `https://youtube.com/watch?v=${picked.id}`,
      duration: picked.durationRaw,
      id: picked.id,
      thumbnail: picked.id ? youtubeThumbnail(picked.id) : undefined,
    },
    canonicalTitle: `${artist} - ${track}`,
  }
}

const buildExcludeSets = (
  last5History: readonly string[],
  extraIds?: readonly string[],
): { excludeIds: ExcludeIds; last5Titles: Last5Set } => {
  const excludeIds = new Set(
    [
      ...last5History
        .map(t => {
          const match = t.match(/v=([a-zA-Z0-9_-]+)/)
          return match?.[1]
        })
        .filter((id): id is string => !!id),
      ...(extraIds ?? []),
    ],
  )
  const last5Titles = new Set(last5History.map(t => t.toLowerCase()))
  return { excludeIds, last5Titles }
}

const tryLastFmRecommendation = async (
  ports: Ports,
  artist: string,
  track: string,
  excludeIds: ExcludeIds,
  last5Titles: Last5Set,
): Promise<RadioResult | null> => {
  const candidates = await ports.lastfm.getSimilarTracks(artist, track, 15)
  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => b.match - a.match)
  const pool = sorted.slice(0, 10)
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, MAX_RETRIES)

  for (const cand of shuffled) {
    const fullTitle = `${cand.artist} ${cand.name}`.toLowerCase()
    const songLower = cand.name.toLowerCase()

    const alreadyPlayed = [...last5Titles].some(
      t => t.includes(fullTitle) || t.includes(songLower),
    )
    if (alreadyPlayed) continue

    const result = await resolveToYouTube(ports.search, cand.artist, cand.name, excludeIds)
    if (result) return result
  }

  return null
}

const tryArtistSwitch = async (
  ports: Ports,
  currentArtist: string,
  excludeIds: ExcludeIds,
  last5Titles: Last5Set,
): Promise<RadioResult | null> => {
  const similarArtists = await ports.lastfm.getSimilarArtists(currentArtist, 5)
  if (similarArtists.length === 0) return null

  const sorted = [...similarArtists].sort((a, b) => b.match - a.match)

  for (const similar of sorted) {
    const topTracks = await ports.lastfm.getArtistTopTracks(similar.name, 10)
    if (topTracks.length === 0) continue

    const candidates = [...topTracks].sort(() => Math.random() - 0.5)
    const picks = candidates.slice(0, MAX_RETRIES)

    for (const cand of picks) {
      const fullTitle = `${cand.artist} ${cand.name}`.toLowerCase()
      const songLower = cand.name.toLowerCase()

      const alreadyPlayed = [...last5Titles].some(
        t => t.includes(fullTitle) || t.includes(songLower),
      )
      if (alreadyPlayed) continue

      const result = await resolveToYouTube(ports.search, cand.artist, cand.name, excludeIds)
      if (result) {
        ports.logger.info("radio", "Artista rotado exitosamente", {
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

const discoverArtistViaLastFm = async (
  ports: Ports,
  songTitle: string,
  excludeIds: ExcludeIds,
  last5Titles: Last5Set,
): Promise<RadioResult | null> => {
  const results = await ports.lastfm.searchTrack(songTitle, 5)
  if (results.length === 0) return null

  const best = results[0]
  return tryLastFmRecommendation(ports, best.artist, best.name, excludeIds, last5Titles)
}

const tryGroqFallback = async (
  ports: Ports,
  artist: string,
  song: string,
  excludeIds: ExcludeIds,
  last5Titles: Last5Set,
  artistHistory: readonly string[],
): Promise<RadioResult | null> => {
  let genreTags: string[] = []
  if (artist && song) {
    const tags = await ports.lastfm.getTrackTopTags(artist, song)
    genreTags = tags
      .filter((t): t is { name: string; count: number } => !!t.count && t.count > 10)
      .slice(0, 5)
      .map(t => t.name)
  }

  const groqCandidates = await ports.groq.recommend(
    artist || song,
    song,
    last5Titles,
    5,
    artistHistory,
    genreTags,
  )

  for (const cand of groqCandidates) {
    const result = await resolveToYouTube(ports.search, cand.artist, cand.name, excludeIds)
    if (result) {
      ports.logger.info("radio", "Recomendacion Groq encontrada", {
        title: result.track.title,
        id: result.track.id,
        artist: cand.artist,
        song: cand.name,
      })
      return result
    }
  }

  return null
}

export const recommendAndEnqueue = async (
  session: GuildSession,
  recommend: MusicRecommendPort,
  logger: LoggerPort,
): Promise<GuildSession> => {
  const searchTitle = session.radioBaseTitle ?? session.queue.current?.title ?? session.last5Tracks[0]
  if (!searchTitle) {
    logger.warn("radio", "No hay titulo base para recomendar", {
      radioBaseTitle: session.radioBaseTitle ?? null,
      current: session.queue.current?.title ?? null,
      last5Count: session.last5Tracks.length,
    })
    return session
  }

  const excludeIds = [
    ...(session.queue.current?.id ? [session.queue.current.id] : []),
    ...session.last5Ids,
  ]

  const result = await recommend.findRelated(searchTitle, session.last5Tracks, {
    shouldSwitch: session.sameArtistStreak >= ARTIST_ROTATION_LIMIT,
    currentArtist: session.currentArtist,
    artistHistory: session.artistHistory,
    excludeIds,
  })

  if (!result) {
    logger.info("radio", "Sin tema de radio (findRelated = null)", { searchTitle })
    return session
  }

  const track: Track = { ...result.track, requestedBy: "radio", canonicalTitle: result.canonicalTitle }
  logger.info("radio", "Tema de radio encolado", {
    title: result.track.title,
    id: result.track.id ?? null,
    canonicalTitle: result.canonicalTitle ?? null,
    searchTitle,
  })

  return {
    ...session,
    queue: Queue.addRadioTrack(session.queue, track),
    radioBaseTitle: result.canonicalTitle ?? session.radioBaseTitle,
  }
}

export const createRadioEngine = (ports: Ports) => {
  const findRelated = async (
    lastTrackTitle: string,
    last5History: readonly string[],
    opts?: { shouldSwitch?: boolean; currentArtist?: string | null; artistHistory?: readonly string[]; excludeIds?: readonly string[] },
  ): Promise<RadioResult | null> => {
    if (!lastTrackTitle) return null

    const shouldSwitch = opts?.shouldSwitch ?? false
    const currentArtist = opts?.currentArtist ?? null
    const artistHistory = opts?.artistHistory ?? []

    let artist = extractArtist(lastTrackTitle)
    let songOnly = extractSong(lastTrackTitle)

    if (!artist) {
      const parsed = await ports.groq.parseTitle(lastTrackTitle)
      if (parsed?.artist && parsed?.song) {
        ports.logger.debug("radio", "LLM parsed title", {
          original: lastTrackTitle,
          artist: parsed.artist,
          song: parsed.song,
        })
        artist = parsed.artist
        songOnly = parsed.song
      }
    }

    const { excludeIds, last5Titles } = buildExcludeSets(last5History, opts?.excludeIds)
    last5Titles.add(lastTrackTitle.toLowerCase())

    ports.logger.debug("radio", "findRelated: buscando siguiente tema", {
      searchTitle: lastTrackTitle,
      artist: artist || null,
      song: songOnly,
      shouldSwitch,
      last5Count: last5History.length,
    })

    if (shouldSwitch && currentArtist) {
      const switchResult = await tryArtistSwitch(ports, currentArtist, excludeIds, last5Titles)
      if (switchResult) return switchResult
    }

    // PARALLEL: Last.fm + Groq at the same time (optimization)
    const lastfmPromise: Promise<RadioResult | null> = artist
      ? tryLastFmRecommendation(ports, artist, songOnly, excludeIds, last5Titles)
      : discoverArtistViaLastFm(ports, songOnly, excludeIds, last5Titles)

    const groqPromise: Promise<RadioResult | null> =
      tryGroqFallback(ports, artist || songOnly, songOnly, excludeIds, last5Titles, artistHistory)

    const [lastfmResult, groqResult] = await Promise.all([lastfmPromise, groqPromise])

    if (lastfmResult) {
      ports.logger.info("radio", "Recomendacion Last.fm encontrada", {
        title: lastfmResult.track.title,
        id: lastfmResult.track.id,
        canonicalTitle: lastfmResult.canonicalTitle,
      })
      return lastfmResult
    }

    if (groqResult) return groqResult

    // Fallback: broad YouTube search
    if (artist) {
      const broadResult = await resolveToYouTube(ports.search, artist, "songs", excludeIds)
      if (broadResult) {
        ports.logger.info("radio", "Fallback YouTube encontrado (artist + songs)", {
          title: broadResult.track.title,
          id: broadResult.track.id,
        })
        return broadResult
      }
    }

    if (songOnly) {
      const videos = await ports.search.searchVideos(songOnly, 15)
      const filtered = filterVideos(videos, excludeIds)
      if (filtered.length > 0) {
        const picked = filtered[0]
        return {
          track: {
            title: picked.title ?? "Unknown",
            url: picked.url ?? `https://youtube.com/watch?v=${picked.id}`,
            duration: picked.durationRaw,
            id: picked.id,
            thumbnail: picked.id ? youtubeThumbnail(picked.id) : undefined,
          },
          canonicalTitle: songOnly,
        }
      }
    }

    ports.logger.info("radio", "findRelated: sin resultados (Last.fm, Groq y YouTube agotados)", {
      searchTitle: lastTrackTitle,
    })

    return null
  }

  return { findRelated } as const
}
