import { ChatInputCommandInteraction } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";
import { resolveQuery } from "../../utils/search";
import { guildManager } from "../../services/guild/GuildManager";
import { ensureQueueMessage, updateQueueForGuild, setQueuePage, clearQueuePage } from "../queue/queue";
import { editTemporary } from "../../utils/messages";
import { logger } from "../../utils/logger";
import { TRACKS_PER_PAGE } from "../../constants";
import { calcTotalPages } from "../../utils/format";

const progressIntervals = new Map<string, NodeJS.Timeout>()

function updateProgress(guildId: string) {
  const queue = guildManager.get(guildId)
  if (!queue || (!queue.getCurrentTrack() && queue.getSize() === 0)) {
    const iv = progressIntervals.get(guildId)
    if (iv) {
      clearInterval(iv)
      progressIntervals.delete(guildId)
    }
    return
  }
  updateQueueForGuild(guildId)
}

function startProgressUpdates(guildId: string) {
  stopProgressUpdates(guildId)
  progressIntervals.set(guildId, setInterval(() => updateProgress(guildId), 3000))
}

function stopProgressUpdates(guildId: string) {
  const iv = progressIntervals.get(guildId)
  if (iv) {
    clearInterval(iv)
    progressIntervals.delete(guildId)
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true);
  const guildId = interaction.guildId!
  const user = interaction.user.username

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    logger.warn("command", "Play sin canal de voz", { user, guildId })
    await interaction.reply({
      content: "Debés entrar a un canal de voz",
      ephemeral: true,
    });
    return
  }

  await interaction.deferReply();

  try {
    logger.debug("command", "Resolviendo query", { query, user, guildId })
    const result = await resolveQuery(query);
    logger.info("command", "Query resuelta", {
      trackCount: result.tracks.length,
      playlist: result.playlistTitle,
      user,
      guildId,
    })

    let queue = guildManager.get(guildId);

    if (!queue) {
      logger.event("command", "Creando conexión de voz", {
        guildId,
        channel: voiceChannel.name,
        user,
      })
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      queue = guildManager.create(guildId, connection);
    }

    if (!queue.onTrackChange) {
      queue.onTrackChange = (gId) => {
        setQueuePage(gId, 1)
        updateQueueForGuild(gId)
        const q = guildManager.get(gId)
        if (q?.getCurrentTrack()) {
          startProgressUpdates(gId)
        }
      }
    }

    if (!queue.onDisconnect) {
      queue.onDisconnect = (gId) => {
        const msg = guildManager.getQueueMessage(gId)
        if (msg) msg.delete().catch(() => {})
        guildManager.clearQueueMessage(gId)
        clearQueuePage(gId)
        stopProgressUpdates(gId)
        guildManager.delete(gId)
      }
    }

    const lastPage = () => calcTotalPages(queue!.getSize(), TRACKS_PER_PAGE)

    if (result.tracks.length > 1) {
      const tracks = result.tracks.map((t) => ({
        title: t.title,
        url: t.url,
        requestedBy: user,
        duration: t.duration,
        id: t.id,
        thumbnail: t.thumbnail,
      }))
      await queue.addMultiple(tracks)
      logger.event("command", "Playlist añadida", {
        title: result.playlistTitle,
        trackCount: tracks.length,
        user,
        guildId,
      })
      await interaction.editReply(`Añadida playlist: **${result.playlistTitle ?? "Lista"}** (${tracks.length} temas)`)
      const channel = interaction.channel
      if (channel && "send" in channel) {
        await ensureQueueMessage(guildId, channel as any, `🎵 ${user} agregó una playlist — ${result.playlistTitle ?? "Lista"}`, lastPage())
      }
    } else {
      const track = result.tracks[0]
      await queue.add({
        title: track.title,
        url: track.url,
        requestedBy: user,
        duration: track.duration,
        id: track.id,
        thumbnail: track.thumbnail,
      })
      logger.event("command", "Track añadido", {
        title: track.title,
        user,
        guildId,
      })
      await interaction.editReply(`Añadido: **${track.title}**`)
      const channel = interaction.channel
      if (channel && "send" in channel) {
        await ensureQueueMessage(guildId, channel as any, `🎵 ${user} agregó una canción — ${track.title}`, lastPage())
      }
    }
  } catch (error) {
    logger.error("command", "Error al procesar el tema", {
      query,
      user,
      guildId,
      error: error instanceof Error ? error.message : String(error),
    })
    await editTemporary(interaction, "Error al procesar el tema");
  }
}
