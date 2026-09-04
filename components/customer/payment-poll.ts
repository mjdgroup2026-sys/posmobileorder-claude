"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { CustomerPaymentStatus } from "@/lib/queries"

/// โพลสถานะการชำระเงินทุก 4 วินาที แล้วพาไปหน้า "จ่ายสำเร็จ" ทันทีที่บิลถูกปิด
///
/// ใช้ทั้งฝั่ง PromptPay (webhook ปิดบิลให้เอง) และฝั่ง Card (พนักงานกดยืนยันที่เคาน์เตอร์) —
/// ลูกค้าไม่ต้องกดอะไรเพิ่มทั้งสองทาง ตาม F17 · หยุดโพลเมื่อแท็บถูกซ่อนเพื่อไม่กินเน็ตมือถือ
export function usePaymentPoll(qrToken: string, enabled: boolean) {
  const router = useRouter()
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    if (!enabled || paid) return
    let cancelled = false

    async function poll() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      try {
        const response = await fetch(`/api/order/${qrToken}/payment`, { cache: "no-store" })
        if (!response.ok) return
        const data = (await response.json()) as { ok: boolean; status?: CustomerPaymentStatus }
        if (cancelled || !data.ok || data.status?.state !== "PAID") return
        setPaid(true)
        router.replace(`/order/${qrToken}/pay/success`)
      } catch {
        // เน็ตมือถือสะดุดเป็นเรื่องปกติ — รอบถัดไปดึงใหม่เอง
      }
    }

    const timer = setInterval(poll, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [qrToken, enabled, paid, router])

  return paid
}
