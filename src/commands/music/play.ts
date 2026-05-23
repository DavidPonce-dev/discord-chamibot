import { ChatInputCommandInteraction } from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";
import { resolveQuery } from "@/utils/search";
import { guildManager, registerCleanup } from "@/services/guild/GuildManager";
import { ensureQueueMessage, updateQueueForGuild, setQueuePage, clearQueuePage } from "@/commands/queue/queue";
import { editTemporary } from "@/utils/messages";
import { logger } from "@/utils/logger";
import { TRACKS_PER_PAGE } from "@/constants";
import { calcTotalPages } from "@/utils/format";
import { getErrorMessage } from "@/utils/error";
import type { Track } from "@/core/types";
import type { ResolveResult } from "@/utils/search";

const PROGRESS_UPDATE_INTERVAL_MS = 3_000

function toTrack(video: ResolveResult["tracks"][0], requestedBy: string): Track {
  return {
    title: video.title,
    url: video.url,
    requestedBy,
    duration: video.duration,
    id: video.id,
    thumbnail: video.thumbnail,
  }
}

registerCleanup(stopProgressUpdates)

async function sendQueueStatus(
  guildId: string,
  channel: GuildTextBasedChannel | undefined,
  statusTitle: string,
  totalPages: number,
) {
  guildManager.setStatusTitle(guildId, statusTitle)
  if (!channel?.send) return
  await ensureQueueMessage(guildId, channel, statusTitle, totalPages)
  startProgressUpdates(guildId)
}

const progressIntervals = new Map<string, NodeJS.Timeout>()

// Sets up scheduler lifecycle callbacks for queue UI updates and cleanup
function setupSchedulerCallbacks(scheduler: import("../../services/scheduler/TrackScheduler").TrackScheduler, guildId: string) {
  if (!scheduler.onTrackChange) {
    scheduler.onTrackChange = (gId) => {
      setQueuePage(gId, 1)
      const statusTitle = guildManager.getStatusTitle(gId)
      updateQueueForGuild(gId, statusTitle)
      const s = guildManager.get(gId)
      if (s?.getCurrentTrack()) {
        startProgressUpdates(gId)
      }
    }
  }

  if (!scheduler.onDisconnect) {
    scheduler.onDisconnect = (gId) => {
      stopProgressUpdates(gId)
      const msg = guildManager.getQueueMessage(gId)
      if (msg) msg.delete().catch(() => {})
      guildManager.clearQueueMessage(gId)
      guildManager.clearStatusTitle(gId)
      clearQueuePage(gId)
    }
  }
}

function updateProgress(guildId: string) {
  const scheduler = guildManager.get(guildId)
  if (!scheduler || (!scheduler.getCurrentTrack() && scheduler.getSize() === 0)) {
    const iv = progressIntervals.get(guildId)
    if (iv) {
      clearInterval(iv)
      progressIntervals.delete(guildId)
    }
    return
  }
  const statusTitle = guildManager.getStatusTitle(guildId)
  updateQueueForGuild(guildId, statusTitle)
}

function startProgressUpdates(guildId: string) {
  stopProgressUpdates(guildId)
  progressIntervals.set(guildId, setInterval(() => updateProgress(guildId), PROGRESS_UPDATE_INTERVAL_MS))
}

function stopProgressUpdates(guildId: string) {
  const iv = progressIntervals.get(guildId)
  if (iv) {
    clearInterval(iv)
    progressIntervals.delete(guildId)
  }
}

export function stopProgressForGuild(guildId: string) {
  stopProgressUpdates(guildId)
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

    let scheduler = guildManager.get(guildId);

    if (!scheduler) {
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

      scheduler = guildManager.create(guildId, connection);
    }

    setupSchedulerCallbacks(scheduler, guildId)

    const lastPage = () => calcTotalPages(scheduler!.getSize(), TRACKS_PER_PAGE)

    if (result.tracks.length > 1) {
      const tracks = result.tracks.map((t) => toTrack(t, user))
      await scheduler.addMultiple(tracks)
      logger.event("command", "Playlist añadida", {
        title: result.playlistTitle,
        trackCount: tracks.length,
        user,
        guildId,
      })
      await interaction.deleteReply().catch(() => {})
      await sendQueueStatus(guildId, interaction.channel as GuildTextBasedChannel | undefined, `🎵 ${user} agregó una playlist — ${result.playlistTitle ?? "Lista"}`, lastPage())
    } else {
      const track = toTrack(result.tracks[0], user)
      await scheduler.add(track)
      logger.event("command", "Track añadido", {
        title: track.title,
        user,
        guildId,
      })
      await interaction.deleteReply().catch(() => {})
      await sendQueueStatus(guildId, interaction.channel as GuildTextBasedChannel | undefined, `🎵 ${user} agregó una canción — ${track.title}`, lastPage())
    }
  } catch (error) {
    logger.error("command", "Error al procesar el tema", {
      query,
      user,
      guildId,
      error: getErrorMessage(error),
    })
    await editTemporary(interaction, "Error al procesar el tema");
  }
}
