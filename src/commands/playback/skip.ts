import { ChatInputCommandInteraction } from "discord.js"
import { updateQueueForGuild, setQueuePage } from "@/services/queue/QueueUIManager"
import { requirePlaying } from "@/utils/guards"
import { silentReply } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const result = requirePlaying(interaction)
  if (!result) return

  result.scheduler.skip()
  setQueuePage(result.guildId, 1)
  await silentReply(interaction)
  await updateQueueForGuild(result.guildId)
}
