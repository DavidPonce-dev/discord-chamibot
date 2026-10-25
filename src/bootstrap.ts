import path from "path"

import type { Ports } from "./domain/ports"
import type { GuildSession } from "./domain/types"
import type { Client } from "discord.js"

import { createMusicUseCases } from "./usecases/music"
import { createQueueUseCases } from "./usecases/queue"
import { createRadioUseCases } from "./usecases/radio"
import { createAdminUseCases } from "./usecases/admin"
import { createCookieUseCases } from "./usecases/cookie"
import { createSearchUseCases } from "./usecases/search"

import { createYtDlpAudio } from "./infra/youtube/audio"
import { createYouTubeSearch } from "./infra/youtube/search"
import { createAudioUrlCache } from "./infra/youtube/audio-url-cache"
import { createLastFmAdapter } from "./infra/recommendation/lastfm"
import { createGroqAdapter } from "./infra/recommendation/groq"
import { createRadioService } from "./infra/recommendation/radio-service"
import { createPlaywrightBrowser } from "./infra/cookie/browser"
import { createFileCookieStore } from "./infra/cookie/store"
import { createJsonBlacklist } from "./infra/persistence/blacklist"
import { createDiscordVoice, createDiscordPlayer } from "./infra/discord/voice"
import { createDiscordGuildAdapter } from "./infra/discord/guilds"
import { createDiscordNotifier, createQueueMessageStore } from "./infra/discord/messages"
import { createAdminServer } from "./infra/http/admin-server"
import { createBot } from "./infra/discord/bot"
import { createQueueDisplay } from "./infra/ui/queue-display"

import { createLogger } from "./shared/logger"
import { config } from "./config"

import { setupProcessHandlers } from "./bootstrap/process-handlers"
import { initCookieSystem } from "./bootstrap/cookie-setup"

let botClient: Client | null = null
const getBotClient = (): Client | null => botClient

export async function bootstrap(): Promise<void> {
  const logger = createLogger()

  const cookieFilePath = path.join(config.youtube.cookieDir, "youtube-cookies.txt")
  const cookieStore = createFileCookieStore(config.youtube.cookieDir, "youtube-cookies.txt", logger)

  const browser = createPlaywrightBrowser({
    cookieDir: config.youtube.cookieDir,
    cookieFile: cookieFilePath,
    browserProfile: config.youtube.browserProfile,
  }, logger)

  const blacklist = createJsonBlacklist("data/blacklist.json")
  const audioUrlCache = createAudioUrlCache()
  const audio = createYtDlpAudio(cookieStore, logger, () => browser.refresh(), audioUrlCache)
  const search = createYouTubeSearch(cookieStore, audioUrlCache)

  const lastfm = createLastFmAdapter(config.lastfm.apiKey)
  const groq = createGroqAdapter(config.groq.apiKey)
  const recommend = createRadioService(lastfm, groq, search, logger)

  const voice = createDiscordVoice()
  const playerPort = createDiscordPlayer()

  const queueStore = createQueueMessageStore()
  const notifier = createDiscordNotifier(queueStore.messages, queueStore.channels, logger)

  const guilds = createDiscordGuildAdapter(getBotClient)

  const ports: Ports = {
    audio, search, recommend, lastfm, groq,
    voice, player: playerPort, notify: notifier,
    cookieStore, browser, blacklist, guilds, logger,
  }

  let trackChangeHandler: (guildId: string) => void = () => {}
  const music = createMusicUseCases(ports, { onTrackChange: (guildId) => trackChangeHandler(guildId) })
  const setSession = (guildId: string, session: GuildSession): void => { music.setSession(guildId, session) }
  const queueUC = createQueueUseCases(music.getSession, setSession)
  let radioChangeHandler: (guildId: string) => void = () => {}
  const radioUC = createRadioUseCases(ports, music.getSession, setSession, music.prefetchNext, (guildId) => radioChangeHandler(guildId))
  const adminUC = createAdminUseCases(ports)
  const cookieUC = createCookieUseCases(ports)
  const searchUC = createSearchUseCases(ports)

  const queueDisplay = createQueueDisplay({
    music, notifier,
    queueMessages: queueStore.messages,
    queueChannels: queueStore.channels,
    logger,
  })

  // Changes don't render on their own: the display loop picks them up on its next 5 s tick
  trackChangeHandler = queueDisplay.ensureRendering
  radioChangeHandler = queueDisplay.ensureRendering

  const cookieScheduler = await initCookieSystem({
    cookieStore, browser,
    cookieRefreshIntervalMs: config.youtube.cookieRefreshIntervalMs,
    logger,
  })

  const adminPort = parseInt(process.env.ADMIN_PORT || "3002", 10)
  const adminServer = createAdminServer(
    { music, admin: adminUC, cookie: cookieUC, blacklist, logger },
    adminPort,
    config.admin.token,
    config.admin.allowedOrigins,
    cookieScheduler,
  )
  adminServer.start()

  const bot = createBot({
    music,
    queue: queueUC,
    radio: radioUC,
    admin: adminUC,
    search: searchUC,
    updateUI: queueDisplay.ensureRendering,
    initializeQueueDisplay: queueDisplay.initializeQueueDisplay,
    refreshButtonMessage: queueDisplay.refreshButtonMessage,
    blacklistIsBlacklisted: blacklist.isBlacklisted,
    autocompleteSearch: searchUC.autocomplete,
    logger,
  })

  botClient = bot

  setupProcessHandlers({ adminServer, cookieScheduler, logger })

  logger.info("bot", "Iniciando conexion a Discord...")
  await bot.login(config.discord.token)
}
