import type http from "http"
import { createHash, timingSafeEqual } from "crypto"

export const isValidToken = (req: http.IncomingMessage, adminToken: string): boolean => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const token = url.searchParams.get("token")
  if (adminToken === "" || token === null) return false
  // Compare digests so the check takes the same time whatever the guess (and its length) is
  const digest = (value: string): Buffer => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(token), digest(adminToken))
}

export const isAllowedOrigin = (req: http.IncomingMessage, allowedOrigins: readonly string[]): boolean => {
  if (allowedOrigins.length === 0) return true
  const origin = req.headers.origin
  if (!origin) return false
  return allowedOrigins.includes(origin)
}

export const json = (res: http.ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(data))
}

export const ACCESS_DENIED_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Access Denied</title><style>body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center}h1{font-size:2rem;margin-bottom:.5rem;color:#f25757}p{color:#888}</style></head><body><div class="container"><h1>403 — Access Denied</h1><p>Valid authentication required.</p></div></body></html>`
