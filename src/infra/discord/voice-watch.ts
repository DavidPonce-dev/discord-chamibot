import type { LoggerPort } from "../../domain/ports"
import type { MusicUseCases } from "../../usecases/music"

export type VoiceChange = Readonly<{
  guildId: string
  // The change is about the bot itself, not another member
  isSelf: boolean
  oldChannelId: string | null
  newChannelId: string | null
}>

type VoiceWatcherDeps = Readonly<{
  music: Pick<MusicUseCases, "getSession" | "setSession" | "destroySession">
  logger: LoggerPort
}>

export type VoiceWatcher = Readonly<{
  onVoiceStateUpdate: (change: VoiceChange) => void
}>

// Ends the session when the bot is kicked from voice: without this it keeps streaming (and, with
// autoplay, resolving new tracks) into nothing. An empty channel does not end it: the bot keeps playing
export const createVoiceWatcher = (deps: VoiceWatcherDeps): VoiceWatcher => {
  const { music, logger } = deps

  const onVoiceStateUpdate = (change: VoiceChange): void => {
    const { guildId, isSelf, newChannelId } = change
    if (!isSelf) return
    const session = music.getSession(guildId)
    if (!session) return

    if (!newChannelId) {
      logger.info("voice", "El bot fue desconectado del canal de voz, terminando la sesion", { guildId })
      music.destroySession(guildId)
      return
    }
    if (newChannelId !== session.voiceChannelId) {
      music.setSession(guildId, { ...session, voiceChannelId: newChannelId })
    }
  }

  return { onVoiceStateUpdate } as const
}
