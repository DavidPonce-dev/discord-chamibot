# Changelog

Todas las versiones notables de este proyecto.

---

## v1.6.0 (2026-10-20)

### Rendimiento
- **`/p` con una sola llamada a yt-dlp**: la búsqueda pide el formato de audio (`-f bestaudio`) y obtiene metadatos y URL de stream a la vez. Una caché compartida de URLs de audio (`audio-url-cache`) la reutiliza al reproducir, en `/sk` y en la precarga. Medido: `/p` con texto 5,6 s → 4,2 s, `/p` con URL 6,5 s → 3,0 s, `/sk` 3,2 s → ~0 s.
- **Precarga del siguiente tema** (de usuario o radio): elimina la pausa de ~3-4 s entre canciones.
- **Radio más rápida** (3,0-3,5 s → 1,2-1,6 s por recomendación): búsqueda de YouTube propia vía HTTP (~1 s) en lugar de lanzar yt-dlp (~2,5 s), con yt-dlp como respaldo; candidatos buscados en paralelo por lotes; las sugerencias de Groq solo se buscan en YouTube si Last.fm no encuentra nada; la precarga ya no bloquea `/ap` ni el reshuffle.
- **Chromium solo durante el refresco de cookies**: ya no queda abierto ni se relanza cada 5 minutos (~200-400 MB de RAM menos).
- **Autocompletado**: sugerencias instantáneas de YouTube; el respaldo usa la búsqueda propia, que entra en el límite de 3 s de Discord.

### Radio: recomendaciones coherentes
- **Parseo de títulos reescrito** (`parseTitle`): el título de YouTube se parseaba mal en la mayoría de los casos (`Artista - Canción ft. X`, `Artista - Canción | Álbum`, `… | Official Video`), Last.fm no encontraba la canción y la radio caía a Groq o a búsquedas genéricas que ignoraban el estilo.
- **`autocorrect` en Last.fm** y nuevo respaldo por **artistas similares de Last.fm** antes de Groq.
- Los candidatos ya escuchados se descartan antes de elegir, sin gastar intentos.
- La semilla de la radio usa el artista/canción identificados, no el título crudo.

### Cookies de YouTube
- **Renovación automática de la sesión**: un vigilante revisa cada 10 min si faltan SID/PSID y las renueva aunque nadie use el bot; si no puede (perfil sin sesión de Google), espera de forma creciente (hasta 3 h) y avisa en el log que hace falta login por VNC.
- El scheduler arranca siempre, aunque al iniciar no exista el archivo de cookies o sean inválidas.
- Un refresco con el perfil sin sesión ya no sobrescribe cookies válidas.
- **`resume()` no reanudaba el refresco** tras el login por VNC: corregido.
- El contenedor **ya no borra cookies ni el perfil del navegador al arrancar**: cada deploy cerraba la sesión de Google.
- Ruta de archivo de cookies unificada, refresco reactivo ante 403 de FFmpeg y reintento de la misma pista si el stream muere por 403.

### Interfaz
- **Cola legible**: cada tema se muestra como "Artista - Canción" (hasta 80 caracteres, antes 50 cortaba el nombre) y los de radio con 📻.
- **Campo "Siguiente"** en el embed: qué suena después, si es de la cola o de la radio, o si se está buscando recomendación.
- **Artista/canción en "Reproduciendo"**: usa los nombres limpios (Last.fm, metadatos de yt-dlp) y el canal de YouTube como pista para títulos sin artista o invertidos. "Pedido por" muestra "📻 Radio".
- **Miniatura**: si un tema no la trae, se deriva del id o la URL del video.
- Botón ⏭ deshabilitado sin siguiente tema; reshuffle de radio deshabilitado mientras busca, y el aviso ahora cae en la fila correcta.
- La barra de progreso refleja la posición tras `/sk` y no se desborda.
- `/ap` responde con defer: activar la radio superaba el límite de 3 s de Discord.

### Correcciones de reproducción
- **Reproductor y FFmpeg por servidor**: varios servidores ya pueden sonar a la vez sin interferirse.
- Listener de errores del reproductor: un error de stream ya no tumba el proceso.
- Saltar estando en pausa, un recurso de audio que falla o un `/sk` fallido ya no dejan la reproducción trabada.
- Las escrituras de sesión tras operaciones lentas (radio, precarga, autoplay) ya no pisan cambios concurrentes ni reviven sesiones detenidas.
- Resolución de `/p` más robusta: reintentos ante errores transitorios y respaldo con play-dl.

