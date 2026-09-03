"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { callStaff } from "@/app/actions/customer-order"
import { IconSpinner } from "@/components/icons"

const PRESETS = ["ขอน้ำเปล่าเพิ่ม", "ขอช้อนส้อมเพิ่ม", "ขอกระดาษทิชชู", "ขอเพิ่มเก้าอี้", "สอบถามเมนู"]

export function CallStaffForm({ qrToken }: { qrToken: string }) {
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(text: string) {
    setPending(true)
    const formData = new FormData()
    formData.set("qrToken", qrToken)
    formData.set("reason", text)

    try {
      const result = await callStaff(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      setSent(true)
    } catch {
      toast.error("เรียกพนักงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className="card-ui card-pad" style={{ textAlign: "center" }}>
        <h1 className="t-h2">แจ้งพนักงานแล้ว</h1>
        <p className="t-body" style={{ marginTop: 10 }}>
          พนักงานได้รับแจ้งแล้ว กำลังไปที่โต๊ะของคุณ
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <Link href={`/order/${qrToken}/status`} className="btn btn-primary btn-block">
            กลับไปดูสถานะออร์เดอร์
          </Link>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setSent(false)}>
            แจ้งเรื่องอื่นเพิ่ม
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section className="card-ui card-pad">
        <h2 className="t-h3" style={{ marginBottom: 10 }}>
          เลือกเรื่องที่ต้องการ
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="btn btn-subtle btn-sm"
              disabled={pending}
              onClick={() => void submit(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </section>

      <section className="card-ui card-pad">
        <div className="field">
          <label className="t-small" htmlFor="reason">
            หรือพิมพ์เอง
          </label>
          <input
            id="reason"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ขอซอสพริกเพิ่ม"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 12 }}
          disabled={pending}
          onClick={() => void submit(reason)}
        >
          {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
          เรียกพนักงาน
        </button>
      </section>
    </div>
  )
}
