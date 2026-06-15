import { LastFMTrack, LastFMArtist } from "lastfm-ts-api"
import { config } from "@/config"

let trackApi: LastFMTrack | null = null
let artistApi: LastFMArtist | null = null

function getApiKey(): string {
  return config.lastfm.apiKey
}

export function getTrackApi(): LastFMTrack {
  if (!trackApi) {
    trackApi = new LastFMTrack(getApiKey())
  }
  return trackApi
}

export function getArtistApi(): LastFMArtist {
  if (!artistApi) {
    artistApi = new LastFMArtist(getApiKey())
  }
  return artistApi
}

export interface LastFmSimilarTrack {
  name: string
  artist: string
  match: number
  url: string
  duration?: number
}

export interface LastFmSimilarArtist {
  name: string
  match: number
  url: string
}

export interface LastFmSearchResult {
  name: string
  artist: string
  listeners: number
  url: string
}

export async function getSimilarTracks(
  artist: string,
  track: string,
  limit = 15,
): Promise<LastFmSimilarTrack[]> {
  try {
    const api = getTrackApi()
    const response = await api.getSimilar({ artist, track, limit })

    if (!response.similartracks?.track) return []

    return response.similartracks.track.map((t) => ({
      name: t.name,
      artist: t.artist.name,
      match: parseFloat(t.match),
      url: t.url,
      duration: t.duration,
    }))
  } catch {
    return []
  }
}

export async function getSimilarArtists(
  artist: string,
  limit = 10,
): Promise<LastFmSimilarArtist[]> {
  try {
    const api = getArtistApi()
    const response = await api.getSimilar({ artist, limit })

    if (!response.similarartists?.artist) return []

    return response.similarartists.artist.map((a) => ({
      name: a.name,
      match: a.match,
      url: a.url,
    }))
  } catch {
    return []
  }
}

export async function getArtistTopTracks(
  artist: string,
  limit = 10,
): Promise<LastFmSimilarTrack[]> {
  try {
    const api = getArtistApi()
    const response = await api.getTopTracks({ artist, limit })

    if (!response.toptracks?.track) return []

    return response.toptracks.track.map((t) => ({
      name: t.name,
      artist: t.artist.name,
      match: 1,
      url: t.url,
    }))
  } catch {
    return []
  }
}

export async function searchTrack(
  track: string,
  limit = 5,
): Promise<LastFmSearchResult[]> {
  try {
    const api = getTrackApi()
    const response = await api.search({ track, limit })

    if (!response.results?.trackmatches?.track) return []

    return response.results.trackmatches.track.map((t) => ({
      name: t.name,
      artist: t.artist,
      listeners: parseInt(t.listeners, 10) || 0,
      url: t.url,
    }))
  } catch {
    return []
  }
}