### Admin / Docker
- `ADMIN_PORT` y `VNC_PORT` configurables en docker compose; acepta la ruta de noVNC `//vnc/websockify`; log de diagnóstico del websocket VNC.
- Se registra en el log cuando Discord rechaza la edición del mensaje de la cola.
- Eliminado el botón "Start Browser" del panel (no hacía nada).

### Limpieza
- ~350 líneas de código sin uso eliminadas (funciones, constantes, miembros de puertos y parámetros); constantes de timeouts en lugar de literales duplicados.

---

## v1.5.4 (2026-08-10)

### Correcciones de radio
- **`radioBaseTitle` stale**: se resetea a `null` cuando comienza una pista pedida por el usuario, evitando que la radio siga recomendando el estilo anterior tras un cambio de usuario/manual.
- **Repetición de videos**: los IDs de las pistas ya reproducidas se excluyen de las recomendaciones (`excludeIds`), evitando el mismo video en bucle.

### Correcciones de UI
- **"Unknown interaction" en botones**: los botones ahora responden con `deferUpdate()` al inicio y editan el mensaje original con `editReply()`, eliminando el timeout de 3s (errores 10062) en acciones lentas como reshuffle.
- **Mensaje "La cola esta vacía"**: al terminar la reproducción (fin natural, `/stop`, etc.) ya no queda ningún mensaje de cola en el chat; el mensaje se elimina en todos los casos.

### Mejora de rendimiento
- **Pre-carga de audio en radio**: `prefetchRadioUrl` resuelve la URL de audio al encolar la pista, evitando el delay de yt-dlp (~2-5s) entre pistas de radio.

### Refactor
- Reestructuración del proyecto en capas: `src/domain`, `src/usecases`, `src/infra` y `src/shared`, con tests actualizados por capa.

---

## v1.5.3 (2026-07-13)

### Nuevas funcionalidades
- **Campo álbum**: agregado `album` al tipo `Track`. Se extrae automáticamente del JSON de yt-dlp (`data.album`) al resolver URLs de YouTube. El álbum se muestra en el embed de la cola si está disponible.

### Mejoras de UI
- **QueueEmbed reestructurado**: toda la info del track (canción, artista, álbum, barra de progreso) ahora va en **fields** del embed en vez de description. El layout es: 🎵 Canción → 🎤 Artista → 💿 Álbum (si existe) → progress bar → Pedido por / Duración / Transcurrido.

### Correcciones del sistema de cookies
- **Error logging**: `delegateToRefresher()` ahora loguea errores explícitamente en vez de tragarlos silenciosamente.
- **Doble lanzamiento de Chromium**: eliminado `checkChromiumAvailable()` redundante — se lanza directo al persistent context (ahorra un lanzamiento de Chromium en cada inicio).
- **Timeout en busy-wait**: el loop `isInitializing` ahora tiene timeout de 30s. Si el browser se traba inicializando, lanza error en vez de girar infinitamente.
- **initBrowser redundante**: eliminado el fire-and-forget de `initBrowser()` en bootstrap — `refreshCookies()` ya auto-inicializa el browser internamente.
- **FFmpeg sin refresh reactivo**: si FFmpeg falla por error de cookies durante el streaming, ahora refresca automáticamente las cookies para el siguiente track.

### Limpieza
- **Dead code eliminado**: `COOKIE_REFRESH_INTERVAL_MS` en `timeouts.ts` (nunca se importaba) y `refreshIntervalMs` en `CookieRefresherConfig` (nunca se usaba).

---

## v1.5.2 (2026-07-12)

### Correcciones
- **FFmpeg 403**: restaurado el Cookie header en FFmpeg. Las URLs de YouTube CDN requieren cookies para streaming, no solo para extracción de URL.
- **Botones de UI**: revertida la reestructuración de botones del commit anterior. `buildPlaybackRow` ahora tiene el orden original: pause, skip, shuffle, autoplay, stop. Eliminada `buildQueueControlRow`.

---

## v1.5.1 (2026-07-12)

### Optimización
- **AudioService**: eliminado parsing síncrono de cookies para FFmpeg. Las URLs de YouTube CDN ya vienen firmadas con tokens, los cookies solo son necesarios para la extracción de URL (manejado por `--cookies` en yt-dlp).
- **CookieRefresherService**: extraído método `extractAndWriteCookies()` compartido entre `refreshCookies()` y `extractCookies()`, eliminando ~30 líneas de código duplicado.
- **ytdlp.ts**: simplificado el chequeo de cookies en `buildYtDlpArgs()`, eliminando logging verboso y syscalls innecesarias (`existsSync` + `statSync`) en el hot path.
- **CookieManager**: unificadas las funciones `refreshCookies()` y `extractCookies()` con un helper `delegateToRefresher()`.
- **CookieScheduler**: extraído `setupIntervals()` para eliminar duplicación entre `start()` y `resume()`.

