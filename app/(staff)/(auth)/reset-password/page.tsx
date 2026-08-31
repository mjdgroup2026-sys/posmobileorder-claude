import { Suspense } from "react"
import { ResetPasswordForm } from "./reset-password-form"

export const metadata = { title: "ตั้งรหัสผ่านใหม่" }

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="t-body">กำลังโหลด…</p>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
