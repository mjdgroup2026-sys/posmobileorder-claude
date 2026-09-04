/// อัตราแต้มสมาชิก: 1 แต้มต่อ 25 บาท (ปัดลง) — ค่าคงที่ตาม §3 CRM/สมาชิก (MVP)
///
/// อยู่นอกไฟล์ `"use server"` โดยจำเป็น — ไฟล์ Server Action export ได้เฉพาะ async function
/// เท่านั้น ค่าคงที่กับฟังก์ชันซิงก์จึงต้องอยู่ที่นี่ และหน้าจอฝั่ง client ก็ import ได้ด้วย
export const BAHT_PER_POINT = 25

export function pointsFor(total: number): number {
  return Math.floor(total / BAHT_PER_POINT)
}
