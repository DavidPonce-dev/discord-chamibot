import { Track } from "../core/types"
import { YouTubeRecommender } from "../radio/YouTubeRecommender"

export class RadioService {
  private recommender: YouTubeRecommender

  constructor() {
    this.recommender = new YouTubeRecommender()
  }

  async findRelated(
    currentTrack: Track | null,
    lastTrackTitle: string | null,
  ): Promise<Omit<Track, "requestedBy"> | null> {
    return this.recommender.findRelated(currentTrack, lastTrackTitle)
  }
}
