import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../../services/guild/GuildManager"
import { buildNowPlayingEmbed } from "../../ui/embeds/NowPlayingEmbed"
import { buildNowPlayingButtons } from "../../ui/components/QueueComponents"
import { replyTemporaryEmbed } from "../../utils/messages"
import { requireQueue } from "../../utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = requireQueue(interaction)
  if (!queue) return

  const embed = buildNowPlayingEmbed(queue)
  const row = buildNowPlayingButtons(queue)

  await replyTemporaryEmbed(interaction, [embed], [row])
}
