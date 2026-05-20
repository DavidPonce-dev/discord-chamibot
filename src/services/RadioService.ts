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
    excludeTitles: Set<string> = new Set(),
    currentArtist?: string | null,
    shouldSwitch?: boolean,
  ): Promise<Omit<Track, "requestedBy"> | null> {
    return this.recommender.findRelated(currentTrack, lastTrackTitle, excludeTitles, currentArtist, shouldSwitch)
  }
}
