import { ChatInputCommandInteraction } from "discord.js"
import { requireScheduler } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const seconds = interaction.options.getNumber("seconds", true)
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return

  await interaction.deferReply()

  try {
    await scheduler.seek(seconds)
  } catch {
    // silent fail
  }
  await interaction.deleteReply().catch(() => {})
}
