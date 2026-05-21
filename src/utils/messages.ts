import { ChatInputCommandInteraction, Message } from "discord.js"

const AUTO_DELETE_MS = 5000

function scheduleDelete(msg: Message) {
  setTimeout(() => msg.delete().catch(() => {}), AUTO_DELETE_MS)
}

export async function replyTemporary(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<Message> {
  const msg = (await interaction.reply({ content, fetchReply: true } as any)) as unknown as Message
  scheduleDelete(msg)
  return msg
}

export async function replyTemporaryEmbed(
  interaction: ChatInputCommandInteraction,
  embeds: any[],
  components?: any[],
): Promise<Message> {
  const opts: any = { embeds, fetchReply: true }
  if (components) opts.components = components
  const msg = (await interaction.reply(opts)) as unknown as Message
  scheduleDelete(msg)
  return msg
}

export async function editTemporary(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<Message> {
  const msg = (await interaction.editReply({ content, fetchReply: true } as any)) as unknown as Message
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
