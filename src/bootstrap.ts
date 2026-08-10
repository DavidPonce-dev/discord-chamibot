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
    refreshTimeoutMs: 60_000,
  }, logger)

  logger.info("bootstrap", "Reiniciando perfil de navegador (deploy limpio)")
  await browser.resetProfile()

  const blacklist = createJsonBlacklist("data/blacklist.json")
  const audio = createYtDlpAudio(cookieStore, logger, () => browser.refresh())
  const search = createYouTubeSearch(cookieStore, logger)

  const lastfm = createLastFmAdapter(config.lastfm.apiKey)
  const groq = createGroqAdapter(config.groq.apiKey)
  const recommend = createRadioService(lastfm, groq, search, logger)

  const voice = createDiscordVoice()
  const playerPort = createDiscordPlayer()

  const queueStore = createQueueMessageStore()
  const notifier = createDiscordNotifier(
    queueStore.messages.get,
    queueStore.messages.set,
    queueStore.channels.get,
    queueStore.channels.set,
    queueStore.messages.clear,
    queueStore.channels.clear,
    logger,
  )

  const guilds = createDiscordGuildAdapter(getBotClient)

  const ports: Ports = {
    audio, search, recommend, lastfm, groq,
    voice, player: playerPort, notify: notifier,
    cookieStore, browser, blacklist, guilds, logger,
  }

  let trackChangeHandler: (guildId: string) => void = () => {}
  const music = createMusicUseCases(ports, { onTrackChange: (guildId) => trackChangeHandler(guildId) })
  const setSession = (guildId: string, session: GuildSession): void => { music.setSession(guildId, session) }
  const queueUC = createQueueUseCases(ports, music.getSession, setSession)
  let radioChangeHandler: (guildId: string) => void = () => {}
  const radioUC = createRadioUseCases(ports, music.getSession, setSession, music.prefetchRadioUrl, (guildId) => radioChangeHandler(guildId))
  const adminUC = createAdminUseCases(ports)
  const cookieUC = createCookieUseCases(ports)
  const searchUC = createSearchUseCases(ports)

  const queueDisplay = createQueueDisplay({
    music, notifier,
    queueMessages: queueStore.messages,
    queueChannels: queueStore.channels,
    logger,
  })

  trackChangeHandler = (guildId) => {
    queueDisplay.updateQueueForGuild(guildId)
    const session = music.getSession(guildId)
    if (session?.queue.current) queueDisplay.startProgressUpdates(guildId)
  }

  radioChangeHandler = (guildId) => {
    queueDisplay.updateQueueForGuild(guildId)
    const session = music.getSession(guildId)
    if (session?.queue.current) queueDisplay.startProgressUpdates(guildId)
  }

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
    updateUI: (guildId: string) => {
      queueDisplay.updateQueueForGuild(guildId)
      const session = music.getSession(guildId)
      if (session?.queue.current) queueDisplay.startProgressUpdates(guildId)
    },
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
