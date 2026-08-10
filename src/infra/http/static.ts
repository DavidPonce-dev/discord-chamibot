import fs from "fs"
import path from "path"
import type http from "http"

const NOVNC_DIR = "/usr/share/novnc"

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".oga": "audio/ogg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
}

export const serveNovncStatic = (req: http.IncomingMessage, res: http.ServerResponse): boolean => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  let filePath = url.pathname.replace(/^\/vnc/, "")
  if (filePath === "/" || filePath === "") filePath = "/vnc.html"
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "")
  const fullPath = path.join(NOVNC_DIR, filePath)

  if (!fullPath.startsWith(NOVNC_DIR)) {
    res.writeHead(403)
    res.end("Forbidden")
    return true
  }

  if (!fs.existsSync(fullPath)) {
    res.writeHead(404)
    res.end("Not found")
    return true
  }

  const ext = path.extname(filePath)
  const contentType = MIME_TYPES[ext] || "application/octet-stream"
  const content = fs.readFileSync(fullPath)
  res.writeHead(200, { "Content-Type": contentType })
  res.end(content)
  return true
}
