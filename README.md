# 🎵 Charmin Charmeleon — Discord Music Bot

Bot de música para Discord que reproduce audio desde YouTube con una interfaz de reproductor interactiva que se actualiza en tiempo real. Cola, controles, modo radio y búsqueda inteligente con diferenciación de álbumes y playlists.

---

## ¿Qué es?

Un bot de música autocontenido para Discord que no depende de APIs externas de música. Usa **yt-dlp + FFmpeg** directamente para obtener y transmitir audio desde YouTube, con una interfaz de cola interactiva que vive en un solo mensaje editable.

---

## ¿Qué hace?

- **Reproduce desde YouTube** — URLs directas, playlists, o búsqueda por texto
- **Cola visual interactiva** — Un solo mensaje con botones para pausar, saltar, mezclar, limpiar, subir/bajar tracks
- **Modo Radio** — Autoplay inteligente que sugiere tracks similares basándose en historial de reproducción, rotando artistas para evitar repetición
- **Búsqueda inteligente** — Autocomplete que diferencia canciones (🎵), álbumes (💿) y playlists (📋) con iconos
- **Controles completos** — Loop (none/one/all), seek, shuffle, remove por posición
- **Reproductor resiliente** — Si borran el mensaje de la cola, lo recrea automáticamente
- **Multi-guild** — Cada servidor tiene su propia sesión, cola y preferencias independientes
- **Cookies de YouTube** — Sistema integrado de refresco automático con Playwright (sin servicio separado)

---

## ¿En qué se diferencia?

| | Charmin Charmeleon | Bots típicos (Groovy, Hydra, etc.) |
|---|---|---|
| **Interfaz** | Un solo mensaje editable con botones | Múltiples mensajes o sin UI |
| **Audio source** | yt-dlp directo (sin API key) | APIs externas o Lavalink |
| **Autoplay** | Basado en historial + rotación de artistas | Aleatorio o por seed |
| **Búsqueda** | Diferencia álbumes/playlists/canciones | Lista plana de resultados |
| **Resiliencia** | Recrea el mensaje si se borra | Se pierde la UI |
| **Dependencias** | Solo yt-dlp + FFmpeg | Lavalink, API keys, servidores externos |
| **Costo** | Zero — todo local | Requiere infraestructura externa |

---

## Requisitos

