import { ChatInputCommandInteraction } from "discord.js"
import { musicManager } from "../music/MusicManager"

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!)

  if (queue) {
    const newState = queue.toggleAutoplay()
    musicManager.toggleAutoplayPref(interaction.guildId!)
    await interaction.reply(`Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
    return
  }

  const newState = musicManager.toggleAutoplayPref(interaction.guildId!)
  await interaction.reply(`Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
}
