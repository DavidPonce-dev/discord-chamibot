# Chamibot — Discord Music Bot

Bot de música para Discord con soporte de URLs de YouTube y búsqueda por texto.
Reproduce audio en canales de voz con cola de reproducción y autoplay.

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
| `/h` | Muestra la ayuda |

## Stack

- **Runtime:** Node.js 22 + TypeScript
- **Discord API:** discord.js v14
- **Voz:** @discordjs/voice
- **Streaming:** yt-dlp (via youtube-dl-exec)
- **Búsqueda:** play-dl
- **Audio:** FFmpeg (opcional, para conversión)

## Estructura del proyecto

```
src/
├── commands/       # Handlers de comandos slash
│   ├── play.ts     #   /p — buscar y reproducir
│   ├── skip.ts     #   /s — saltar track
│   ├── queue.ts    #   /q — mostrar cola
│   ├── pause.ts    #   /pa — pausar
│   ├── resume.ts   #   /r — reanudar
│   ├── stop.ts     #   /st — detener y limpiar
│   ├── autoplay.ts #   /ap — toggle autoplay
│   └── help.ts     #   /h — ayuda
├── music/
│   ├── MusicQueue.ts   # Cola, reproducción, eventos del player
│   ├── MusicManager.ts # Gestión de colas por servidor
│   └── Track.ts        # Interfaz de track
├── utils/
│   └── search.ts       # Búsqueda y sanitización de URLs
├── index.ts        # Entry point, client, registro de comandos
└── register.ts     # Script para registrar comandos slash
```

## Arquitectura

```
Usuario escribe /p <query>
  → interactionCreate (index.ts) captura el comando
  → play.ts ejecuta la búsqueda (play-dl) o sanitiza la URL
  → MusicManager.create() o .get() obtiene la cola del servidor
  → MusicQueue.add() encola y arranca processQueue()
  → yt-dlp descarga el audio y lo envía por stdout
  → @discordjs/voice demodula con demuxProbe y envía al canal de voz
  → Al terminar (Idle), processQueue() pasa al siguiente track
```

## Manejo de errores

El bot captura errores en múltiples capas:

- **Global:** `unhandledRejection` y `uncaughtException` evitan que el proceso muera
- **Cliente Discord:** listener `client.on("error")` para errores de WebSocket
- **Comandos:** cada handler está envuelto en try-catch, responde al usuario sin crashear
- **Reproducción:** errores de yt-dlp, demuxProbe o el AudioPlayer se capturan y la cola continúa
- **Logs:** mensajes cortos y legibles, sin stack traces

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
3. En **Bot** → habilitar `Message Content Intent` y `Voice States`
4. En **OAuth2 → URL Generator** → marcar `bot` + `applications.commands`
5. Dar permisos: `Send Messages`, `Connect`, `Speak`, `Use Slash Commands`
6. Invitar el bot al servidor con la URL generada

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

## Variables de entorno

| Variable | Descripción |
|----------|------------|
| `DISCORD_TOKEN` | Token del bot (Discord Developer Portal) |
| `CLIENT_ID` | Application ID del bot |

## Troubleshooting

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| `No se puede conectar` | Token inválido | Verificar `DISCORD_TOKEN` en `.env` |
| `Comandos no aparecen` | Slash commands no registrados | Ejecutar `npm run register` |
| `No hay audio` | Bot no tiene permisos de voz | Verificar permisos `Connect` y `Speak` |
| `Error al reproducir` | URL inválida o video restringido | Probar con otra URL o búsqueda por texto |
| `yt-dlp falla` | Versión desactualizada | `npx youtube-dl-exec@latest update` |
