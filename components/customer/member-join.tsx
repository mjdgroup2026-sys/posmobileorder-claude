"use client"

import { useState } from "react"
import { toast } from "sonner"
import { registerMember, type RegisterMemberResult } from "@/app/actions/members"
import { BAHT_PER_POINT, pointsFor } from "@/lib/points"
import { formatNumber } from "@/lib/format"
import type { FieldErrors } from "@/lib/types"
import { IconSpinner } from "@/components/icons"

/// สมัครสมาชิกด้วยเบอร์โทรบนหน้า payment-success (F22)
/// เบอร์ซ้ำ = เข้าบัญชีเดิม ไม่สร้างใหม่ · แต้มผูกกับบิลนี้บิลเดียว กดซ้ำไม่ได้แต้มเพิ่ม
export function MemberJoin({ qrToken, saleTotal }: { qrToken: string; saleTotal: number }) {
  const [phone, setPhone] = useState("")
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [done, setDone] = useState<RegisterMemberResult | null>(null)

  const previewPoints = pointsFor(saleTotal)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setFieldErrors({})

    const formData = new FormData()
    formData.set("qrToken", qrToken)
    formData.set("phone", phone)

    try {
      const result = await registerMember(formData)
      if (!result.ok) {
        toast.error(result.error)
        setFieldErrors(result.fieldErrors ?? {})
        return
      }
      toast.success(result.message)
      if (result.data) setDone(result.data)
    } catch {
      toast.error("สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <section className="card-ui card-pad" style={{ textAlign: "center" }}>
        <h2 className="t-h3">{done.alreadyMember ? "ยินดีต้อนรับกลับ" : "สมัครสมาชิกเรียบร้อย"}</h2>
        <p className="t-body" style={{ marginTop: 6 }}>
          เบอร์ <span className="num">{done.phone}</span>
        </p>
        <p className="t-h1 num" style={{ marginTop: 10 }}>
          {formatNumber(done.pointBalance)} แต้ม
        </p>
        <p className="t-caption">
          {done.alreadyAwarded
            ? "บิลนี้รับแต้มไปแล้ว"
            : `บิลนี้ได้เพิ่ม ${formatNumber(done.earnedPoints)} แต้ม`}
        </p>
      </section>
    )
  }

  return (
    <section className="card-ui card-pad">
      <h2 className="t-h3">สะสมแต้มจากบิลนี้</h2>
      <p className="t-caption" style={{ marginTop: 4, marginBottom: 12 }}>
        กรอกเบอร์โทรเพื่อรับ <span className="num">{formatNumber(previewPoints)}</span> แต้มจากบิลนี้ทันที
        (ทุก {BAHT_PER_POINT} บาท = 1 แต้ม) · เคยสมัครแล้วกรอกเบอร์เดิมได้เลย
      </p>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field">
          <label className="t-small" htmlFor="phone">
            เบอร์โทร
          </label>
          <input
            id="phone"
            className="input num"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={20}
            placeholder="0812345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {fieldErrors.phone ? <span className="field-hint error">{fieldErrors.phone}</span> : null}
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
          รับแต้ม
        </button>
      </form>
    </section>
  )
}
