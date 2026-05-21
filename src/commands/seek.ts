import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"
import { editTemporary } from "../utils/messages"
import { requireQueue } from "../utils/guards"
import { formatTimeFFmpeg } from "../utils/format"

export async function execute(interaction: ChatInputCommandInteraction) {
  const seconds = interaction.options.getNumber("seconds", true)
  const queue = requireQueue(interaction)
  if (!queue) return

  await interaction.deferReply()

  try {
    await queue.seek(seconds)
    await editTemporary(interaction, `⏩ Saltado a ${formatTimeFFmpeg(seconds)}`)
  } catch {
    await editTemporary(interaction, "Error al buscar")
  }
}
