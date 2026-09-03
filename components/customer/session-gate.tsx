"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { openTableSession } from "@/app/actions/tables"

/// หน้าแรกหลังสแกน QR — เปิด session ให้อัตโนมัติแล้วพาเข้าเมนู (ไม่ต้องรอพนักงาน, §3)
/// สแกนซ้ำที่โต๊ะเดิมจะได้ session เดิม เพราะ action คืนของเดิมให้เมื่อยังเปิดอยู่
export function SessionGate({ qrToken }: { qrToken: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // React 18+ ใน dev เรียก effect ซ้ำสองรอบ — กันเปิดโต๊ะซ้อน (server ก็กันอีกชั้นอยู่แล้ว)
    if (started.current) return
    started.current = true

    const formData = new FormData()
    formData.set("qrToken", qrToken)

    openTableSession(formData)
      .then((result) => {
        if (!result.ok) {
          setError(result.error)
          return
        }
        router.replace(`/order/${qrToken}/menu`)
      })
      .catch(() => setError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"))
  }, [qrToken, router])

  return (
    <main style={{ padding: 24, display: "grid", placeItems: "center", minHeight: "100dvh" }}>
      <div className="card-ui card-pad" style={{ textAlign: "center", maxWidth: 360 }}>
        {error ? (
          <>
            <h1 className="t-h2">เปิดโต๊ะไม่ได้</h1>
            <p className="t-body" style={{ marginTop: 10 }}>
              {error}
            </p>
          </>
        ) : (
          <>
            <h1 className="t-h2">กำลังเปิดโต๊ะ…</h1>
            <p className="t-body" style={{ marginTop: 10 }}>
              รอสักครู่ ระบบกำลังพาไปที่เมนูอาหาร
            </p>
          </>
        )}
      </div>
    </main>
  )
}
