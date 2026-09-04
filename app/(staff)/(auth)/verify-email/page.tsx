import { Suspense } from "react"
import { VerifyEmailView } from "./verify-email-view"

export const metadata = { title: "ยืนยันอีเมล" }

/// ปลายทางหลังผู้ใช้กดลิงก์ในอีเมล — Better Auth ตรวจ token ที่ `/api/auth/verify-email`
/// แล้ว redirect มาที่นี่พร้อม query `error` เมื่อไม่สำเร็จ (token หมดอายุ/ถูกใช้ไปแล้ว)
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="t-body">กำลังโหลด…</p>}>
      <VerifyEmailView />
    </Suspense>
  )
}
