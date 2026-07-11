import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/music/GuildManager"
import { replyTemporary } from "@/utils/messages"
import { requireGuild } from "@/utils/guards"

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = requireGuild(interaction)
  if (!guildId) return
  const scheduler = guildManager.get(guildId)

  const newState = scheduler
    ? await scheduler.toggleAutoplay()
    : guildManager.toggleAutoplayPref(guildId)

  await replyTemporary(interaction, `Autoplay: ${newState ? "✅ Activado" : "❌ Desactivado"}`)
}
