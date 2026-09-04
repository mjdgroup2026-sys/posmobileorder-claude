/// origin สาธารณะที่ใช้ฝังใน QR ของลูกค้า
///
/// ลำดับความสำคัญ: APP_BASE_URL → BETTER_AUTH_URL → localhost (dev)
/// ⚠️ ต้องเป็นโดเมนที่ลูกค้าเปิดได้จริงจากมือถือ ไม่ใช่ localhost บนเครื่องพนักงาน
/// 🔥 ห้ามใช้ `??` ล้วนกับ env พวกนี้ — docker compose ยัด `${APP_BASE_URL:-}` เป็น
///    **string ว่าง** ไม่ใช่ undefined ตัวแปรจึงมีค่าอยู่จริงและ `??` ไม่ fallback ให้
///    ผลคือ QR ของโต๊ะได้ค่าเป็น "/order/<token>" เฉย ๆ ซึ่งไม่ใช่ URL — มือถือที่สแกน
///    เอาไปค้น Google แทนที่จะเปิดเว็บ (เจอจริงบน production)
function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return "http://localhost:3001"
}

export function publicBaseUrl(): string {
  return firstNonEmpty(process.env.APP_BASE_URL, process.env.BETTER_AUTH_URL).replace(/\/+$/, "")
}
