import http from "http"
import httpProxy from "http-proxy"
import { logger } from "@/utils/logger"
import { getRefresherInstance, validateCookies, refreshCookies, setScheduler } from "@/services/cookie/CookieManager"
import { CookieScheduler } from "@/services/cookie/CookieScheduler"

let adminServer: http.Server | null = null
let isSettingUp = false
let vncProxy: httpProxy | null = null
let vncActive = false
let scheduler: CookieScheduler | null = null

export function setSchedulerInstance(s: CookieScheduler | null) {
  scheduler = s
}

const ADMIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Charmin Charmeleon — Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;min-height:100vh;padding:2rem}
h1{font-size:1.5rem;margin-bottom:.5rem;color:#fff}
h2{font-size:1.1rem;margin:1.5rem 0 .5rem;color:#aaa}
.card{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:1.5rem;margin-bottom:1rem}
.btn{background:#5865f2;color:#fff;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.9rem;margin-right:.5rem;margin-bottom:.5rem}
.btn:hover{background:#4752c4}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn.danger{background:#ed4245}
.btn.danger:hover{background:#c23b3e}
pre{background:#111;padding:1rem;border-radius:6px;overflow-x:auto;font-size:.85rem;margin-top:.5rem}
.status{display:inline-block;padding:.2rem .6rem;border-radius:4px;font-size:.8rem;font-weight:600}
.status.ok{background:#2d7d46;color:#57f287}
.status.warn{background:#7d6b2d;color:#f2a557}
.status.err{background:#7d2d2d;color:#f25757}
#vnc-frame{width:100%;height:500px;border:1px solid #333;border-radius:6px;display:none}
</style>
</head>
<body>
<h1>Charmin Charmeleon — Admin</h1>
<p style="color:#888">Cookie management dashboard</p>

<div class="card">
<h2>Cookie Status</h2>
<div id="status">Loading...</div>
<button class="btn" onclick="checkStatus()">Refresh Status</button>
</div>

<div class="card">
<h2>Actions</h2>
<button class="btn" onclick="refreshCookies()">Refresh Cookies</button>
<button class="btn" onclick="startSetup()">Start Login (VNC)</button>
<button class="btn danger" onclick="stopSetup()">Stop VNC</button>
</div>

<div class="card">
<h2>VNC Session</h2>
<p id="vnc-info" style="color:#888;font-size:.85rem">No active VNC session</p>
<iframe id="vnc-frame" src="/vnc/vnc.html?autoconnect=true"></iframe>
</div>

<div class="card">
<h2>Log</h2>
<pre id="log">Ready.</pre>
</div>

<script>
const API = '/api';
function log(msg){const l=document.getElementById('log');l.textContent+=msg+'\\n';l.scrollTop=l.scrollHeight}
async function checkStatus(){
  try{const r=await fetch(API+'/cookies/status');const d=await r.json();
  document.getElementById('status').innerHTML=
    '<span class="status '+(d.isValid?'ok':'err')+'">'+(d.isValid?'VALID':'INVALID')+'</span>'+
    ' — '+d.cookieCount+' cookies — Last: '+(d.lastModified||'never')}
  catch(e){log('Status check failed: '+e.message)}
}
async function refreshCookies(){
  log('Refreshing cookies...');
  try{const r=await fetch(API+'/cookies/refresh',{method:'POST'});const d=await r.json();
  log('Result: '+JSON.stringify(d))}
  catch(e){log('Refresh failed: '+e.message)}
}
async function startSetup(){
  log('Starting VNC login...');
  try{const r=await fetch(API+'/cookies/setup',{method:'POST'});const d=await r.json();
  if(d.error){log('Error: '+d.error);return}
  document.getElementById('vnc-frame').style.display='block';
  document.getElementById('vnc-info').textContent='VNC session active';
  log('VNC started')}
  catch(e){log('Setup failed: '+e.message)}
}
async function stopSetup(){
  log('Stopping VNC...');
  try{await fetch(API+'/cookies/setup/stop',{method:'POST'});
  document.getElementById('vnc-frame').style.display='none';
  document.getElementById('vnc-info').textContent='VNC stopped';
  log('VNC stopped')}
  catch(e){log('Stop failed: '+e.message)}
}
checkStatus();
</script>
</body>
</html>`

export function startAdminServer(port: number) {
  if (adminServer) {
    logger.warn("admin", "Admin server already running")
    return
  }

  vncProxy = httpProxy.createProxyServer()

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`)
    const path = url.pathname
    const method = req.method

    try {
      if (path === "/" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(ADMIN_PAGE)
        return
      }

      if (path === "/health" && method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ status: "ok", service: "charmin-charmeleon" }))
        return
      }

      if (path.startsWith("/api/")) {
        res.setHeader("Content-Type", "application/json")

        if (path === "/api/cookies/status" && method === "GET") {
          const validation = validateCookies()
          res.writeHead(200)
          res.end(JSON.stringify({
            ...validation,
            lastModified: validation.lastModified?.toISOString() ?? null,
          }))
          return
        }

        if (path === "/api/cookies/refresh" && method === "POST") {
          const result = await refreshCookies()
          res.writeHead(200)
          res.end(JSON.stringify(result))
          return
        }

        if (path === "/api/cookies/setup" && method === "POST") {
          if (isSettingUp) {
            res.writeHead(409)
            res.end(JSON.stringify({ error: "Setup already in progress" }))
            return
          }

          isSettingUp = true
          scheduler?.pause()
          try {
            const refresher = getRefresherInstance()
            const result = await refresher.setupForLogin()
            vncActive = true
            res.writeHead(200)
            res.end(JSON.stringify(result))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            scheduler?.resume()
            res.writeHead(500)
            res.end(JSON.stringify({ error: msg }))
          } finally {
            isSettingUp = false
          }
          return
        }

        if (path === "/api/cookies/setup/stop" && method === "POST") {
          if (vncActive) {
            vncActive = false
            scheduler?.resume()
            res.writeHead(200)
            res.end(JSON.stringify({ message: "VNC stopped" }))
          } else {
            res.writeHead(400)
            res.end(JSON.stringify({ error: "No active VNC session" }))
          }
          return
        }

        res.writeHead(404)
        res.end(JSON.stringify({ error: "Not found" }))
        return
      }

      if (path.startsWith("/vnc/")) {
        if (vncProxy && vncActive) {
          vncProxy.web(req, res, {
            target: "http://localhost:6080",
            ws: true,
          })
          return
        }
        res.writeHead(503, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "VNC not active. Start a login session first." }))
        return
      }

      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Not found" }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error("admin", "Request failed", { path, method, error: msg })
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: msg }))
    }
  })

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/vnc/") && vncProxy && vncActive) {
      vncProxy.ws(req, socket, head, {
        target: "http://localhost:6080",
      })
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    logger.info("admin", `Admin server started on port ${port}`)
  })

  server.on("error", (err) => {
    logger.error("admin", "Admin server error", { error: err.message })
  })

  adminServer = server
}

export function stopAdminServer(): Promise<void> {
  return new Promise((resolve) => {
    if (adminServer) {
      adminServer.close(() => {
        adminServer = null
        vncActive = false
        logger.info("admin", "Admin server stopped")
        resolve()
      })
    } else {
      resolve()
    }
  })
}