---

## v1.5.0 (2026-07-11)

### Mejoras de Radio
- **Recomendación inmediata**: al activar el botón de radio, ahora se pre-calcula el "Siguiente" tema inmediatamente. Antes había que esperar a que terminara el track actual.
- **Fallback YouTube**: si Last.fm y Groq no encuentran recomendaciones, se hace una búsqueda amplia en YouTube como último recurso. El bot **SIEMPRE** recomienda algo si hay resultados en YouTube.

---

## v1.4.7 (2026-06-19)

### Nuevos endpoints
- **POST /api/cookies/delete**: elimina solo el archivo de cookies (`youtube-cookies.txt`) sin matar Chrome ni borrar el perfil del navegador. Difiere de `/api/profile/reset` en que es no-destructivo para el perfil. Después de llamar, `/api/status` devuelve `cookiesValid: false`, `cookieCount: 0`.

---

## v1.4.6 (2026-06-15)

### Correcciones
- **Autoplay**: se limpia la cola de radio al desactivar el autoplay.

### Nuevas funcionalidades
- **Blacklist**: sistema de blacklist de servidores con botones en el admin panel para blacklistear y hacer que el bot salga de un servidor.

---

## v1.4.5 (2026-06-15)

### Correcciones
- **Health check**: movido el handler de `/health` antes de la validación `isAllowedOrigin()` para que Docker/Traefik/Coolify no bloqueen las probes de salud.

---

## v1.4.4 (2026-06-15)

### Correcciones
- **Health check**: movido el handler de `/health` antes de la validación `isAllowedOrigin()` para que Docker/Traefik/Coolify no bloqueen las probes de salud. El health check de `wget` no manda header `Origin`, lo que causaba un 403.

---

## v1.4.3 (2026-06-15)

### Mejoras
- **Admin server**: logging de debug en requests entrantes, bind explícito a 0.0.0.0, warns en 404s.
- **UI**: barra de progreso reducida un tercio (36 → 24), eliminado medio bloque (▌).
- **UI**: botón stop ahora usa ✖ en vez de ⏹.
- **Config**: eliminadas variables obsoletas `YOUTUBE_COOKIES` y `COOKIE_REFRESHER_URL`.
- **Error message**: actualizado mensaje de error para referir al admin panel.

---

## v1.4.2 (2026-06-15)

### Mejoras
- **Radio**: optimizada la búsqueda de recomendaciones para mantener el género musical, ordenando por match score de Last.fm y usando el contexto de historial de artistas + tags de género en Groq.
- **Parsing**: agregado soporte para brackets japoneses `「」` en la extracción de artista/título.
- **Variedad**: los candidatos de Last.fm ahora se mezclan dentro del top 10 de mayor coincidencia para evitar repetir siempre los mismos temas de la banda.

---

## v1.4.1 (2026-06-15)

### Correcciones
- **Espaciado**: se agrega un salto de línea entre el artista y la barra de progreso en el embed de cola para mejorar la legibilidad.

---

## v1.4.0 (2026-06-15)

### Mejoras
- **Last.fm**: se agrega `LASTFM_API_KEY` como variable de entorno explícita en `docker-compose.yml` para facilitar la configuración en entornos como Coolify.
- **Interfaz de cola**: se eliminan los mensajes de notificación ("agregó una canción") y la línea de "Radio activa" del embed. El nombre de la canción ahora se muestra en **bold italic** (`***`) y el artista en **bold** (`**`) para mayor legibilidad.
- **Botón de stop**: se reemplaza el botón 🗑 (limpiar cola) por ⏹ (detener reproducción), que llama a `scheduler.destroy()` para detener, limpiar la cola y desconectarse del canal de voz.

---

## v1.3.8 (2026-06-11)

### Correcciones
- **Validación de CORS en Coolify**: se corrige el manejo de `ADMIN_ALLOWED_ORIGINS` vacío, previniendo errores de CORS cuando la variable de entorno no está configurada.
- **Despliegue en Coolify**: ajustes menores para compatibilidad con el entorno de Coolify.

---

## v1.3.7 (2026-06-09)

