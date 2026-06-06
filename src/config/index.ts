import dotenv from "dotenv"

dotenv.config()

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`ERROR: ${name} no está configurada en el .env`)
    process.exit(1)
  }
  return value
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

function optionalInt(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? fallback : parsed
}

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("CLIENT_ID"),
  },
  youtube: {
    cookieDir: optional("COOKIE_DIR", "data/cookies"),
    browserProfile: optional("BROWSER_PROFILE", "data/browser-profile"),
    cookiesEnv: process.env.YOUTUBE_COOKIES ?? null,
    cookieRefreshIntervalMs: optionalInt("COOKIE_REFRESH_INTERVAL_MS", 12 * 60 * 60 * 1000),
  },
  services: {
    cookieRefresherUrl: optional("COOKIE_REFRESHER_URL", ""),
  },
  admin: {
    token: process.env.ADMIN_TOKEN ?? "",
  },
} as const
