import { Suspense } from "react"
import { LoginForm } from "./login-form"

export const metadata = { title: "เข้าสู่ระบบ" }

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="t-body">กำลังโหลด…</p>}>
      <LoginForm />
    </Suspense>
  )
}
