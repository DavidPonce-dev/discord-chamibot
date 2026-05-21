import { ChatInputCommandInteraction } from "discord.js"
import { editTemporary } from "@/utils/messages"
import { requireScheduler } from "@/utils/guards"
import { formatTimeFFmpeg } from "@/utils/format"

export async function execute(interaction: ChatInputCommandInteraction) {
  const seconds = interaction.options.getNumber("seconds", true)
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return

  await interaction.deferReply()

  try {
    await scheduler.seek(seconds)
    await editTemporary(interaction, `⏩ Saltado a ${formatTimeFFmpeg(seconds)}`)
  } catch {
    await editTemporary(interaction, "Error al buscar")
  }
}
