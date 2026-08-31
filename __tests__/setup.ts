import { existsSync } from "node:fs"
import { config as loadEnv } from "dotenv"
import { afterEach } from "vitest"

/// โหลด .env.test ทับเสมอ — กัน integration test ยิงลงฐาน dev โดยไม่ตั้งใจ
if (existsSync(".env.test")) {
  loadEnv({ path: ".env.test", override: true, quiet: true })
}

/// matcher ของ jest-dom ใช้ได้เฉพาะไฟล์ที่ประกาศ environment jsdom
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest")
  const { cleanup } = await import("@testing-library/react")
  afterEach(() => {
    cleanup()
  })
}
