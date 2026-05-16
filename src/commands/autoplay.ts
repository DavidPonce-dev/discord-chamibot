import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "../services/GuildManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = guildManager.get(interaction.guildId!)

  if (queue) {
    const newState = queue.toggleAutoplay()
    guildManager.toggleAutoplayPref(interaction.guildId!)
    await interaction.reply(`Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
    return
  }

  const newState = guildManager.toggleAutoplayPref(interaction.guildId!)
  await interaction.reply(`Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
}
