import { EmbedBuilder } from "discord.js"
import { EMBED_COLORS } from "../../config/ui"

export function createBaseEmbed(title = "\u{1F3B5} Charmin Charmeleon \u{1F3B5}"): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLORS.primary)
    .setTitle(title)
}
