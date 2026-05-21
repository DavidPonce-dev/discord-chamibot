import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { buildNowPlayingEmbed } from "@/ui/embeds/NowPlayingEmbed"
import { buildNowPlayingButtons } from "@/ui/components/QueueComponents"
import { replyTemporaryEmbed } from "@/utils/messages"
import { requireScheduler } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const scheduler = requireScheduler(interaction)
  if (!scheduler) return

  const embed = buildNowPlayingEmbed(scheduler)
  const row = buildNowPlayingButtons(scheduler)

  await replyTemporaryEmbed(interaction, [embed], [row])
}
