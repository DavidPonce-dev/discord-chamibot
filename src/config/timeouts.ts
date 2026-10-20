export const PROGRESS_UPDATE_INTERVAL_MS = 5_000
export const AUTO_DELETE_MS = 5_000
export const SEEK_SETTLE_DELAY_MS = 100
export const YTDL_TIMEOUT_MS = 30_000
export const YTDL_RESOLVE_TIMEOUT_MS = 15_000
export const YTDL_SEARCH_TIMEOUT_MS = 8_000
export const AUTOCOMPLETE_SUGGEST_TIMEOUT_MS = 1_500
export const AUTOCOMPLETE_FALLBACK_TIMEOUT_MS = 2_500
export const AUTOCOMPLETE_CACHE_MS = 30_000
// Cookie session watchdog: how often to check for SID/PSID, and the max wait between failed recoveries
export const COOKIE_AUTH_CHECK_INTERVAL_MS = 10 * 60_000
export const COOKIE_RECOVERY_MAX_BACKOFF_MS = 3 * 60 * 60_000
