import { ChatInputCommandInteraction } from "discord.js"
import { requirePlaying } from "@/utils/guards"
import { silentExecute } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requirePlaying(interaction)
  if (!result) return

  const seconds = interaction.options.getNumber("seconds", true)

  await silentExecute(interaction, async () => {
    await result.scheduler.seek(seconds)
  })
}