### Seguridad
- **Eliminación de puerto 6080**: se elimina la exposición directa del puerto 6080 (noVNC). Todo el tráfico VNC fluye exclusivamente a través del admin server autenticado en el puerto 3002.
- **Contenedor no-root**: el contenedor Docker ahora se ejecuta como usuario no-root, mejorando la seguridad.
- **Validación de origen**: se refuerza la verificación de `Origin` en las rutas del admin server.

---

## v1.3.6 (2026-06-09)

### Correcciones
- **Assets estáticos de noVNC**: se elimina la validación de token para archivos estáticos (JS, CSS, imágenes) de noVNC, permitiendo que se carguen correctamente. El token solo se requiere para el HTML principal.

---

## v1.3.5 (2026-06-09)

### Mejoras
- **Logging de VNC**: se agrega logging detallado para depurar problemas de conexión y autenticación en el proxy VNC, facilitando el diagnóstico de fallos.

---

## v1.3.4 (2026-06-09)

### Correcciones
- **Proxy noVNC directo**: se cambia la estrategia de servir noVNC: en lugar de usar proxy inverso con reescritura de rutas, se sirven los archivos estáticos directamente desde el admin server. Esto elimina problemas de rutas relativas rotas y mejora la confiabilidad.

---

## v1.3.3 (2026-06-09)

### Correcciones
- **Instalación de Deno**: se instala Deno directamente desde los releases de GitHub en lugar de usar `curl+install.sh`, eliminando la dependencia de `curl` y mejorando la reproducibilidad del build.

---

## v1.3.2 (2026-06-09)

### Correcciones
- **Dependencias Docker**: se reemplaza `curl` por `wget` y se elimina `unzip` (dependencia no utilizada), reduciendo el tamaño de la imagen.
- **Token en WebSocket VNC**: se incluye el token de autenticación en la ruta del WebSocket de VNC para validar las conexiones de actualización.
- **Navegación directa**: se permite la navegación directa a la página de administración sin encabezado `Origin`, facilitando el acceso desde marcadores o URLs directas.

---

## v1.3.1 (2026-06-09)

### Seguridad
- **Restricción de origen + token**: se agrega verificación del encabezado `Origin` y validación de token en todas las rutas del servidor VNC y admin server.

---

## v1.3.0 (2026-06-09)

### Mejoras
- **Modo deploy**: se agrega un mecanismo de `deploy mode` que impide la ejecución de comandos durante actualizaciones del servicio, mostrando un mensaje "Actualizando servicio" al usuario.
- **API de gremios**: nuevo endpoint `/api/guilds` en el admin server que expone información de los servidores activos (canal de voz, track actual, tamaño de cola, estado de autoplay).
- **Nueva interfaz de administración**: panel de administración rediseñado con tabla de servidores activos, indicadores de estado en tiempo real y diseño responsive.

### Correcciones
- **Corrupción de estado de reproducción**: se corrige un bug donde el estado de reproducción se corrompía al cambiar de track rápidamente, causando que el scheduler quedara en un estado inconsistente.

---

## v1.2.1 (2026-06-07)

### Correcciones
- **Desconexión automática**: cuando la cola se vacía y el autoplay está desactivado, el bot ahora se desconecta automáticamente del canal de voz y limpia los mensajes de la interfaz.
- **Redundancia en comandos**: se eliminan llamadas redundantes a `processQueue` y `updateQueueForGuild` en los comandos de control (`/pause`, `/resume`, `/skip`, `/stop`, `/loop`, `/shuffle`, `/clear`), ya que el scheduler maneja estos estados internamente.
- **Centralización de guards**: se unifica la lógica de verificación de sesión activa en `requireSession()` y `requirePlaying()`, usadas por todos los comandos.

---

## v1.2.0 (2026-06-07)

### Mejoras
- **Unificación de renders**: se extrae la lógica de construcción de componentes visuales (embeds y botones) a funciones compartidas en `src/ui/`. Ahora `QueueComponents.ts`, `QueueEmbed.ts`, `NowPlayingEmbed.ts` y `HelpEmbed.ts` usan utilidades comunes (`createBaseEmbed`, `paginate`, `formatTime`, `buildProgressBar`).
- **Embed base**: se crea `BaseEmbed.ts` con un embed reutilizable que incluye el color y footer por defecto.
- **Helpers en guards**: `requireSession` y `requirePlaying` ahora son funciones reutilizables en `guards.ts`, eliminando la duplicación en los comandos.

---

## v1.1.3 (2026-06-07)

### Correcciones
- **Saltos de línea en logs**: se corrige la renderización de `\n` literal en los logs del panel de administración. Ahora los saltos de línea se muestran correctamente como nuevas líneas.

---

