"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { formatBaht } from "@/lib/format"
import { IconSpinner } from "@/components/icons"
import { usePaymentPoll } from "@/components/customer/payment-poll"

/// QR พร้อมเพย์หมดอายุใน 15 นาที — นานพอสำหรับการเปิดแอปธนาคาร แต่ไม่นานจนยอดในจอเก่ากว่าบิลจริง
/// (ลูกค้าสั่งเพิ่มระหว่างรอ = ยอดเปลี่ยน ต้องสร้าง QR ใหม่)
const EXPIRE_SECONDS = 15 * 60

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function PromptPayView({
  qrToken,
  total,
  imageDataUrl,
}: {
  qrToken: string
  total: number
  imageDataUrl: string
}) {
  const [remaining, setRemaining] = useState(EXPIRE_SECONDS)
  const paid = usePaymentPoll(qrToken, remaining > 0)

  useEffect(() => {
    const timer = setInterval(() => setRemaining((value) => (value > 0 ? value - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [])

  const expired = remaining === 0 && !paid

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section className="card-ui card-pad" style={{ textAlign: "center" }}>
        <p className="t-small">ยอดที่ต้องชำระ</p>
        <p className="t-h1 num" style={{ marginTop: 2 }}>
          ฿{formatBaht(total)}
        </p>

        <div style={{ position: "relative", marginTop: 14 }}>
          {/* ภาพ QR ถูกสร้างเป็น data URL ฝั่ง server แล้ว — หน้าเว็บไม่ต้องโหลดไลบรารี QR ลงมือถือ */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="QR Code พร้อมเพย์สำหรับชำระเงิน"
            style={{ width: "100%", maxWidth: 280, margin: "0 auto", display: "block", opacity: expired ? 0.25 : 1 }}
          />
          {expired ? (
            <p
              className="t-body"
              style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 600 }}
            >
              QR หมดอายุแล้ว
            </p>
          ) : null}
        </div>

        <p className="t-caption" style={{ marginTop: 10 }}>
          เปิดแอปธนาคาร → สแกน QR → ชำระเงิน · ระบบจะปิดบิลให้อัตโนมัติเมื่อได้รับการยืนยันจากธนาคาร
        </p>
      </section>

      {expired ? (
        <>
          <div className="alert-banner warning">
            QR หมดอายุแล้ว กรุณากดสร้างใหม่ หรือแจ้งพนักงานเพื่อชำระที่เคาน์เตอร์
          </div>
          <Link href={`/order/${qrToken}/pay`} className="btn btn-primary btn-lg btn-block">
            สร้าง QR ใหม่
          </Link>
        </>
      ) : (
        <p className="row t-small" style={{ justifyContent: "center", gap: 8 }}>
          <IconSpinner size={16} className="animate-spin" aria-hidden />
          รอการยืนยันจากธนาคาร · QR หมดอายุใน <span className="num">{mmss(remaining)}</span>
        </p>
      )}

      <Link href={`/order/${qrToken}/pay`} className="btn btn-ghost btn-block">
        เปลี่ยนวิธีชำระเงิน
      </Link>
    </div>
  )
}
