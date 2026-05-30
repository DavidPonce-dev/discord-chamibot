import { ChatInputCommandInteraction } from "discord.js"
import { requireScheduler } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const seconds = interaction.options.getNumber("seconds", true)
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return

  await interaction.deferReply()

  try {
    await scheduler.seek(seconds)
    await interaction.deleteReply().catch(() => {})
  } catch {
    await interaction.editReply("No se pudo buscar en esa posición. Verificá que el timestamp sea válido.").catch(() => {})
  }
}
