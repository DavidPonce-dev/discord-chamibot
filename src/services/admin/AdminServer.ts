import http from "http"
import httpProxy from "http-proxy"
import { logger } from "@/utils/logger"
import { getRefresherInstance, validateCookies, refreshCookies, extractCookies, setScheduler, initBrowser, closeBrowser, isBrowserActive, forceResetProfile } from "@/services/cookie/CookieManager"
import { CookieScheduler } from "@/services/cookie/CookieScheduler"
import { config } from "@/config"

let adminServer: http.Server | null = null
let isSettingUp = false
let vncProxy: httpProxy | null = null
let vncActive = false
let scheduler: CookieScheduler | null = null

export function setSchedulerInstance(s: CookieScheduler | null) {
  scheduler = s
}

export function setVncActive(active: boolean) {
  vncActive = active
}

function isValidToken(req: http.IncomingMessage): boolean {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const token = url.searchParams.get("token")
  return config.admin.token !== "" && token === config.admin.token
}

const ACCESS_DENIED_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Access Denied</title><style>body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center}h1{font-size:2rem;margin-bottom:.5rem;color:#f25757}p{color:#888}</style></head><body><div class="container"><h1>403 \u2014 Access Denied</h1><p>Valid authentication required.</p></div></body></html>`

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
.btn.success{background:#2d7d46}
.btn.success:hover{background:#236b3a}
.btn.warning{background:#d4a017}
.btn.warning:hover{background:#b8890f}
pre{background:#111;padding:1rem;border-radius:6px;overflow-x:auto;font-size:.85rem;margin-top:.5rem}
.status{display:inline-block;padding:.2rem .6rem;border-radius:4px;font-size:.8rem;font-weight:600}
.status.ok{background:#2d7d46;color:#57f287}
.status.warn{background:#7d6b2d;color:#f2a557}
.status.err{background:#7d2d2d;color:#f25757}
#vnc-frame{width:100%;height:500px;border:1px solid #333;border-radius:6px;display:none}
.indicator{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
.indicator.on{background:#57f287;box-shadow:0 0 6px #57f287}
.indicator.off{background:#f25757}
.flag-row{display:flex;align-items:center;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid #222}
.flag-row:last-child{border-bottom:none}
.flag-label{color:#aaa;font-size:.85rem}
.flag-value{font-weight:600;font-size:.85rem}
.flag-badge{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:700;text-transform:uppercase}
.flag-badge.yes{background:#2d7d46;color:#57f287}
.flag-badge.no{background:#7d2d2d;color:#f25757}
.flag-badge.maybe{background:#7d6b2d;color:#f2a557}
</style>
</head>
<body>
<h1>Charmin Charmeleon — Admin</h1>
<p style="color:#888">Cookie management dashboard</p>

<div class="card">
<h2>Cookie Status</h2>
<div id="cookie-flags">Loading...</div>
</div>

<div class="card">
<h2>System Status</h2>
<div id="system-status">Loading...</div>
</div>

<div class="card">
<h2>Browser Control</h2>
<div id="browser-status" style="margin-bottom:1rem;color:#888">Unknown</div>
<button class="btn success" onclick="startBrowser()">Start Browser</button>
<button class="btn warning" onclick="closeBrowserAction()">Close & Extract Cookies</button>
<button class="btn danger" onclick="forceResetProfile()">Force Reset Profile</button>
</div>

<div class="card">
<h2>VNC Login Session</h2>
<div id="vnc-status" style="margin-bottom:1rem;color:#888">No active session</div>
<button class="btn" onclick="startSetup()">Start VNC Login</button>
<button class="btn success" onclick="extractCookies()">Extract Cookies</button>
<button class="btn danger" onclick="stopSetup()">Stop VNC</button>
<iframe id="vnc-frame"></iframe>
</div>

<div class="card">
<h2>Cookie Actions</h2>
<button class="btn" onclick="refreshCookies()">Refresh Cookies (Headless)</button>
</div>

<div class="card">
<h2>Log</h2>
<pre id="log">Ready.</pre>
</div>

<script>
const TOKEN = new URLSearchParams(window.location.search).get('token') || '';
if (!TOKEN) {
  document.body.innerHTML = '<div style="text-align:center;padding:4rem"><h1 style="color:#f25757">403 \u2014 Access Denied</h1><p style="color:#888">Valid authentication required.</p></div>';
  throw new Error('No token');
}
const API = '/api?token=' + TOKEN;
function log(msg){const l=document.getElementById('log');l.textContent+=msg+'\\n';l.scrollTop=l.scrollHeight}
function badge(val){return '<span class="flag-badge '+(val?'yes':'no')+'">'+(val?'YES':'NO')+'</span>'}
function updateCookieFlags(d){
  const el = document.getElementById('cookie-flags');
  const ageStr = d.ageHours != null ? d.ageHours+'h ago' : 'never';
  const validClass = d.cookiesValid ? 'ok' : 'err';
  const validText = d.cookiesValid ? 'VALID' : 'INVALID';
  el.innerHTML =
    '<div class="flag-row"><span class="flag-label">Overall</span><span class="status '+validText.toLowerCase()+'">'+validText+'</span></div>'+
    '<div class="flag-row"><span class="flag-label">Count</span><span class="flag-value">'+d.cookieCount+' cookies</span></div>'+
    '<div class="flag-row"><span class="flag-label">Has PSID</span>'+badge(d.hasPSID)+'</div>'+
    '<div class="flag-row"><span class="flag-label">Has SID</span>'+badge(d.hasSID)+'</div>'+
    '<div class="flag-row"><span class="flag-label">Last Modified</span><span class="flag-value">'+(d.lastModified||'never')+'</span></div>'+
    '<div class="flag-row"><span class="flag-label">Age</span><span class="flag-value">'+ageStr+'</span></div>';
}
function updateIndicator(id, active, label){
  const el = document.getElementById(id);
  el.innerHTML = '<span class="indicator '+(active?'on':'off')+'"></span>' + (active ? label+' \u2014 Active' : label+' \u2014 Inactive');
}
async function checkStatus(){
  try{
    const r=await fetch(API+'/status');
    const d=await r.json();
    updateCookieFlags(d);
    updateIndicator('system-status', d.cookiesValid, 'Cookies');
    updateIndicator('browser-status', d.browserActive, 'Browser');
    updateIndicator('vnc-status', d.vncActive, 'VNC');
    log('Status: cookies='+(d.cookiesValid?'valid':'invalid')+' count='+d.cookieCount+' browser='+(d.browserActive?'on':'off')+' vnc='+(d.vncActive?'on':'off'));
  }
  catch(e){log('Status check failed: '+e.message)}
}
async function startBrowser(){
  log('Starting headless browser...');
  try{
    const r=await fetch(API+'/browser/start',{method:'POST'});
    const d=await r.json();
    if(d.error){log('Error: '+d.error);return}
    log('Browser started');
    checkStatus();
  }
  catch(e){log('Start browser failed: '+e.message)}
}
async function closeBrowserAction(){
  log('Closing browser and extracting cookies...');
  try{
    const r=await fetch(API+'/browser/close',{method:'POST'});
    const d=await r.json();
    if(d.error){log('Error: '+d.error);return}
    log('Browser closed. Result: '+JSON.stringify(d));
    checkStatus();
  }
  catch(e){log('Close browser failed: '+e.message)}
}
async function forceResetProfile(){
  if(!confirm('This will delete all browser data and require re-login. Continue?'))return;
  log('Force resetting browser profile...');
  try{
    const r=await fetch(API+'/profile/reset',{method:'POST'});
    const d=await r.json();
    if(d.error){log('Error: '+d.error);return}
    log('Profile reset \u2014 use VNC login to re-authenticate');
    checkStatus();
  }
  catch(e){log('Force reset failed: '+e.message)}
}
async function refreshCookies(){
  log('Refreshing cookies...');
  try{
    const r=await fetch(API+'/cookies/refresh',{method:'POST'});
    const d=await r.json();
    log('Result: '+JSON.stringify(d));
    checkStatus();
  }
  catch(e){log('Refresh failed: '+e.message)}
}
async function extractCookies(){
  log('Extracting cookies from open browser...');
  try{
    const r=await fetch(API+'/cookies/extract',{method:'POST'});
    const d=await r.json();
    log('Result: '+JSON.stringify(d));
    checkStatus();
  }
  catch(e){log('Extract failed: '+e.message)}
}
async function startSetup(){
  log('Starting VNC login...');
  try{
    const r=await fetch(API+'/cookies/setup',{method:'POST'});
    const d=await r.json();
    if(d.error){log('Error: '+d.error);return}
    document.getElementById('vnc-frame').src = '/vnc/vnc.html?autoconnect=true&path=/vnc/websockify&token='+TOKEN;
    document.getElementById('vnc-frame').style.display='block';
    log('VNC started \u2014 login in the frame below, then use Extract Cookies button');
    checkStatus();
  }
  catch(e){log('Setup failed: '+e.message)}
}
async function stopSetup(){
  log('Stopping VNC...');
  try{
    await fetch(API+'/cookies/setup/stop',{method:'POST'});
    document.getElementById('vnc-frame').style.display='none';
    document.getElementById('vnc-frame').src = '';
    log('VNC stopped');
    checkStatus();
  }
  catch(e){log('Stop failed: '+e.message)}
}
checkStatus();
setInterval(checkStatus, 30000);
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
      // /health is public for Docker/Coolify health checks
      if (path === "/health" && method === "GET") {
        const validation = validateCookies()
        const now = Date.now()
        const cookieAgeMs = validation.lastModified ? now - validation.lastModified.getTime() : null
        const cookieAgeHours = cookieAgeMs ? Math.round(cookieAgeMs / (1000 * 60 * 60)) : null

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          status: "ok",
          service: "charmin-charmeleon",
          cookies: {
            valid: validation.isValid,
            count: validation.cookieCount,
            hasPSID: validation.hasPSID,
            hasSID: validation.hasSID,
            lastModified: validation.lastModified?.toISOString() ?? null,
            ageHours: cookieAgeHours,
          },
          browser: {
            active: isBrowserActive(),
          },
          vnc: {
            active: vncActive,
          },
        }))
        return
      }

      // All other routes require valid token
      if (!isValidToken(req)) {
        res.writeHead(403, { "Content-Type": "text/html" })
        res.end(ACCESS_DENIED_HTML)
        return
      }

      if (path === "/" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(ADMIN_PAGE)
        return
      }

      if (path === "/api/status" && method === "GET") {
        const validation = validateCookies()
        const now = Date.now()
        const cookieAgeMs = validation.lastModified ? now - validation.lastModified.getTime() : null
        const cookieAgeHours = cookieAgeMs ? Math.round(cookieAgeMs / (1000 * 60 * 60)) : null

        res.writeHead(200)
        res.end(JSON.stringify({
          cookiesValid: validation.isValid,
          cookieCount: validation.cookieCount,
          hasPSID: validation.hasPSID,
          hasSID: validation.hasSID,
          lastModified: validation.lastModified?.toISOString() ?? null,
          ageHours: cookieAgeHours,
          browserActive: isBrowserActive(),
          vncActive,
        }))
        return
      }

      if (path === "/api/browser/start" && method === "POST") {
        if (isBrowserActive()) {
          res.writeHead(409)
          res.end(JSON.stringify({ error: "Browser already running" }))
          return
        }
        try {
          await initBrowser()
          res.writeHead(200)
          res.end(JSON.stringify({ message: "Browser started" }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: msg }))
        }
        return
      }

      if (path === "/api/browser/close" && method === "POST") {
        if (!isBrowserActive()) {
          res.writeHead(400)
          res.end(JSON.stringify({ error: "No browser running" }))
          return
        }
        try {
          const result = await refreshCookies()
          await closeBrowser()
          res.writeHead(200)
          res.end(JSON.stringify({ message: "Browser closed", cookieRefresh: result }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: msg }))
        }
        return
      }

      if (path === "/api/profile/reset" && method === "POST") {
        try {
          await forceResetProfile()
          res.writeHead(200)
          res.end(JSON.stringify({ message: "Profile reset — use VNC login to re-authenticate" }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: msg }))
        }
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

        if (path === "/api/cookies/extract" && method === "POST") {
          const result = await extractCookies()
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
          req.url = req.url!.replace(/^\/vnc\//, "/")
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
      req.url = req.url.replace(/^\/vnc\//, "/")
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
