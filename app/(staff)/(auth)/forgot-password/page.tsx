"use client"

import { useState } from "react"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"
import { IconBack, IconCheck, IconSpinner } from "@/components/icons"

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const { error: authError } = await authClient.requestPasswordReset({
      email: String(form.get("email") ?? ""),
      redirectTo: "/reset-password",
    })

    setPending(false)
    if (authError) {
      setError("ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
      return
    }
    // ไม่บอกว่าอีเมลมีอยู่จริงหรือไม่ — กันการไล่เดาว่าบัญชีไหนมีในระบบ
    setSent(true)
  }

  if (sent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <IconCheck size={22} style={{ color: "var(--success)" }} aria-hidden />
          <h1 className="t-h2">ตรวจอีเมลของคุณ</h1>
        </div>
        <p className="t-body">
          ถ้าอีเมลนี้มีบัญชีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว ลิงก์มีอายุจำกัด
          กรุณาตรวจกล่องจดหมายและโฟลเดอร์ขยะ
        </p>
        <Link href="/login" className="btn btn-subtle btn-block">
          <IconBack size={16} aria-hidden /> กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 className="t-h2">ลืมรหัสผ่าน</h1>
        <p className="t-caption" style={{ marginTop: 4 }}>
          กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้
        </p>
      </div>

      {error ? <div className="alert-banner danger">{error}</div> : null}

      <div className="field">
        <label className="t-small" htmlFor="email">
          อีเมล
        </label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
        ส่งลิงก์ตั้งรหัสผ่านใหม่
      </button>

      <Link href="/login" className="t-caption" style={{ textAlign: "center", color: "var(--brand)" }}>
        กลับไปหน้าเข้าสู่ระบบ
      </Link>
    </form>
  )
}
