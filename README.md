# Chamibot — Discord Music Bot

Bot de música para Discord con soporte de URLs de YouTube y búsqueda por texto.

## Comandos

| Comando | Descripción |
|---|---|
| `/p <query>` | Reproduce o añade a la cola (URL o texto) |
| `/s` | Salta al siguiente tema |
| `/q` | Muestra la cola actual |
| `/pa` | Pausa la reproducción |
| `/r` | Reanuda la reproducción |
| `/st` | Detiene y limpia la cola |
| `/ap` | Activa/desactiva el autoplay |

## Stack

- **Runtime:** Node.js 22 + TypeScript
- **Discord API:** discord.js v14
- **Voz:** @discordjs/voice
- **Streaming:** yt-dlp (via youtube-dl-exec)
- **Búsqueda:** play-dl
- **Audio:** FFmpeg

## Desarrollo local

```bash
npm install
cp .env.example .env   # Completar DISCORD_TOKEN y CLIENT_ID
npm run register       # Registrar comandos slash (una vez)
npm run dev            # Iniciar el bot
```

## Deploy con Docker

```bash
docker compose up -d --build
docker compose run --rm bot npm run register   # Registrar comandos
docker compose logs -f                         # Ver logs
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DISCORD_TOKEN` | Token del bot (Discord Developer Portal) |
| `CLIENT_ID` | Application ID del bot |

## Requisitos del bot en Discord

- Intent: `Guild Voice States` activado
- Permisos OAuth2: `bot` + `applications.commands`
- Permisos en servidor: `Send Messages`, `Connect`, `Speak`, `Use Slash Commands`
