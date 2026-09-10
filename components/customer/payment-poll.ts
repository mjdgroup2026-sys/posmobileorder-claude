"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { CustomerPaymentStatus } from "@/lib/queries"

/// โพลสถานะการชำระเงินแล้วพาไปหน้า "จ่ายสำเร็จ" ทันทีที่บิลถูกปิด
///
/// ใช้ทั้งฝั่ง PromptPay (webhook ปิดบิลให้เอง) และฝั่ง Card (พนักงานกดยืนยันที่เคาน์เตอร์) —
/// ลูกค้าไม่ต้องกดอะไรเพิ่มทั้งสองทาง ตาม F17 · หยุดโพลเมื่อแท็บถูกซ่อนเพื่อไม่กินเน็ตมือถือ
///
/// ⚠️ **ห้ามหยุดโพลเพราะ QR บนจอหมดอายุ** — นาฬิกาถอยหลังบนจอเป็นของฝั่งเราเท่านั้น
/// QR ที่อยู่ในแอปธนาคารของลูกค้ายังจ่ายได้จริงหลังจากนั้น (เจอจริง 2026-09-10: ลูกค้าจ่ายสำเร็จ
/// หลังนาฬิกาหมด บิลปิดเรียบร้อยฝั่งร้าน แต่จอลูกค้าเลิกโพลไปแล้วเลยค้างที่ "QR หมดอายุ"
/// ไม่ขึ้นใบเสร็จให้เลย) · ให้ชะลอจังหวะโพลแทนการหยุด
export function usePaymentPoll(qrToken: string, enabled: boolean, intervalMs = 4000) {
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

    const timer = setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [qrToken, enabled, paid, intervalMs, router])

  return paid
}
