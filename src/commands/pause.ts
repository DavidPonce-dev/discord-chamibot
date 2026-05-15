import { ChatInputCommandInteraction } from "discord.js";
import { musicManager } from "../music/MusicManager";

export async function execute(interaction: ChatInputCommandInteraction) {
  const queue = musicManager.get(interaction.guildId!);

  if (!queue || !queue.getCurrentTrack()) {
    await interaction.reply({
      content: "No hay nada reproduciéndose",
      ephemeral: true,
    });
    return
  }

  if (queue.isPaused()) {
    await interaction.reply({
      content: "Ya está pausado",
      ephemeral: true,
    });
    return
  }

  queue.pause();
  await interaction.reply("⏸ Pausado");
}
