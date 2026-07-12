import type { LoopMode } from "../core/types"

export const LOOP_LABELS = {
  none: "❌ Desactivado",
  one: "🔂 Repetir uno",
  all: "🔁 Repetir todo",
} as const satisfies Record<LoopMode, string>

export const BUTTON_PREFIXES = {
  queueUp: "q_up_",
  queueDown: "q_down_",
  queueDelete: "q_del_",
  queueTrack: "q_track_",
  queuePagePrev: "q_page_prev",
  queuePageNext: "q_page_next",
  queuePageIndicator: "q_page_indicator",
  queuePlaybackPause: "q_playback_pause",
  queuePlaybackSkip: "q_playback_skip",
  queuePlaybackShuffle: "q_playback_shuffle",
  queuePlaybackAutoplay: "q_playback_autoplay",
  queuePlaybackStop: "q_playback_stop",
  queueRadioShuffle: "q_radio_shuffle_",
} as const

export const EMBED_COLORS = {
  primary: 0x5865F2,
  success: 0x57F287,
  warning: 0xFEE75C,
  danger: 0xED4245,
} as const

export const TRACKS_PER_PAGE = 3
