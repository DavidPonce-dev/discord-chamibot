import { EmbedBuilder } from "discord.js"
import { EMBED_COLORS } from "@/config/ui"

export function createBaseEmbed(title = "\ud83c\udfb5 Charmin Charmeleon \ud83c\udfb5") {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.primary)
    .setTitle(title)
}