- **Node.js 22+** (para desarrollo local)
- **yt-dlp** — Instalado en el PATH
- **FFmpeg** — Instalado en el PATH
- **Deno** — Requerido por yt-dlp para extracción de YouTube (opcional en local, obligatorio en Docker)
- **Discord Bot Token** — Desde [Discord Developer Portal](https://discord.com/developers/applications)

---

## Instalación rápida

### Opción A: Docker (recomendado)

```bash
# 1. Clonar el repo
git clone <tu-repo>
cd "discord bot"

# 2. Configurar variables
cp .env.example .env
# Editar .env con tu DISCORD_TOKEN y CLIENT_ID

# 3. Construir e iniciar
docker compose up -d --build

# 4. Registrar comandos slash (primera vez)
docker compose run --rm bot npm run register
```

El `docker-compose.yml` incluye:
- **Bot** — Construido desde Dockerfile multi-stage con yt-dlp, FFmpeg, Deno y Playwright integrado

### Opción B: Local

```bash
# 1. Instalar dependencias del sistema
# macOS
brew install ffmpeg yt-dlp deno

# Ubuntu/Debian
sudo apt install ffmpeg curl unzip
curl -fsSL https://deno.land/install.sh | sh
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp

# 2. Instalar dependencias de Node
npm install

# 3. Configurar variables
cp .env.example .env
# Editar .env con tu DISCORD_TOKEN y CLIENT_ID

# 4. Registrar comandos slash
npm run register

# 5. Iniciar
npm run dev
```

---

## Configuración de cookies de YouTube

El bot usa cookies de YouTube para evitar bloqueos en servidores cloud y acceder a contenido restringido.

### Sistema integrado con Playwright

A diferencia de versiones anteriores que usaban un servicio separado, ahora Playwright está **integrado directamente en el bot**:

- **Auto-refresh programado** — Cada 12 horas (configurable) refresca cookies automáticamente
- **Refresh on-demand** — Si detecta error de cookies (403, sign-in required), refresca inmediatamente
- **Perfil persistente** — Chromium guarda la sesión en `data/browser-profile/`
- **Un solo contenedor** — No más servicio `cookie-refresher` separado

### Login inicial (primera vez)

1. Iniciá el bot con `docker compose up -d --build`
2. Iniciá el login interactivo:

```bash
# Opción A: Usando curl
curl -X POST http://localhost:3002/cookies/setup

# Opción B: Usando el navegador (VNC)
http://localhost:6080/vnc.html?autoconnect=true
```

3. Navegá a `youtube.com` e iniciá sesión con tu cuenta de Google
4. Cerrá el navegador — las cookies se guardan automáticamente
5. El scheduler se activa automáticamente

### Admin Server

El bot incluye un servidor HTTP de administración en el puerto `3002`:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/cookies/status` | GET | Estado actual de las cookies |
| `/cookies/refresh` | POST | Refrescar cookies manualmente |
| `/cookies/setup` | POST | Iniciar login interactivo (VNC) |

Ejemplos:

```bash
# Ver estado de cookies
curl http://localhost:3002/cookies/status

# Refrescar cookies manualmente
curl -X POST http://localhost:3002/cookies/refresh

# Iniciar login interactivo
curl -X POST http://localhost:3002/cookies/setup
```

### Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `COOKIE_DIR` | `data/cookies` | Directorio para archivo de cookies |
| `BROWSER_PROFILE` | `data/browser-profile` | Directorio para perfil de Chromium |
| `COOKIE_REFRESH_INTERVAL_MS` | `43200000` (12h) | Intervalo de auto-refresh |

### Troubleshooting de cookies

| Problema | Causa | Solución |
|----------|-------|----------|
| `Sin YouTube cookies` | Primera ejecución | Hacer login inicial via VNC |
| `Error de cookies` | Sesión expirada | Esperar auto-refresh o refrescar manualmente |
| `Xvfb not available` | Falta dependencia | `apt-get install xvfb x11vnc novnc websockify` |

---

## Configuración de Discord

1. Ir a [Discord Developer Portal](https://discord.com/developers/applications)
2. Crear una aplicación y un bot
3. En **Bot** → habilitar `Presence Intent` y `Server Members Intent` (opcional), pero **obligatorio** `Voice States`
4. En **OAuth2 → URL Generator** → marcar `bot` + `applications.commands`
5. Dar permisos: `Send Messages`, `Connect`, `Speak`, `Use Slash Commands`, `Embed Links`
6. Invitar el bot al servidor con la URL generada

---

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DISCORD_TOKEN` | Sí | Token del bot (Discord Developer Portal) |
| `CLIENT_ID` | Sí | Application ID del bot |
| `YOUTUBE_COOKIES` | No | Contenido de cookies de YouTube en formato Netscape |
| `COOKIE_DIR` | No | Directorio para almacenar cookies (default: `data/cookies`) |
| `BROWSER_PROFILE` | No | Directorio para perfil de Chromium (default: `data/browser-profile`) |
| `COOKIE_REFRESH_INTERVAL_MS` | No | Intervalo de refresco automático en ms (default: `43200000` = 12h) |

---

## Comandos

| Comando | Descripción |
|---------|------------|
| `/play <query>` | Reproduce o añade a la cola (URL o texto) |
| `/skip` | Salta al siguiente tema |
| `/queue` | Muestra la cola actual |
| `/pause` | Pausa la reproducción |
| `/resume` | Reanuda la reproducción |
| `/stop` | Detiene y limpia la cola |
| `/autoplay` | Activa/desactiva el modo radio |
| `/loop` | Cicla modos: none → one → all |
| `/shuffle` | Mezcla aleatoriamente la cola |
| `/remove <posición>` | Elimina un track por posición |
| `/nowplaying` | Muestra el tema actual con controles |
| `/seek <segundos>` | Adelanta o retrocede en el tema |
| `/help` | Muestra la ayuda |

---

## Interfaz del reproductor

```
┌─────────────────────────────────────────────────┐
│  🎵 Charmin Charmeleon 🎵                         │
│  🎵 usuario agregó una canción — Tema X          │
│  Reproduciendo : Nombre del tema                 │
│  ▰▰▰▰▰▰▱▱▱▱ 1:23 / 3:45                         │
├─────────────────────────────────────────────────┤
│  [🗑] [⬆] [⬇] 1. Tema uno (3:45)               │
│  [🗑] [⬆] [⬇] 2. Tema dos (4:20)               │
│             [◀] [1/3] [▶]                        │
│  [⏸ Pausar] [⏭ Siguiente] [🔀 Mezclar]          │
│  [🗑 Limpiar] [💿 Radio: ON]                     │
└─────────────────────────────────────────────────┘
```

### Funcionalidades de la UI

| Característica | Descripción |
|---------------|-------------|
| **Cola visual** | Lista paginada con hasta 3 tracks por página |
| **Controles por track** | Botones individuales 🗑 ⬆ ⬇ para eliminar, subir o bajar |
| **Paginación** | ◀ / ▶ con indicador de página actual |
| **Playback en vivo** | Pausar, saltar, mezclar, limpiar desde el mismo mensaje |
| **Modo Radio** | 💿 Agrega automáticamente tracks similares |
| **Actualización en tiempo real** | Se actualiza cada 3 segundos con la posición actual |
| **Auto-recuperación** | Si borran el mensaje, lo recrea automáticamente |

---

## Búsqueda inteligente

Al usar `/play` con autocompletado, los resultados se organizan con iconos:

- **🎵 Canciones** — Videos individuales (hasta 4)
- **💿 Álbumes** — 2-25 tracks o keywords como "album", "full album", "EP", "remastered" (hasta 4)
- **📋 Playlists** — Más de 25 tracks o keywords como "mix", "best of", "chill", "lofi", "hits" (hasta 2)

Si no hay suficientes álbumes o playlists, se rellena con más canciones para siempre mostrar hasta 10 resultados.

---

## Modo Radio (Autoplay)

Cuando se activa con `/autoplay` o el botón 💿, el bot:

1. Analiza el track que acaba de terminar
2. Busca tracks relacionados usando el historial de reproducción
3. Rota artistas cada 3 tracks para evitar repetición excesiva
4. Excluye tracks ya reproducidos (historial de 20)
5. Mantiene un historial de artistas (10) para forzar variedad

---

## Arquitectura

```
  ┌──────────┐    ┌──────────┐    ┌────────────┐
  │  Usuario  │───▶│  Discord │───▶│   index.ts │
  │  /p query │    │  Gateway │    │  handler   │
  └──────────┘    └──────────┘    └─────┬──────┘
                                        │
                               ┌────────▼──────┐
                               │   play.ts      │
                               │  resolveQuery  │
                               └───────┬───────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
           ┌──────────┐       ┌──────────────┐    ┌────────────────┐
           │ play-dl  │       │ GuildManager │    │ ensureMessage  │
           │ search/  │       │  .get/create │    │ (interfaz cola)│
           │ metadata │       └──────┬───────┘    └────────────────┘
           └──────────┘              │
                                     ▼
                            ┌────────────────┐
                            │ TrackScheduler │
                            │  .add()        │
                            │  .processQueue │
                            └───────┬────────┘
                                    │
                           ┌────────▼────────┐
                           │  AudioService   │
                           │  yt-dlp --get-url│
                           │  FFmpeg → opus  │
                           │  → AudioPlayer  │
                           │  → VC subscribe │
                           └─────────────────┘
```

---

## Estructura del proyecto

```
src/
├── core/
│   └── types.ts              # Tipos compartidos (Track, LoopMode)
├── commands/
│   ├── music/
│   │   ├── play.ts           # /play — buscar y reproducir
│   │   ├── np.ts             # /nowplaying — now playing
│   │   └── seek.ts           # /seek — adelantar/retroceder
│   ├── queue/
│   │   ├── queue.ts          # /queue — interfaz del reproductor
│   │   └── queue-control.ts  # /shuffle, /remove, /loop
│   ├── playback/
│   │   └── playback.ts       # /pause, /resume, /skip, /stop
│   └── general/
│       ├── help.ts           # /help — ayuda
│       └── autoplay.ts       # /autoplay — toggle autoplay
├── services/
│   ├── audio/
│   │   ├── AudioService.ts   # yt-dlp + FFmpeg streaming
│   │   └── PipedService.ts   # Alternative audio source
│   ├── scheduler/
│   │   └── TrackScheduler.ts # Cola, autoplay, loop, playback
│   ├── guild/
│   │   └── GuildManager.ts   # Sesiones por servidor
│   └── cookie/
│       ├── CookieManager.ts      # Setup y estado de cookies
│       ├── CookieRefresherService.ts # Playwright refresh
│       ├── CookieScheduler.ts    # Auto-refresh programado
│       └── types.ts              # Tipos de cookies
├── handlers/
│   └── ButtonHandler.ts      # Manejo de botones interactivos
├── radio/
│   ├── YouTubeRecommender.ts # Recomendaciones de tracks
│   └── RadioSearchService.ts # Búsqueda para autoplay
├── ui/
│   ├── embeds/
│   │   ├── QueueEmbed.ts     # Embed de la cola
│   │   ├── NowPlayingEmbed.ts# Embed de now playing
│   │   └── HelpEmbed.ts      # Embed de ayuda
│   └── components/
│       └── QueueComponents.ts# Botones de la cola
├── utils/
│   ├── ytdlp.ts              # Spawn yt-dlp con cookies
│   ├── search.ts             # resolveQuery + autocomplete
│   ├── messages.ts           # Helpers de mensajes temporales
│   ├── guards.ts             # Validación de sesión
│   ├── format.ts             # Formato de tiempo y progress bar
│   ├── error.ts              # Helper de mensajes de error
│   ├── cookies.ts            # Re-exports de cookie/
│   ├── cookie-setup.ts       # Re-exports de cookie/
│   ├── cookieRefresher.ts    # Re-exports de cookie/
│   └── logger.ts             # Logger estructurado
├── constants.ts              # Constantes globales
├── index.ts                  # Entry point, client, scheduler
└── register.ts               # Script para registrar comandos slash
```

---

## Scripts disponibles

```bash
npm run dev        # Desarrollo con hot reload (tsx)
npm run build      # Compilar TypeScript a dist/
npm run start      # Producción (node dist/index.js)
npm run register   # Registrar comandos slash en Discord
npm test           # Ejecutar tests
npm run test:watch # Tests en modo watch
```

---

## Troubleshooting

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| `No se puede conectar` | Token inválido | Verificar `DISCORD_TOKEN` en `.env` |
| `Comandos no aparecen` | Slash commands no registrados | Ejecutar `npm run register` |
| `No hay audio` | Bot no tiene permisos de voz | Verificar permisos `Connect` y `Speak` |
| `Error al reproducir` | URL inválida o video restringido | Probar con otra URL o búsqueda por texto |
| `yt-dlp falla` | Versión desactualizada | Ejecutar `yt-dlp -U` o reconstruir Docker |
| `Error de cookies` | Sesión de YouTube expirada | Esperar auto-refresh (12h) o refrescar manualmente |
| `El reproductor desaparece` | Mensaje borrado | Se recrea automáticamente en el siguiente tick (3s) |

---

## Licencia

Privado — uso personal.
