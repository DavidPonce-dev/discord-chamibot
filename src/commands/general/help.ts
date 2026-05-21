import { ChatInputCommandInteraction } from "discord.js"
import { buildHelpEmbed } from "@/ui/embeds/HelpEmbed"
import { replyTemporaryEmbed } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = buildHelpEmbed()
  await replyTemporaryEmbed(interaction, [embed])
}
