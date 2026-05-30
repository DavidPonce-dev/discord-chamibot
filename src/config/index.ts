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

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("CLIENT_ID"),
  },
  youtube: {
    cookieDir: optional("COOKIE_DIR", "data/cookies"),
    cookiesEnv: process.env.YOUTUBE_COOKIES ?? null,
  },
  services: {
    cookieRefresherUrl: optional("COOKIE_REFRESHER_URL", "http://cookie-refresher:3001"),
  },
} as const
