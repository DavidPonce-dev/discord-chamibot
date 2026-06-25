import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js"
import { execute as play } from "@/commands/music/play"
import { execute as queue } from "@/commands/queue/queue"
import { execute as nowplaying } from "@/commands/music/now-playing"
import { execute as help } from "@/commands/general/help"
import { execute as autoplay } from "@/commands/general/autoplay"
import { execute as pause } from "@/commands/playback/pause"
import { execute as resume } from "@/commands/playback/resume"
import { execute as skip } from "@/commands/playback/skip"
import { execute as stop } from "@/commands/playback/stop"
import { remove, shuffle, loop } from "@/commands/queue/queue-control"
import { execute as seek } from "@/commands/music/seek"
import { execute as lastfm } from "@/commands/general/lastfm"

export interface CommandDef {
  name: string
  description: string
  handler: (interaction: ChatInputCommandInteraction) => Promise<void>
  options?: Array<{
    name: string
    description: string
    type: ApplicationCommandOptionType
    required?: boolean
    autocomplete?: boolean
    min_value?: number
  }>
}

export const commands: CommandDef[] = [
  {
    name: "p",
    description: "Reproduce o añade a la cola un tema de YouTube",
    handler: play,
    options: [
      {
        name: "query",
        description: "URL o texto de búsqueda",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: "s",
    description: "Salta al siguiente tema",
    handler: skip,
  },
  {
    name: "q",
    description: "Muestra la cola de reproducción",
    handler: queue,
  },
  {
    name: "pa",
    description: "Pausa la reproducción",
    handler: pause,
  },
  {
    name: "r",
    description: "Reanuda la reproducción",
    handler: resume,
  },
  {
    name: "st",
    description: "Detiene y limpia la cola",
    handler: stop,
  },
  {
    name: "ap",
    description: "Activa/desactiva el autoplay",
    handler: autoplay,
  },
  {
    name: "h",
    description: "Muestra todos los comandos disponibles",
    handler: help,
  },
  {
    name: "sh",
    description: "Mezcla aleatoriamente la cola",
    handler: shuffle,
  },
  {
    name: "rm",
    description: "Elimina un tema de la cola por su posición",
    handler: remove,
    options: [
      {
        name: "position",
        description: "Número de posición en la cola",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 1,
      },
    ],
  },
  {
    name: "np",
    description: "Muestra el tema que se está reproduciendo",
    handler: nowplaying,
  },
  {
    name: "l",
    description: "Cambia el modo de repetición (none / one / all)",
    handler: loop,
  },
  {
    name: "sk",
    description: "Adelanta o atrasa la reproducción",
    handler: seek,
    options: [
      {
        name: "seconds",
        description: "Segundos a avanzar (ej: 120 para 2 minutos)",
        type: ApplicationCommandOptionType.Number,
        required: true,
        min_value: 0,
      },
    ],
  },
  {
    name: "lastfm",
    description: "Configura el usuario de Last.fm para recomendaciones",
    handler: lastfm,
    options: [
      {
        name: "action",
        description: "Acción a realizar (set, clear, show)",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: "username",
        description: "Nombre de usuario de Last.fm",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
]

export function getCommandMap(): Map<string, (interaction: ChatInputCommandInteraction) => Promise<void>> {
  const map = new Map<string, (interaction: ChatInputCommandInteraction) => Promise<void>>()
  for (const cmd of commands) {
    map.set(cmd.name, cmd.handler)
  }
  return map
}

export function getCommandDefinitions() {
  return commands.map(({ name, description, options }) => ({
    name,
    description,
    options: options?.map((opt) => ({
      name: opt.name,
      description: opt.description,
      type: opt.type,
      required: opt.required ?? false,
      ...(opt.autocomplete !== undefined && { autocomplete: opt.autocomplete }),
      ...(opt.min_value !== undefined && { min_value: opt.min_value }),
    })),
  }))
}
