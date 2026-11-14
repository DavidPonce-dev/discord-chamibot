import type { Ports, MusicRecommendPort, LoggerPort } from "./ports"
import type { RadioResult, VideoSearchResult, GuildSession, Track, GroqCandidate } from "./types"
import * as Queue from "./queue"
import { parseTitle, displayTitle, youtubeThumbnail } from "./track-parser"
import { parseDurationSec } from "../shared/format"
import { MAX_AUTOPLAY_SEC, MIN_AUTOPLAY_SEC, MAX_RETRIES, ARTIST_ROTATION_LIMIT } from "../config/radio"

// What the engine needs from the outside world
export type RadioEnginePorts = Pick<Ports, "lastfm" | "groq" | "search" | "logger">

type TitleSet = Set<string>
type ExcludeIds = ReadonlySet<string>

const filterVideos = (
  videos: readonly VideoSearchResult[],
  excludeIds: ExcludeIds,
): readonly VideoSearchResult[] =>
  videos.filter(v => {
    if (v.id && excludeIds.has(v.id)) return false
    // No duration means a live stream or premiere
    const durSec = parseDurationSec(v.durationRaw)
    return durSec >= MIN_AUTOPLAY_SEC && durSec <= MAX_AUTOPLAY_SEC
  })

// Uploads that are not the song as recorded. They often outrank it in the search results
const ALTERNATE_VERSION_MARKERS: readonly RegExp[] = [
  /\blive\b/i, /\ben vivo\b/i, /\ben directo\b/i, /\bcover\b/i, /\bkaraoke\b/i, /\binstrumental\b/i,
  /\bremix\b/i, /\bslowed\b/i, /\bsped up\b/i, /\bnightcore\b/i, /\b8d\b/i, /\breverb\b/i, /\bac[uú]stico\b/i, /\bacoustic\b/i,
]

// A marker only disqualifies the upload when the wanted track doesn't carry it too ("Song (Live)")
const isAlternateVersion = (title: string, wanted: string): boolean =>
  ALTERNATE_VERSION_MARKERS.some(marker => marker.test(title) && !marker.test(wanted))

// First result that is the song itself; an alternate version only when there is nothing else
const pickVideo = (videos: readonly VideoSearchResult[], wanted: string): VideoSearchResult | undefined =>
  videos.find(v => !isAlternateVersion(v.title ?? "", wanted)) ?? videos[0]

const toResultTrack = (video: VideoSearchResult): RadioResult["track"] => ({
  title: video.title ?? "Unknown",
  url: video.url ?? `https://youtube.com/watch?v=${video.id}`,
  duration: video.durationRaw,
  id: video.id,
  thumbnail: video.id ? youtubeThumbnail(video.id) : undefined,
})

const resolveToYouTube = async (
  searchPort: Ports["search"],
  artist: string,
  track: string,
  excludeIds: ExcludeIds,
): Promise<RadioResult | null> => {
  const query = `${artist} ${track}`
  const videos = await searchPort.searchVideos(query, 15)
  const picked = pickVideo(filterVideos(videos, excludeIds), query)
  if (!picked) return null
  return { track: toResultTrack(picked), canonicalTitle: `${artist} - ${track}` }
}

// Each YouTube search spawns a yt-dlp process (~2.5s): run candidates in parallel batches
// and return the first success in priority order, without waiting for slower ones
const firstInBatches = async <T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R | null>,
  batchSize = MAX_RETRIES,
): Promise<R | null> => {
  for (let i = 0; i < items.length; i += batchSize) {
    const pending = items.slice(i, i + batchSize).map(item => fn(item).catch(() => null))
    for (const p of pending) {
      const result = await p
      if (result) return result
    }
  }
  return null
}

// Lowercase words padded with spaces, so matches are whole words: "blind" is not in "blinding lights"
const toWords = (s: string): string =>
  ` ${s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `

const wasRecentlyPlayed = (cand: { artist: string; name: string }, recentTitles: TitleSet): boolean => {
  const song = toWords(cand.name)
  if (!song.trim()) return false
  const full = toWords(`${cand.artist} ${cand.name}`)
  return [...recentTitles].some(t => {
    const title = toWords(t)
    return title.includes(full) || title.includes(song)
  })
}

