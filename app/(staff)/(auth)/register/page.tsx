"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { IconSpinner } from "@/components/icons"

export default function RegisterPage() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const password = String(form.get("password") ?? "")
    if (password.length < 8) {
      setError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
      return
    }
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน")
      return
    }

    setPending(true)
    const { error: authError } = await authClient.signUp.email({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password,
    })

    if (authError) {
      setPending(false)
      setError(
        authError.status === 422 ? "อีเมลนี้ถูกใช้สมัครไปแล้ว" : "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      )
      return
    }

    toast.success("สมัครสมาชิกสำเร็จ")
    router.push("/")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 className="t-h2">สมัครสมาชิก</h1>
        <p className="t-caption" style={{ marginTop: 4 }}>
          สร้างบัญชีใหม่เพื่อเข้าใช้งานระบบหลังร้าน
        </p>
      </div>

      {error ? <div className="alert-banner danger">{error}</div> : null}

      <div className="field">
        <label className="t-small" htmlFor="name">
          ชื่อผู้ใช้งาน
        </label>
        <input id="name" name="name" className="input" required autoComplete="name" />
      </div>

      <div className="field">
        <label className="t-small" htmlFor="email">
          อีเมล
        </label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" />
      </div>

      <div className="field">
        <label className="t-small" htmlFor="password">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <span className="field-hint">อย่างน้อย 8 ตัวอักษร</span>
      </div>

      <div className="field">
        <label className="t-small" htmlFor="confirmPassword">
          ยืนยันรหัสผ่าน
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          className="input"
          required
          autoComplete="new-password"
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
        สมัครสมาชิก
      </button>

      <p className="t-caption" style={{ textAlign: "center" }}>
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" style={{ color: "var(--brand)", fontWeight: 500 }}>
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
