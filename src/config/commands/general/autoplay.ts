import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { replyTemporary } from "@/utils/messages"
import { requireGuild } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = requireGuild(interaction)
  if (!guildId) return
  const scheduler = guildManager.get(guildId)

  if (scheduler) {
    const newState = await scheduler.toggleAutoplay()
    guildManager.toggleAutoplayPref(guildId)
    await replyTemporary(interaction, `Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
    return
  }

  const newState = guildManager.toggleAutoplayPref(guildId)
  await replyTemporary(interaction, `Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
}
