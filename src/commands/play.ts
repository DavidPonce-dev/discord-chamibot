import { ChatInputCommandInteraction } from "discord.js"
import { joinVoiceChannel } from "@discordjs/voice"
import { resolveQuery } from "../utils/search"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("query", true)

  const member = interaction.guild?.members.cache.get(interaction.user.id)
  const voiceChannel = member?.voice.channel

  if (!voiceChannel) {
    return interaction.reply({
      content: "Debés entrar a un canal de voz",
      ephemeral: true,
    })
  }

  await interaction.deferReply()

  try {
    const trackInfo = await resolveQuery(query)

    let queue = musicManager.get(interaction.guildId!)

    if (!queue) {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      })

      queue = musicManager.create(interaction.guildId!, connection)
    }

    await queue.add({
      title: trackInfo.title,
      url: trackInfo.url,
      requestedBy: interaction.user.username,
      duration: trackInfo.duration,
    })

    await interaction.editReply(`Añadido: **${trackInfo.title}**`)
  } catch (error) {
    console.error(error)
    await interaction.editReply("Error al procesar el tema")
  }
}
