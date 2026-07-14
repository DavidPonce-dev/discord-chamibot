export interface CookieRefreshResult {
  success: boolean
  cookieCount?: number
  cookieNames?: string[]
  isLoggedIn?: boolean
  timestamp?: string
  error?: string
}

export interface CookieValidationResult {
  isValid: boolean
  cookieCount: number
  cookieNames: string[]
  hasPSID: boolean
  hasSID: boolean
  lastModified: Date | null
}

export interface CookieRefresherConfig {
  cookieDir: string
  cookieFile: string
  browserProfile: string
  refreshTimeoutMs: number
}