const shuffled = <T>(items: readonly T[]): T[] => {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const buildExcludeSets = (
  recentHistory: readonly string[],
  extraIds?: readonly string[],
): { excludeIds: ExcludeIds; recentTitles: TitleSet } => {
  const excludeIds = new Set(extraIds ?? [])
  const recentTitles = new Set(recentHistory.map(t => t.toLowerCase()))
  return { excludeIds, recentTitles }
}

const tryLastFmRecommendation = async (
  ports: RadioEnginePorts,
  artist: string,
  track: string,
  excludeIds: ExcludeIds,
  recentTitles: TitleSet,
): Promise<RadioResult | null> => {
  const candidates = await ports.lastfm.getSimilarTracks(artist, track, 15)
  if (candidates.length === 0) return null

  const pool = [...candidates].sort((a, b) => b.match - a.match).slice(0, 10)
  // Filter before picking so recently played songs don't use up the attempts
  const picks = shuffled(pool.filter(cand => !wasRecentlyPlayed(cand, recentTitles)))
    .slice(0, MAX_RETRIES)

  return firstInBatches(picks, cand => resolveToYouTube(ports.search, cand.artist, cand.name, excludeIds))
}

const tryArtistSwitch = async (
  ports: RadioEnginePorts,
  currentArtist: string,
  excludeIds: ExcludeIds,
  recentTitles: TitleSet,
): Promise<RadioResult | null> => {
  const similarArtists = await ports.lastfm.getSimilarArtists(currentArtist, 5)
  if (similarArtists.length === 0) return null

  const sorted = [...similarArtists].sort((a, b) => b.match - a.match)

  // Last.fm lookups are cheap HTTP calls: fetch every artist's top tracks at once
  const topTracksPerArtist = await Promise.all(
    sorted.map(similar => ports.lastfm.getArtistTopTracks(similar.name, 10)),
  )

  // Up to MAX_RETRIES random picks per artist, ordered by artist similarity then pick round
  const picksPerArtist = topTracksPerArtist.map(tracks =>
    shuffled(tracks.filter(cand => !wasRecentlyPlayed(cand, recentTitles))).slice(0, MAX_RETRIES),
  )
  const candidates = Array.from({ length: MAX_RETRIES }, (_, round) =>
    picksPerArtist.flatMap(picks => (picks[round] ? [picks[round]] : [])),
  ).flat()

  const result = await firstInBatches(candidates, cand => resolveToYouTube(ports.search, cand.artist, cand.name, excludeIds))
  if (result) {
    ports.logger.info("radio", "Recomendacion Last.fm encontrada (artista similar)", {
      from: currentArtist,
      track: result.track.title,
      canonicalTitle: result.canonicalTitle,
      id: result.track.id,
    })
  }
  return result
}

const discoverArtistViaLastFm = async (
  ports: RadioEnginePorts,
  songTitle: string,
  excludeIds: ExcludeIds,
  recentTitles: TitleSet,
): Promise<RadioResult | null> => {
  const results = await ports.lastfm.searchTrack(songTitle, 5)
  if (results.length === 0) return null

  const best = results[0]
  return tryLastFmRecommendation(ports, best.artist, best.name, excludeIds, recentTitles)
}

// LLM suggestions only (HTTP, no yt-dlp): cheap enough to request while Last.fm is being tried
const getGroqCandidates = async (
  ports: RadioEnginePorts,
  artist: string,
  song: string,
  recentTitles: TitleSet,
  artistHistory: readonly string[],
): Promise<readonly GroqCandidate[]> => {
  let genreTags: string[] = []
  if (artist && song) {
    const tags = await ports.lastfm.getTrackTopTags(artist, song)
    genreTags = tags
      .filter((t): t is { name: string; count: number } => !!t.count && t.count > 10)
      .slice(0, 5)
      .map(t => t.name)
  }

  return ports.groq.recommend(
    artist || song,
    song,
    recentTitles,
    5,
    artistHistory,
    genreTags,
  )
}

const resolveGroqCandidates = async (
  ports: RadioEnginePorts,
  candidates: readonly GroqCandidate[],
  excludeIds: ExcludeIds,
): Promise<RadioResult | null> => {
  const result = await firstInBatches(candidates, cand => resolveToYouTube(ports.search, cand.artist, cand.name, excludeIds))
  if (result) {
    ports.logger.info("radio", "Recomendacion Groq encontrada", {
      title: result.track.title,
      id: result.track.id,
      canonicalTitle: result.canonicalTitle,
    })
  }
  return result
}

// Keep the clean artist/song (from Last.fm or Groq via canonicalTitle) so the UI doesn't fall back
// to the raw YouTube upload title
export const toRadioTrack = (result: RadioResult): Track => {
  const { artist, song } = parseTitle(result.canonicalTitle ?? result.track.title)
  return {
    ...result.track,
    requestedBy: "radio",
    canonicalTitle: result.canonicalTitle,
    artist: artist || undefined,
    song,
  }
}

export const recommendAndEnqueue = async (
  session: GuildSession,
  recommend: MusicRecommendPort,
  logger: LoggerPort,
): Promise<GuildSession> => {
  // Seed with the identified "Artist - Song" (channel-aware) rather than the raw upload title
  const current = session.queue.current
  const searchTitle = session.radioBaseTitle ?? (current ? displayTitle(current) : undefined) ?? session.recentTitles[0]
  if (!searchTitle) {
    logger.warn("radio", "No hay titulo base para recomendar", {
      radioBaseTitle: session.radioBaseTitle ?? null,
      current: session.queue.current?.title ?? null,
      historyCount: session.recentTitles.length,
    })
    return session
  }

  const excludeIds = [
    ...(session.queue.current?.id ? [session.queue.current.id] : []),
    ...session.recentIds,
  ]

  const result = await recommend.findRelated(searchTitle, session.recentTitles, {
    shouldSwitch: session.sameArtistStreak >= ARTIST_ROTATION_LIMIT,
    currentArtist: session.currentArtist,
    artistHistory: session.artistHistory,
    excludeIds,
  })

  if (!result) {
    logger.info("radio", "Sin tema de radio (findRelated = null)", { searchTitle })
    return session
  }

  const track = toRadioTrack(result)
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

export const createRadioEngine = (ports: RadioEnginePorts) => {
  const findRelated = async (
    lastTrackTitle: string,
    recentHistory: readonly string[],
    opts?: { shouldSwitch?: boolean; currentArtist?: string | null; artistHistory?: readonly string[]; excludeIds?: readonly string[] },
  ): Promise<RadioResult | null> => {
    if (!lastTrackTitle) return null

    const shouldSwitch = opts?.shouldSwitch ?? false
    const currentArtist = opts?.currentArtist ?? null
    const artistHistory = opts?.artistHistory ?? []

    let { artist, song: songOnly } = parseTitle(lastTrackTitle)

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

    const { excludeIds, recentTitles } = buildExcludeSets(recentHistory, opts?.excludeIds)
    recentTitles.add(lastTrackTitle.toLowerCase())

    ports.logger.debug("radio", "findRelated: buscando siguiente tema", {
      searchTitle: lastTrackTitle,
      artist: artist || null,
      song: songOnly,
      shouldSwitch,
      historyCount: recentHistory.length,
    })

    if (shouldSwitch && currentArtist) {
      const switchResult = await tryArtistSwitch(ports, currentArtist, excludeIds, recentTitles)
      if (switchResult) return switchResult
    }

    // Ask Groq for suggestions while Last.fm is tried, but only search them on YouTube
    // (yt-dlp processes) if Last.fm comes up empty
    const groqCandidatesPromise = getGroqCandidates(ports, artist || songOnly, songOnly, recentTitles, artistHistory)
      .catch((): readonly GroqCandidate[] => [])

    const lastfmResult = artist
      ? await tryLastFmRecommendation(ports, artist, songOnly, excludeIds, recentTitles)
      : await discoverArtistViaLastFm(ports, songOnly, excludeIds, recentTitles)

    if (lastfmResult) {
      ports.logger.info("radio", "Recomendacion Last.fm encontrada", {
        title: lastfmResult.track.title,
        id: lastfmResult.track.id,
        canonicalTitle: lastfmResult.canonicalTitle,
      })
      return lastfmResult
    }

    // No similar tracks (unknown or obscure song): similar artists still keep the style,
    // so try them before the LLM and the generic YouTube fallbacks
    const alreadyTriedArtist = shouldSwitch && currentArtist?.toLowerCase() === artist.toLowerCase()
    if (artist && !alreadyTriedArtist) {
      const similarArtistResult = await tryArtistSwitch(ports, artist, excludeIds, recentTitles)
      if (similarArtistResult) return similarArtistResult
    }

    const groqResult = await resolveGroqCandidates(ports, await groqCandidatesPromise, excludeIds)
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
      const picked = pickVideo(filterVideos(videos, excludeIds), songOnly)
      if (picked) return { track: toResultTrack(picked), canonicalTitle: songOnly }
    }

    ports.logger.info("radio", "findRelated: sin resultados (Last.fm, Groq y YouTube agotados)", {
      searchTitle: lastTrackTitle,
    })

    return null
  }

  return { findRelated } as const
}
