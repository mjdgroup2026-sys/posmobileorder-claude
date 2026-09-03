/// origin สาธารณะที่ใช้ฝังใน QR ของลูกค้า
///
/// ลำดับความสำคัญ: APP_BASE_URL → BETTER_AUTH_URL → localhost (dev)
/// ⚠️ ต้องเป็นโดเมนที่ลูกค้าเปิดได้จริงจากมือถือ ไม่ใช่ localhost บนเครื่องพนักงาน
export function publicBaseUrl(): string {
  const raw = process.env.APP_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3001"
  return raw.replace(/\/+$/, "")
}
