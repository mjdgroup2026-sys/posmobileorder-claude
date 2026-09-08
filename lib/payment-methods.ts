import "server-only"
import { isPromptPayConfigured } from "@/lib/promptpay"
import { isScbConfigured } from "@/lib/payment-provider/scb"

/// "ร้านนี้รับชำระด้วย QR ได้ไหม" — กติกาเดียวที่ทุกหน้าต้องใช้ร่วมกัน
///
/// มีสองทางที่ออก QR ได้ และมีทางใดทางหนึ่งก็พอ:
///   1. ต่อ SCB ไว้ → ธนาคารออก QR ให้ ซึ่งพก ref1 ไปด้วย จึงปิดบิลอัตโนมัติได้
///   2. ตั้ง PROMPTPAY_ID ไว้ → สร้าง QR พร้อมเพย์เอง จ่ายได้เหมือนกันแต่พนักงานต้องกดยืนยัน
///
/// ⚠️ เคยพลาดมาแล้ว: ตอนต่อ SCB แก้แค่หน้า pay/promptpay ให้เรียก SCB แต่ลืมหน้า pay
/// ที่เป็นตัวเลือกวิธีชำระเงิน ซึ่งยังเช็คแค่ PROMPTPAY_ID อยู่ ผลคือตั้ง SCB ครบแล้วแต่ปุ่ม
/// "ชำระด้วยพร้อมเพย์" ยังถูกปิด ขึ้นว่า "ร้านยังไม่ได้เปิดใช้งานพร้อมเพย์" — ลูกค้าจ่ายไม่ได้เลย
/// ทั้งที่ระบบพร้อมทุกอย่าง · ห้ามเช็ค isPromptPayConfigured() ตรง ๆ ในหน้าใดอีก ให้เรียกฟังก์ชันนี้
export function isQrPaymentAvailable(): boolean {
  return isScbConfigured() || isPromptPayConfigured()
}
