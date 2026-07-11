import { Client } from "discord.js"

let botClient: Client | null = null

export function getBotClient(): Client | null {
  return botClient
}

export function setBotClient(client: Client | null) {
  botClient = client
}
