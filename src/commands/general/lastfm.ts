import { ChatInputCommandInteraction } from "discord.js"
import { guildManager } from "@/services/guild/GuildManager"
import { replyTemporary } from "@/utils/messages"

export async function execute(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId
  if (!guildId) {
    await replyTemporary(interaction, "Este comando solo funciona en servidores.")
    return
  }

  const action = interaction.options.getString("action")
  const username = interaction.options.getString("username")

  switch (action) {
    case "set": {
      if (!username) {
        await replyTemporary(interaction, "Debes proporcionar un nombre de usuario de Last.fm.")
        return
      }
      guildManager.setLastfmUsername(guildId, username)
      await replyTemporary(interaction, `Last.fm username configurado: **${username}**`)
      break
    }

    case "clear": {
      guildManager.clearLastfmUsername(guildId)
      await replyTemporary(interaction, "Last.fm username removido.")
      break
    }

    case "show": {
      const current = guildManager.getLastfmUsername(guildId)
      if (current) {
        await replyTemporary(interaction, `Last.fm username actual: **${current}**`)
      } else {
        await replyTemporary(interaction, "No hay Last.fm username configurado para este servidor.")
      }
      break
    }

    default: {
      await replyTemporary(interaction, "Uso: `/lastfm set <username>`, `/lastfm clear`, `/lastfm show`")
      break
    }
  }
}
