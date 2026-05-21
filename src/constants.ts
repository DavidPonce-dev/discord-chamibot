import type { LoopMode } from "./core/types"

export const LOOP_LABELS = {
  none: "❌ Desactivado",
  one: "🔂 Repetir uno",
  all: "🔁 Repetir todo",
} as const

export const TRACKS_PER_PAGE = 3

export const MAX_AUTOPLAY_SEC = 1500
export const MAX_RETRIES = 3
export const ARTIST_ROTATION_LIMIT = 3

export const GENRE_KEYWORDS = [
  "rock", "pop", "metal", "hip hop", "rap", "r&b", "jazz", "blues",
  "country", "electronic", "dance", "classical", "reggae", "punk",
  "alternative", "indie", "soul", "funk", "disco", "folk", "latin",
  "edm", "techno", "house", "trance", "dubstep", "ambient", "grunge",
  "punk rock", "alternative rock", "hard rock", "heavy metal", "nu metal",
  "hip-hop", "trap", "lo-fi", "synthwave", "progressive", "acoustic",
]

export const NON_MUSIC_KEYWORDS = [
  "podcast", "interview", "tutorial", "review", "reaction",
  "vlog", "gameplay", "comedy", "lecture", "documentary",
  "asmr", "full album", "live stream", "audiobook",
]
