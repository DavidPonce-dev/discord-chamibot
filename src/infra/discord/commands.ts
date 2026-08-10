import type { ChatInputCommandInteraction, GuildTextBasedChannel } from "discord.js"
import type { MusicUseCases } from "../../usecases/music"
import type { QueueUseCases } from "../../usecases/queue"
import type { RadioUseCases } from "../../usecases/radio"
import type { AdminUseCases } from "../../usecases/admin"
import type { SearchUseCases } from "../../usecases/search"
import type { LoggerPort } from "../../domain/ports"
import type { GuildSession } from "../../domain/types"
import { buildHelpEmbed } from "../ui/help-embed"
import { replyTemporaryEmbed, replyTemporary, silentReply } from "../../shared/messages"

type UseCaseBundle = Readonly<{
  music: MusicUseCases
  queue: QueueUseCases
  radio: RadioUseCases
  admin: AdminUseCases
  search: SearchUseCases
  updateUI: (guildId: string) => void
  initializeQueueDisplay: (guildId: string, channel: GuildTextBasedChannel | undefined) => Promise<void>
  logger: LoggerPort
}>

type CommandHandlerFn = (interaction: ChatInputCommandInteraction, guildId: string, userId: string) => Promise<void>

const requireVoiceChannel = (interaction: ChatInputCommandInteraction): string | null => {
  const member = interaction.guild?.members.cache.get(interaction.user.id)
  return member?.voice.channel?.id ?? null
}

const hasSession = (music: MusicUseCases, guildId: string): GuildSession | null =>
  music.getSession(guildId)

const hasPlaying = (music: MusicUseCases, guildId: string): GuildSession | null => {
  const session = music.getSession(guildId)
  return session?.queue.current ? session : null
}

