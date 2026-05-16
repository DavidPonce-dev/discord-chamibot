import { ChatInputCommandInteraction } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";
import { resolveQuery } from "../utils/search";
import { musicManager } from "../music/MusicManager";
import { ensureQueueMessage, updateQueueForGuild, setQueuePage, clearQueuePage, TRACKS_PER_PAGE } from "./queue";

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true);

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: "Debés entrar a un canal de voz",
      ephemeral: true,
    });
    return
  }

  await interaction.deferReply();

  try {
    const result = await resolveQuery(query);

    let queue = musicManager.get(interaction.guildId!);

    if (!queue) {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      queue = musicManager.create(interaction.guildId!, connection);
    }

    if (!queue.onTrackChange) {
      queue.onTrackChange = (guildId) => {
        setQueuePage(guildId, 1)
        updateQueueForGuild(guildId)
      }
    }

    if (!queue.onDisconnect) {
      queue.onDisconnect = (guildId) => {
        const msg = musicManager.getQueueMessage(guildId)
        if (msg) msg.delete().catch(() => {})
        musicManager.clearQueueMessage(guildId)
        clearQueuePage(guildId)
        musicManager.delete(guildId)
      }
    }

    const lastPage = () => Math.max(1, Math.ceil(queue!.getSize() / TRACKS_PER_PAGE))

    if (result.tracks.length > 1) {
      const tracks = result.tracks.map((t) => ({
        title: t.title,
        url: t.url,
        requestedBy: interaction.user.username,
        duration: t.duration,
        id: t.id,
        thumbnail: t.thumbnail,
      }))
      await queue.addMultiple(tracks)
      await interaction.editReply(`Añadida playlist: **${result.playlistTitle ?? "Lista"}** (${tracks.length} temas)`)
      const channel = interaction.channel
      if (channel && "send" in channel) {
        await ensureQueueMessage(interaction.guildId!, channel as any, `🎵 ${interaction.user.username} agregó una playlist — ${result.playlistTitle ?? "Lista"}`, lastPage())
      }
    } else {
      const track = result.tracks[0]
      await queue.add({
        title: track.title,
        url: track.url,
        requestedBy: interaction.user.username,
        duration: track.duration,
        id: track.id,
        thumbnail: track.thumbnail,
      })
      await interaction.editReply(`Añadido: **${track.title}**`)
      const channel = interaction.channel
      if (channel && "send" in channel) {
        await ensureQueueMessage(interaction.guildId!, channel as any, `🎵 ${interaction.user.username} agregó una canción — ${track.title}`, lastPage())
      }
    }

    await interaction.deleteReply().catch(() => {});
  } catch (error) {
    console.error("Error al procesar el tema");
    await interaction.editReply("Error al procesar el tema");
  }
}