## v1.1.2 (2026-06-07)

### Correcciones
- **Bloqueos de Chromium**: se agrega limpieza de archivos de bloqueo (`SingletonLock`, `SingletonSocket`, `SingletonCookie`) en el perfil de Chromium antes de iniciar VNC, incluso después de un redeploy. Esto previene errores de "profile is locked" en Coolify.

---

## v1.1.1 (2026-06-07)

### Correcciones
- **Cookies expiradas**: se agrega renovación automática de cookies al iniciar el bot. Si las cookies de YouTube han expirado, se refrescan antes de intentar cualquier descarga.
- **Validación de conexión**: se verifica el estado de la conexión de voz antes de actualizar la interfaz de la cola. Si el bot se desconectó, se limpian los mensajes en lugar de intentar editarlos y lanzar errores.

---

## v1.1.0 (2026-06-06)

### Refactorización
- **Intervalo de refresco de cookies**: se crea `CookieRefresherService` con un intervalo programado que renueva las cookies periódicamente, evitando que expiren durante largas sesiones de reproducción.
- **Reestructuración de servicios**: se mueve la lógica de cookies a `services/cookie/`, separando `CookieManager` (navegador) de `CookieRefresherService` (programación).
- **Nuevo panel admin**: se implementa `AdminServer` con una página HTML completa que muestra el dashboard de administración con estado del bot, logs en tiempo real y controles de navegador.
- **Bootstrap centralizado**: se crea `bootstrap.ts` como punto de entrada único que inicializa todos los servicios (cookies, admin server, bot).

### Correcciones
- **Race condition en cola**: se reemplaza el sistema de cola FIFO para ediciones de mensajes con `last-edit-wins`, eliminando condiciones de carrera donde mensajes anteriores sobrescribían a los más recientes.
- **Limpieza al desconectar**: se corrige la limpieza de recursos cuando el bot se desconecta del canal de voz, asegurando que todos los intervals y mensajes se eliminen.

---

## v1.0.0 (2026-06-06)

### Funcionalidades principales
- **Reproducción de audio**: sistema completo de reproducción desde YouTube con cola, control de reproducción (pause, resume, skip, stop, seek) y modos de loop (one/all).
- **Autoplay v2**: sistema de radio automática con detección de género, búsqueda multi-consulta (Last.fm + YouTube) y filtrado por duración. Incluye rotación de artistas para evitar bucles del mismo artista.
- **Barra de progreso**: indicador visual de progreso en tiempo real dentro del embed de la cola, actualizado cada 3 segundos.
- **Búsqueda con autocompletado**: sugerencias de búsqueda con categorías (canciones, álbumes, playlists, canales) y emojis distintivos.
- **Sistema de cola completo**: agregar tracks, agregar al frente, remover, reordenar, mezclar, y paginación del embed.

### Integración con YouTube
- **Extracción de audio**: múltiples estrategias de formato para yt-dlp con fallback automático (web, tv_embedded, android).
- **Cookies de YouTube**: sistema basado en Playwright para extraer cookies del navegador y mantener la sesión activa.
- **Resolución de búsquedas**: motor de búsqueda que soporta URLs directas y consultas por texto, con resolución de playlists.

### Panel de administración
- **Servidor admin unificado**: todas las funcionalidades de administración en un solo puerto (3002) con interfaz web desde `admin-page.html`.
- **Autenticación**: sistema de autenticación basado en token para proteger el panel y los endpoints de la API.
- **Dashboard en vivo**: panel con estado del bot, logs en tiempo real, controles del navegador Chromium e indicadores de validez de cookies.
- **Integración VNC**: servidor VNC integrado con noVNC para acceso remoto al navegador Chromium, con proxy autenticado y recovery automático.

### Infraestructura
- **Docker multi-etapa**: imagen Docker optimizada con multi-stage build, Deno para yt-dlp, Chromium para cookies, y FFmpeg para audio.
- **Coolify compatible**: despliegue listo para Coolify con variables de entorno configurables y volúmenes persistentes.
- **Logging estructurado**: sistema de logs con formato `[timestamp][LEVEL][service] mensaje` para facilitar el debugging.

### Calidad de código
- **Tests con Vitest**: suite de tests unitarios para scheduler, guards, format, embeds, botones, búsqueda y mensajes.
- **Arquitectura limpia**: separación en `commands/`, `services/`, `ui/`, `handlers/`, `utils/` siguiendo principios de Screaming Architecture.
- **Mensajes temporales**: los mensajes de "cola vacía" y errores se auto-eliminan después de 5 segundos.