export const createCommandHandlers = (bundle: UseCaseBundle): Record<string, CommandHandlerFn> => {
  const { music, queue, radio, admin, updateUI, initializeQueueDisplay, logger } = bundle

  return {
    p: async (interaction, guildId, userId) => {
      const query = interaction.options.getString("query", true)
      if (admin.isDeployMode()) {
        await interaction.reply({ content: "Actualizando servicio", ephemeral: true })
        return
      }

      const voiceChannelId = requireVoiceChannel(interaction)
      if (!voiceChannelId) {
        await interaction.reply({ content: "Debes entrar a un canal de voz", ephemeral: true })
        return
      }

      await interaction.deferReply()

      const member = interaction.guild?.members.cache.get(interaction.user.id)
      const adapterCreator = member?.voice.channel?.guild.voiceAdapterCreator

      const result = await music.play(query, guildId, userId, voiceChannelId, adapterCreator)
      if (!result.ok) {
        logger.error("command", "Error en /p", { query, error: result.error })
        await interaction.editReply("Error al procesar el tema")
        return
      }

      await interaction.deleteReply().catch(() => {})
      await initializeQueueDisplay(guildId, interaction.channel as GuildTextBasedChannel | undefined)
      updateUI(guildId)
    },

    s: async (interaction, guildId) => {
      if (!hasPlaying(music, guildId)) {
        await interaction.reply({ content: "No hay nada reproduciendose", ephemeral: true })
        return
      }
      music.skip(guildId)
      await silentReply(interaction)
      updateUI(guildId)
    },

    pa: async (interaction, guildId) => {
      if (!hasPlaying(music, guildId)) {
        await interaction.reply({ content: "No hay nada reproduciendose", ephemeral: true })
        return
      }
      const result = music.pause(guildId)
      if (!result.ok) {
        const msg = result.error === "already_paused" ? "Ya esta pausado" : "No hay sesion activa"
        await interaction.reply({ content: msg, ephemeral: true })
        return
      }
      await silentReply(interaction)
      updateUI(guildId)
    },

    r: async (interaction, guildId) => {
      if (!hasPlaying(music, guildId)) {
        await interaction.reply({ content: "No hay nada reproduciendose", ephemeral: true })
        return
      }
      const result = music.resume(guildId)
      if (!result.ok) {
        const msg = result.error === "not_paused" ? "No esta pausado" : "No hay sesion activa"
        await interaction.reply({ content: msg, ephemeral: true })
        return
      }
      await silentReply(interaction)
      updateUI(guildId)
    },

    st: async (interaction, guildId) => {
      if (!hasSession(music, guildId)) {
        await interaction.reply({ content: "No hay sesion activa", ephemeral: true })
        return
      }
      music.stop(guildId)
      await silentReply(interaction)
    },

    q: async (interaction, guildId) => {
      const session = hasSession(music, guildId)
      if (!session) {
        await interaction.reply({ content: "No hay sesion activa", ephemeral: true })
        return
      }
      const totalSize = session.queue.userTracks.length + session.queue.radioTracks.length
      if (totalSize === 0 && !session.queue.current) {
        await silentReply(interaction)
        return
      }
      music.setSession(guildId, { ...session, queuePage: 1 })
      await silentReply(interaction)
      updateUI(guildId)
    },

    sh: async (interaction, guildId) => {
      if (!hasSession(music, guildId)) {
        await interaction.reply({ content: "No hay sesion activa", ephemeral: true })
        return
      }
      const result = queue.shuffleQueue(guildId)
      if (!result.ok) {
        const msg = result.error === "empty" ? "La cola esta vacia" : "No hay sesion activa"
        await interaction.reply({ content: msg, ephemeral: true })
        return
      }
      await silentReply(interaction)
      updateUI(guildId)
    },

    rm: async (interaction, guildId) => {
      if (!hasSession(music, guildId)) {
        await interaction.reply({ content: "No hay sesion activa", ephemeral: true })
        return
      }
      const position = interaction.options.getInteger("position", true)
      const result = queue.removeTrack(guildId, position)
      if (!result.ok) {
        const msg = result.error === "out_of_bounds" ? "Posicion invalida" : "No hay sesion activa"
        await interaction.reply({ content: msg, ephemeral: true })
        return
      }
      await silentReply(interaction)
      updateUI(guildId)
    },

    l: async (interaction, guildId) => {
      if (!hasSession(music, guildId)) {
        await interaction.reply({ content: "No hay sesion activa", ephemeral: true })
        return
      }
      const result = queue.toggleLoop(guildId)
      if (!result.ok) {
        await interaction.reply({ content: "No hay sesion activa", ephemeral: true })
        return
      }
      await silentReply(interaction)
      updateUI(guildId)
    },

    sk: async (interaction, guildId) => {
      if (!hasPlaying(music, guildId)) {
        await interaction.reply({ content: "No hay nada reproduciendose", ephemeral: true })
        return
      }
      const seconds = interaction.options.getNumber("seconds", true)
      await interaction.deferReply()
      const result = await music.seek(guildId, seconds)
      if (!result.ok) {
        await interaction.editReply("Error al buscar posicion")
        return
      }
      await interaction.deleteReply().catch(() => {})
      updateUI(guildId)
    },

    np: async (interaction, guildId) => {
      if (!hasPlaying(music, guildId)) {
        await interaction.reply({ content: "No hay nada reproduciendose", ephemeral: true })
        return
      }
      const session = music.getSession(guildId)!
      music.setSession(guildId, { ...session, queuePage: 1 })
      updateUI(guildId)
      await interaction.reply({ content: "Cola actualizada", ephemeral: true })
    },

    ap: async (interaction, guildId) => {
      const session = music.getSession(guildId)
      if (session) {
        const result = await radio.toggleAutoplay(guildId)
        if (result.ok) {
          await replyTemporary(interaction, `Autoplay: ${result.value ? "Activado" : "Desactivado"}`)
          updateUI(guildId)
          return
        }
      }
      // No session - toggle pref for future sessions
      await replyTemporary(interaction, "Autoplay: preferencia guardada para proxima sesion")
    },

    h: async (interaction) => {
      const embed = buildHelpEmbed()
      await replyTemporaryEmbed(interaction, [embed])
    },

    lastfm: async (interaction, guildId) => {
      const action = interaction.options.getString("action")
      const username = interaction.options.getString("username")
      const session = music.getSession(guildId)

      switch (action) {
        case "set": {
          if (!username) {
            await replyTemporary(interaction, "Debes proporcionar un nombre de usuario de Last.fm.")
            return
          }
          if (session) {
            music.setSession(guildId, { ...session, prefs: { ...session.prefs, lastfmUsername: username } })
          }
          await replyTemporary(interaction, `Last.fm username configurado: **${username}**`)
          break
        }
        case "clear": {
          if (session) {
            music.setSession(guildId, { ...session, prefs: { ...session.prefs, lastfmUsername: null } })
          }
          await replyTemporary(interaction, "Last.fm username removido.")
          break
        }
        case "show": {
          const current = session?.prefs.lastfmUsername
          await replyTemporary(interaction, current
            ? `Last.fm username actual: **${current}**`
            : "No hay Last.fm username configurado para este servidor.")
          break
        }
        default:
          await replyTemporary(interaction, "Uso: `/lastfm set <username>`, `/lastfm clear`, `/lastfm show`")
      }
    },
  }
}
