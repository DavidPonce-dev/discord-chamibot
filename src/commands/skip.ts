import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"
import { updateQueueForGuild, setQueuePage } from "./queue"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }

  if (!queue.getCurrentTrack()) {
    await interaction.reply({ content: "No hay nada reproduciéndose", ephemeral: true })
    return
  }

  queue.skip()
  setQueuePage(interaction.guildId!, 1)
  await interaction.reply("⏭ Saltado")
  await interaction.deleteReply().catch(() => {})
  await updateQueueForGuild(interaction.guildId!)
}
