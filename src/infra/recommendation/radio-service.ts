import type { MusicRecommendPort, LastFmPort, GroqPort, TrackSearchPort, LoggerPort } from "../../domain/ports"
import { createRadioEngine } from "../../domain/radio"

export const createRadioService = (
  lastfm: LastFmPort,
  groq: GroqPort,
  search: TrackSearchPort,
  logger: LoggerPort,
): MusicRecommendPort => {
  const engine = createRadioEngine({
    lastfm,
    groq,
    search,
    logger,
  } as any)

  return {
    findRelated: engine.findRelated,
  } as const
}
