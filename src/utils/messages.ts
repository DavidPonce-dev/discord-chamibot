import { ChatInputCommandInteraction, Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js"
import { AUTO_DELETE_MS } from "@/config/timeouts"

function scheduleDelete(msg: Message) {
  setTimeout(() => msg.delete().catch(() => {}), AUTO_DELETE_MS)
}

export async function replyTemporary(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<Message> {
  const msg = await interaction.reply({ content, fetchReply: true }) as Message
  scheduleDelete(msg)
  return msg
}

export async function replyTemporaryEmbed(
  interaction: ChatInputCommandInteraction,
  embeds: EmbedBuilder[],
  components?: ActionRowBuilder<ButtonBuilder>[],
): Promise<Message> {
  const msg = await interaction.reply({ embeds, components, fetchReply: true }) as Message
  scheduleDelete(msg)
  return msg
}

export async function editTemporary(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<Message> {
  const msg = await interaction.editReply({ content }) as Message
  scheduleDelete(msg)
  return msg
}

export async function replyAndDelete(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  await interaction.reply(content)
  await interaction.deleteReply().catch(() => {})
}
