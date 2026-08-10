import {
  joinVoiceChannel,
  type VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  AudioPlayerStatus,
  type AudioResource,
} from "@discordjs/voice"
import type { VoiceConnectionPort, AudioPlayerPort } from "../../domain/ports"
import { ok, err, type Result } from "../../shared/result"

const connections = new Map<string, VoiceConnection>()

export const createDiscordVoice = (): VoiceConnectionPort => {
  const join = async (guildId: string, channelId: string, adapterCreator: unknown): Promise<Result<void, string>> => {
    try {
      const connection = joinVoiceChannel({
        channelId,
        guildId,
        adapterCreator: adapterCreator as any,
      })
      connections.set(guildId, connection)

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000)
      return ok(undefined)
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : String(e))
    }
  }

  const destroy = (guildId: string): void => {
    const conn = connections.get(guildId)
    if (conn) {
      conn.destroy()
      connections.delete(guildId)
    }
  }

  const isConnected = (guildId: string): boolean => {
    const conn = connections.get(guildId)
    if (!conn) return false
    const status = conn.state.status
    return status === VoiceConnectionStatus.Ready ||
      status === VoiceConnectionStatus.Connecting ||
      status === VoiceConnectionStatus.Signalling
  }

  return { join, destroy, isConnected } as const
}

export const createDiscordPlayer = (): AudioPlayerPort => {
  const players = new Map<string, ReturnType<typeof createAudioPlayer>>()

  const getPlayer = (guildId: string): ReturnType<typeof createAudioPlayer> => {
    let player = players.get(guildId)
    if (!player) {
      player = createAudioPlayer()
      players.set(guildId, player)
    }
    return player
  }

  const play = (guildId: string, resource: AudioResource): void => {
    getPlayer(guildId).play(resource)
  }

  const stop = (guildId: string): void => {
    getPlayer(guildId).stop()
  }

  const pause = (guildId: string): void => {
    getPlayer(guildId).pause()
  }

  const unpause = (guildId: string): void => {
    getPlayer(guildId).unpause()
  }

  const isPaused = (guildId: string): boolean =>
    getPlayer(guildId).state.status === AudioPlayerStatus.Paused

  const onIdle = (guildId: string, cb: (guildId: string) => void): void => {
    getPlayer(guildId).on(AudioPlayerStatus.Idle, () => cb(guildId))
  }

  const onError = (guildId: string, cb: (guildId: string, err: Error) => void): void => {
    getPlayer(guildId).on("error", (e: Error) => cb(guildId, e))
  }

  const getStatus = (guildId: string): string => getPlayer(guildId).state.status

  const subscribeToConnection = (guildId: string): void => {
    const conn = connections.get(guildId)
    if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) {
      conn.subscribe(getPlayer(guildId))
    }
  }

  const destroy = (guildId: string): void => {
    const player = players.get(guildId)
    if (player) {
      player.stop()
      players.delete(guildId)
    }
  }

  return { play, stop, pause, unpause, isPaused, onIdle, onError, getStatus, subscribeToConnection, destroy } as const
}
