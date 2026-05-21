import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../../services/guild/GuildManager"
import { replyTemporary } from "../../utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)

  if (queue) {
    const newState = queue.toggleAutoplay()
    guildManager.toggleAutoplayPref(interaction.guildId!)
    await replyTemporary(interaction, `Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
    return
  }

  const newState = guildManager.toggleAutoplayPref(interaction.guildId!)
  await replyTemporary(interaction, `Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
}
