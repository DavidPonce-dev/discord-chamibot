import { ChatInputCommandInteraction } from "discord.js";
import type { GuildTextBasedChannel } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";
import { resolveQuery } from "@/services/search/YouTubeResolver";
import { guildManager } from "@/services/guild/GuildManager";
import { setupSchedulerCallbacks, initializeQueueDisplay } from "@/services/queue/QueueProgressTracker";
import { updateQueueForGuild, setQueuePage } from "@/services/queue/QueueUIManager";
import { editTemporary } from "@/utils/messages";
import { logger } from "@/utils/logger";
import { TRACKS_PER_PAGE } from "@/config/ui"
import { calcTotalPages } from "@/utils/format";
import { getErrorMessage } from "@/utils/error";
import { requireGuild } from "@/utils/guards";
import { isDeployMode } from "@/services/deploy/DeployGuard";
import type { Track } from "@/core/types";
import type { ResolveResult } from "@/services/search/YouTubeResolver";

function toTrack(video: ResolveResult["tracks"][0], requestedBy: string): Track {
  const canonicalTitle = video.track && video.artist
    ? `${video.artist} - ${video.track}`
    : video.track
      ? video.track
      : undefined

  return {
    title: video.title,
    url: video.url,
    requestedBy,
    duration: video.duration,
    id: video.id,
    thumbnail: video.thumbnail,
    canonicalTitle,
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true);
  const guildId = requireGuild(interaction)
  if (!guildId) return
  const user = interaction.user.username

  if (isDeployMode()) {
    await interaction.reply({
      content: "Actualizando servicio",
      ephemeral: true,
    });
    return
  }

  logger.info("command", "/play ejecutado", { query, user, guildId })

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
      await initializeQueueDisplay(guildId, interaction.channel as GuildTextBasedChannel | undefined, lastPage())
    } else {
      const track = toTrack(result.tracks[0], user)
      await scheduler.add(track)
      logger.event("command", "Track añadido", {
        title: track.title,
        user,
        guildId,
      })
      await interaction.deleteReply().catch(() => {})
      await initializeQueueDisplay(guildId, interaction.channel as GuildTextBasedChannel | undefined, lastPage())
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
