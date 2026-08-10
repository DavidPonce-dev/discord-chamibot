import { bootstrap } from "./bootstrap"

bootstrap().catch((err: unknown) => {
  console.error("Failed to start bot:", err)
  process.exit(1)
})
