import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // สำหรับ Docker (Phase 4) — build แล้วได้ .next/standalone ที่มี server.js + node_modules
  // เฉพาะที่ใช้จริง ทำให้ image เล็กลงมากและไม่ต้องติดตั้ง dependencies ซ้ำในขั้น runtime
  output: "standalone",
}

export default nextConfig
