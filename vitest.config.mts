import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

/// โมดูลว่างแทน "server-only" — lib/session.ts และ lib/queries.ts import ไว้
/// alias ตรงนี้ทำให้ไม่ต้อง vi.mock("server-only") รายไฟล์
const serverOnlyStub = fileURLToPath(new URL("./__tests__/stubs/server-only.ts", import.meta.url))

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    // environment เริ่มต้นเป็น node — ไฟล์เทส component ให้ใส่ docblock
    // `// @vitest-environment jsdom` ไว้บรรทัดแรกของไฟล์
    // (Vitest 4 ตัด environmentMatchGlobs ออกแล้ว)
    environment: "node",
    globals: false,
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    alias: {
      "server-only": serverOnlyStub,
    },
    // integration test ยิง DB จริง — ห้ามรันไฟล์พร้อมกันเพราะใช้ฐานเดียวกันแล้ว TRUNCATE ชนกัน
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
