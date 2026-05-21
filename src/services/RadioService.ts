import { Track } from "../core/types"
import { YouTubeRecommender } from "../radio/YouTubeRecommender"
import { logger } from "../utils/logger"

export class RadioService {
  private recommender: YouTubeRecommender

  constructor() {
    this.recommender = new YouTubeRecommender()
  }

  async findRelated(
    currentTrack: Track | null,
    lastTrackTitle: string | null,
    excludeTitles: Set<string> = new Set(),
    currentArtist?: string | null,
    shouldSwitch?: boolean,
  ): Promise<Omit<Track, "requestedBy"> | null> {
    logger.debug("radio", "Buscando track relacionado", {
      currentTrack: currentTrack?.title,
      lastTitle: lastTrackTitle,
      shouldSwitch,
      excludeCount: excludeTitles.size,
    })

    const result = await this.recommender.findRelated(
      currentTrack,
      lastTrackTitle,
      excludeTitles,
      currentArtist,
      shouldSwitch,
    )

    if (result) {
      logger.info("radio", "Track relacionado encontrado", {
        title: result.title,
        id: result.id,
      })
    } else {
      logger.warn("radio", "No se encontró track relacionado")
    }

    return result
  }
}
