"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { IconSpinner } from "@/components/icons"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/"
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const { error: authError } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    })

    if (authError) {
      setPending(false)
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
      return
    }

    toast.success("เข้าสู่ระบบสำเร็จ")
    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 className="t-h2">เข้าสู่ระบบ</h1>
        <p className="t-caption" style={{ marginTop: 4 }}>
          กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งานระบบหลังร้าน
        </p>
      </div>

      {error ? <div className="alert-banner danger">{error}</div> : null}

      <div className="field">
        <label className="t-small" htmlFor="email">
          อีเมล
        </label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" />
      </div>

      <div className="field">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="t-small" htmlFor="password">
            รหัสผ่าน
          </label>
          <Link href="/forgot-password" className="t-caption" style={{ color: "var(--brand)" }}>
            ลืมรหัสผ่าน?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          required
          autoComplete="current-password"
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
        เข้าสู่ระบบ
      </button>

      <p className="t-caption" style={{ textAlign: "center" }}>
        ยังไม่มีบัญชี?{" "}
        <Link href="/register" style={{ color: "var(--brand)", fontWeight: 500 }}>
          สมัครสมาชิก
        </Link>
      </p>
    </form>
  )
}
