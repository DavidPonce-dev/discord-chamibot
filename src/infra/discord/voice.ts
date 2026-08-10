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
  const player = createAudioPlayer()

  const play = (resource: AudioResource): void => {
    player.play(resource)
  }

  const stop = (): void => {
    player.stop()
  }

  const pause = (): void => {
    player.pause()
  }

  const unpause = (): void => {
    player.unpause()
  }

  const isPaused = (): boolean =>
    player.state.status === AudioPlayerStatus.Paused

  const onIdle = (cb: () => void): void => {
    player.on(AudioPlayerStatus.Idle, cb)
  }

  const onError = (cb: (err: Error) => void): void => {
    player.on("error", (e: Error) => cb(e))
  }

  const getStatus = (): string => player.state.status

  const subscribeToConnection = (guildId: string): void => {
    const conn = connections.get(guildId)
    if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) {
      conn.subscribe(player)
    }
  }

  return { play, stop, pause, unpause, isPaused, onIdle, onError, getStatus, subscribeToConnection } as const
}
