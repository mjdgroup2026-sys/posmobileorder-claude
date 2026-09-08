import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // สำหรับ Docker (Phase 4) — build แล้วได้ .next/standalone ที่มี server.js + node_modules
  // เฉพาะที่ใช้จริง ทำให้ image เล็กลงมากและไม่ต้องติดตั้ง dependencies ซ้ำในขั้น runtime
  output: "standalone",

  // หน้า HTML/RSC ต้องให้เบราว์เซอร์ถามกลับทุกครั้ง ห้ามกินของเก่าในแคช
  //
  // ของเดิม: หน้าที่ prerender ไว้ (เช่น /login) ถูกส่งด้วย `Cache-Control: s-maxage=31536000`
  // ซึ่งสั่งให้ shared cache (proxy ของ ISP/CDN) เก็บไว้ 1 ปีเต็ม พอ deploy รอบใหม่
  // Next.js เปลี่ยนชื่อไฟล์ chunk ทั้งชุดและลบของเก่าทิ้งไปกับคอนเทนเนอร์เดิม
  // เบราว์เซอร์ที่ยังถือ HTML เก่าจึงไปขอ chunk ที่ 404 ไปแล้ว → หน้าขาว
  // (อาการจริงที่เจอ 2026-09-08: เปิด incognito ได้ แต่โปรไฟล์ปกติเข้าไม่ได้)
  //
  // `no-cache` ไม่ได้แปลว่าห้ามเก็บ — เก็บได้แต่ต้องถามกลับก่อนใช้เสมอ ปกติจะได้ 304
  // ตัวเปล่า ๆ จาก ETag ที่ Next.js ใส่มาให้อยู่แล้ว จึงแทบไม่เปลืองแบนด์วิดท์เพิ่ม
  // แต่พอ deploy ใหม่ ETag เปลี่ยน ผู้ใช้จะได้ HTML ชุดใหม่ทันทีโดยไม่ต้องล้างแคชเอง
  //
  // ยกเว้นสองกลุ่ม:
  //   `/_next/` — ไฟล์ใต้ `/_next/static/` มี hash อยู่ในชื่อไฟล์ จึงแคชยาว 1 ปีแบบ immutable
  //               ได้อย่างปลอดภัย (nginx บน VPS ก็ตั้ง `expires 1y` ไว้ตรงกัน)
  //   `/api/`   — route handler ตั้ง Cache-Control ของตัวเองตามความหมายของแต่ละเส้นทาง
  //               เช่น /api/health ตั้ง `no-store` ไว้ ไม่ให้ตัวตรวจสุขภาพอ่านผลเก่า
  async headers() {
    return [
      {
        source: "/:path((?!_next/|api/).*)",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ]
  },
}

export default nextConfig
