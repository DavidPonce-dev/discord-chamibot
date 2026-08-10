import { LastFMTrack, LastFMArtist } from "lastfm-ts-api"
import type { LastFmPort } from "../../domain/ports"
import type { LastFmSimilarTrack, LastFmSimilarArtist, LastFmSearchResult, LastFmTag } from "../../domain/types"

export const createLastFmAdapter = (apiKey: string): LastFmPort => {
  let trackApi: LastFMTrack | null = null
  let artistApi: LastFMArtist | null = null

  const getTrackApi = (): LastFMTrack => {
    if (!trackApi) trackApi = new LastFMTrack(apiKey)
    return trackApi
  }

  const getArtistApi = (): LastFMArtist => {
    if (!artistApi) artistApi = new LastFMArtist(apiKey)
    return artistApi
  }

  const getSimilarTracks = async (artist: string, track: string, limit = 15): Promise<readonly LastFmSimilarTrack[]> => {
    try {
      const response = await getTrackApi().getSimilar({ artist, track, limit })
      if (!response.similartracks?.track) return []
      return response.similartracks.track.map((t): LastFmSimilarTrack => ({
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

  const getSimilarArtists = async (artist: string, limit = 10): Promise<readonly LastFmSimilarArtist[]> => {
    try {
      const response = await getArtistApi().getSimilar({ artist, limit })
      if (!response.similarartists?.artist) return []
      return response.similarartists.artist.map((a): LastFmSimilarArtist => ({
        name: a.name,
        match: a.match,
        url: a.url,
      }))
    } catch {
      return []
    }
  }

  const getArtistTopTracks = async (artist: string, limit = 10): Promise<readonly LastFmSimilarTrack[]> => {
    try {
      const response = await getArtistApi().getTopTracks({ artist, limit })
      if (!response.toptracks?.track) return []
      return response.toptracks.track.map((t): LastFmSimilarTrack => ({
        name: t.name,
        artist: t.artist.name,
        match: 1,
        url: t.url,
      }))
    } catch {
      return []
    }
  }

  const searchTrack = async (track: string, limit = 5): Promise<readonly LastFmSearchResult[]> => {
    try {
      const response = await getTrackApi().search({ track, limit })
      if (!response.results?.trackmatches?.track) return []
      return response.results.trackmatches.track.map((t): LastFmSearchResult => ({
        name: t.name,
        artist: t.artist,
        listeners: parseInt(t.listeners, 10) || 0,
        url: t.url,
      }))
    } catch {
      return []
    }
  }

  const getTrackTopTags = async (artist: string, track: string): Promise<readonly LastFmTag[]> => {
    try {
      const response = await getTrackApi().getTopTags({ artist, track })
      if (!response.toptags?.tag) return []
      return response.toptags.tag.map((t): LastFmTag => ({
        name: t.name,
        count: t.count,
      }))
    } catch {
      return []
    }
  }

  return { getSimilarTracks, getSimilarArtists, getArtistTopTracks, searchTrack, getTrackTopTags } as const
}
