import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"
import { updateQueueForGuild } from "./queue"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (!queue || queue.getSize() === 0) {
    await interaction.reply({ content: "La cola está vacía", ephemeral: true })
    return
  }

  queue.shuffle()
  await interaction.reply("🔀 Cola mezclada")
  await interaction.deleteReply().catch(() => {})
  await updateQueueForGuild(interaction.guildId!)
}
