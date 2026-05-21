# 🎵 Charmin Charmeleon — Discord Music Bot

```
  ___ _               _ _           _
 / __\ |__   ___  ___| (_) ___ __ _| |_
/ /  | '_ \ / _ \/ __| | |/ __/ _` | __|
\ \__| | | |  __/ (__| | | (_| (_| | |_
 \___/_| |_|\___|\___|_|_|\___\__,_|\__|
```

Bot de música para Discord con interfaz de reproductor interactiva.
Reproduce audio desde YouTube (URLs o búsqueda por texto) con cola de reproducción, controles en tiempo real y modo radio.

---

## 🎛️ Interfaz del Reproductor

```
┌─────────────────────────────────────────────────┐
│  🎵 Charmin Charmeleon 🎵                         │
│  Reproduciendo : Nombre del tema                │
├─────────────────────────────────────────────────┤
│  [🗑] [⬆] [⬇] 1. Tema uno (3:45)               │
│  [🗑] [⬆] [⬇] 2. Tema dos (4:20)               │
│  [🗑] [⬆] [⬇] 3. Tema tres (5:10)               │
│             [◀] [1/3] [▶]                        │
│  [⏸ Pausar] [⏭ Siguiente] [🔀 Mezclar]          │
│  [🗑 Limpiar] [💿 Radio: ON]                     │
└─────────────────────────────────────────────────┘
```

> 🖼️ *Próximamente: capturas de pantalla reales del reproductor en acción*

### Funcionalidades

| Característica | Descripción |
|---------------|-------------|
| **Cola visual** | Lista paginada con hasta 3 tracks por página |
| **Controles por track** | Botones individuales 🗑 ⬆ ⬇ para eliminar, subir o bajar cada tema |
| **Paginación** | ◀ / ▶ con indicador de página actual |
| **Playback en vivo** | Pausar, saltar, mezclar, limpiar cola desde el mismo mensaje |
| **Modo Radio** | 💿 Activable desde el reproductor: agrega automáticamente tracks similares |
| **Loop modes** | `/loop` — none → one → all (sin necesidad de botón) |
| **Actualización en tiempo real** | Interacción asincrónica: los botones responden sin bloquear |

### Cómo funciona

Cada servidor tiene **un único mensaje de cola** que se actualiza dinámicamente. Los botones usan `interaction.update()` para editar el mensaje in-place, sin spam de mensajes nuevos.

---

## Comandos

| Comando | Descripción |
|---------|------------|
| `/p <query>` | Reproduce o añade a la cola (URL o texto) |
| `/s` | Salta al siguiente tema |
| `/q` | Muestra la cola actual |
| `/pa` | Pausa la reproducción |
| `/r` | Reanuda la reproducción |
| `/st` | Detiene y limpia la cola |
| `/ap` | Activa/desactiva el autoplay |
| `/loop` | Cicla modos: none → one → all |
| `/shuffle` | Mezcla aleatoriamente la cola |
| `/remove` | Elimina un track por posición |
| `/np` | Muestra el tema actual |
| `/seek` | Adelanta o retrocede en el tema |
| `/h` | Muestra la ayuda |

---

## Stack

```
  ______  _____  _   _  _____
 |  _ \ \/ / _ \| \ | | ____|
 | | | \  / | | |  \| |  _|
 | |_| /  \ |_| | |\  | |___
 |____/_/\_\___/|_| \_|_____|
```

- **Runtime:** Node.js 22 + TypeScript
- **Discord API:** discord.js v14
- **Voz:** @discordjs/voice
- **Streaming:** yt-dlp (spawn directo) + FFmpeg (conversión a opus)
- **Búsqueda y metadata:** play-dl

---

## Estructura del proyecto

```
src/
├── core/
│   └── types.ts              # Tipos compartidos (Track, LoopMode)
├── commands/
│   ├── music/
│   │   ├── play.ts           # /p — buscar y reproducir
│   │   ├── np.ts             # /np — now playing
│   │   └── seek.ts           # /seek — adelantar/retroceder
│   ├── queue/
│   │   ├── queue.ts          # /q — interfaz del reproductor
│   │   └── queue-control.ts  # /shuffle, /remove, /loop
│   ├── playback/
│   │   └── playback.ts       # /pa, /r, /s, /st
│   └── general/
│       ├── help.ts           # /h — ayuda
│       └── autoplay.ts       # /ap — toggle autoplay
├── services/
│   ├── audio/
│   │   └── AudioService.ts   # yt-dlp + FFmpeg streaming
│   ├── scheduler/
│   │   └── TrackScheduler.ts # Cola, autoplay, loop, playback
│   └── guild/
│       └── GuildManager.ts   # Sesiones por servidor
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
│   ├── cookies.ts            # Estado global de cookies
│   ├── cookie-setup.ts       # Setup de cookies desde env/file
│   └── logger.ts             # Logger estructurado
├── constants.ts              # Constantes globales
├── index.ts                  # Entry point, client, registro de handlers
└── register.ts               # Script para registrar comandos slash
```

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

## Manejo de errores

```
  ⚠️  CAPTURA EN MÚLTIPLES CAPAS  ⚠️
  ┌─────────────────────────────────────────┐
  │  Global: unhandledRejection             │
  │         uncaughtException → exit(1)    │
  ├─────────────────────────────────────────┤
  │  Discord: client.on("error")            │
  ├─────────────────────────────────────────┤
  │  Comandos: try-catch + reply o editReply│
  ├─────────────────────────────────────────┤
  │  Reprod.: yt-dlp / FFmpeg / Idle        │
  ├─────────────────────────────────────────┤
  │  Botones: try-catch + editReply fallback│
  └─────────────────────────────────────────┘
```

El bot captura errores en múltiples capas:
- **Global:** `unhandledRejection` y `uncaughtException` evitan que el proceso muera
- **Cliente Discord:** listener `client.on("error")` para errores de WebSocket
- **Comandos:** cada handler está envuelto en try-catch, responde al usuario sin crashear
- **Reproducción:** errores de yt-dlp, FFmpeg o el AudioPlayer se capturan y la cola continúa
- **Botones:** si un interaction expiró, intenta `editReply` como fallback en vez de crashear
- **Logs:** mensajes cortos y legibles, sin stack traces

---

## Desarrollo local

```bash
# 1. Clonar e instalar
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Completar DISCORD_TOKEN y CLIENT_ID en .env

# 3. Registrar comandos slash (una vez al iniciar, o si cambian)
npm run register

# 4. Iniciar el bot
npm run dev
```

### Requisitos del bot en Discord

1. Ir a [Discord Developer Portal](https://discord.com/developers/applications)
2. Crear una aplicación y un bot
3. En **Bot** → habilitar `Voice States`
4. En **OAuth2 → URL Generator** → marcar `bot` + `applications.commands`
5. Dar permisos: `Send Messages`, `Connect`, `Speak`, `Use Slash Commands`
6. Invitar el bot al servidor con la URL generada

---

## Deploy con Docker

```bash
# Construir e iniciar
docker compose up -d --build

# Registrar comandos slash (primera vez)
docker compose run --rm bot npm run register

# Ver logs
docker compose logs -f

# Detener
docker compose down
```

El `docker-compose.yml` incluye:
- Build automático desde el Dockerfile
- Variables de entorno desde `.env`
- Política de reinicio `unless-stopped`
- Mount del volumen para logs

---

## Variables de entorno

| Variable | Descripción |
|----------|------------|
| `DISCORD_TOKEN` | Token del bot (Discord Developer Portal) |
| `CLIENT_ID` | Application ID del bot |
| `YOUTUBE_COOKIES` | (Opcional) Cookies de YouTube para servidores cloud |

---

## Troubleshooting

```
  ╔══════════════════════════════════════════╗
  ║   ¿ALGO NO ANDA?  REVISÁ ESTO PRIMERO   ║
  ╚══════════════════════════════════════════╝
```

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| `No se puede conectar` | Token inválido | Verificar `DISCORD_TOKEN` en `.env` |
| `Comandos no aparecen` | Slash commands no registrados | Ejecutar `npm run register` |
| `No hay audio` | Bot no tiene permisos de voz | Verificar permisos `Connect` y `Speak` |
| `Error al reproducir` | URL inválida o video restringido | Probar con otra URL o búsqueda por texto |
| `yt-dlp falla` | Versión desactualizada | Ejecutar `yt-dlp -U` o reconstruir Docker |
