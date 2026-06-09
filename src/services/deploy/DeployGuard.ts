import { logger } from "@/utils/logger"

let deployMode = false

export function isDeployMode(): boolean {
  return deployMode
}

export function enableDeployMode() {
  deployMode = true
  logger.info("deploy", "Deploy mode enabled — blocking new playback")
}

export function disableDeployMode() {
  deployMode = false
  logger.info("deploy", "Deploy mode disabled — service restored")
}
