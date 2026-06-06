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
  queuePlaybackClear: "q_playback_clear",
  queuePlaybackAutoplay: "q_playback_autoplay",
  nowPlayingPause: "np_pause",
  nowPlayingResume: "np_resume",
  nowPlayingSkip: "np_skip",
  nowPlayingLoop: "np_loop",
  nowPlayingShuffle: "np_shuffle",
  nowPlayingSeekBack: "np_seek_back",
} as const

export const EMBED_COLORS = {
  primary: 0x5865F2,
  success: 0x57F287,
  warning: 0xFEE75C,
  danger: 0xED4245,
} as const

export const TRACKS_PER_PAGE = 3
