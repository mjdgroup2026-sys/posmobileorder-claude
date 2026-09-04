"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { IconSpinner } from "@/components/icons"

export function VerifyEmailView() {
  const searchParams = useSearchParams()
  const error = searchParams.get("error")
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      // ตอบเหมือนกันเสมอไม่ว่าอีเมลนี้มีอยู่จริงหรือไม่ — กันคนไล่เดาว่าบัญชีไหนมีในระบบ
      await authClient.sendVerificationEmail({ email, callbackURL: "/verify-email" })
      setSent(true)
      toast.success("ถ้าอีเมลนี้อยู่ในระบบ เราส่งลิงก์ยืนยันไปให้แล้ว")
    } catch {
      toast.error("ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  if (!error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h1 className="t-h2">ยืนยันอีเมลเรียบร้อยแล้ว</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            บัญชีของคุณพร้อมใช้งานแล้ว เข้าสู่ระบบเพื่อเริ่มใช้งานได้เลย
          </p>
        </div>
        <Link href="/login" className="btn btn-primary btn-block">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={resend} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 className="t-h2">ยืนยันอีเมลไม่สำเร็จ</h1>
        <p className="t-caption" style={{ marginTop: 4 }}>
          ลิงก์อาจหมดอายุหรือถูกใช้ไปแล้ว กรอกอีเมลเพื่อขอลิงก์ยืนยันใหม่
        </p>
      </div>

      <div className="alert-banner danger">ลิงก์ยืนยันนี้ใช้ไม่ได้แล้ว</div>

      {sent ? (
        <div className="alert-banner info">
          ถ้าอีเมลนี้อยู่ในระบบ เราส่งลิงก์ยืนยันใหม่ไปให้แล้ว กรุณาตรวจกล่องจดหมาย (รวมถึงเมลขยะ)
        </div>
      ) : null}

      <div className="field">
        <label className="t-small" htmlFor="email">
          อีเมล
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
        ส่งลิงก์ยืนยันอีกครั้ง
      </button>

      <p className="t-caption" style={{ textAlign: "center" }}>
        <Link href="/login" style={{ color: "var(--brand)", fontWeight: 500 }}>
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
