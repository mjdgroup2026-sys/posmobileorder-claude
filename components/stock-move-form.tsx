"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { ActionResult, FieldErrors } from "@/lib/types"
import { IconSpinner } from "@/components/icons"

type ProductOption = {
  id: string
  sku: string
  name: string
  unit: string
  quantity: number
}

type Props = {
  products: ProductOption[]
  action: (formData: FormData) => Promise<ActionResult>
  mode: "in" | "out"
}

export function StockMoveForm({ products, action, mode }: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [selectedId, setSelectedId] = useState("")

  const selected = products.find((p) => p.id === selectedId)
  const isOut = mode === "out"

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setFieldErrors({})

    try {
      const result = await action(new FormData(event.currentTarget))

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }

      toast.success(result.message)
      formRef.current?.reset()
      setSelectedId("")
      router.refresh()
    } catch {
      // Server Action reject (เน็ตหลุด / server restart / deployment skew)
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      // ต้องปลด pending เสมอ ไม่งั้นปุ่มค้าง disabled ถาวรจนกว่าผู้ใช้จะ reload เอง
      setPending(false)
    }
  }

  if (products.length === 0) {
    return (
      <div className="alert-banner info">
        ยังไม่มีสินค้าในระบบ — กรุณาเพิ่มสินค้าที่หน้า “สินค้า” ก่อนทำรายการ
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="field">
        <label className="t-small" htmlFor="productId">
          สินค้า <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <select
          id="productId"
          name="productId"
          className="select"
          required
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">— เลือกสินค้า —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku}) · คงเหลือ {p.quantity} {p.unit}
            </option>
          ))}
        </select>
        {fieldErrors.productId ? <span className="field-hint error">{fieldErrors.productId}</span> : null}
      </div>

      <div className="field">
        <label className="t-small" htmlFor="quantity">
          จำนวน <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          min={1}
          step={1}
          max={isOut && selected ? selected.quantity : undefined}
          className="input num"
          required
          placeholder="0"
        />
        {fieldErrors.quantity ? (
          <span className="field-hint error">{fieldErrors.quantity}</span>
        ) : selected ? (
          <span className="field-hint">
            {isOut
              ? `เบิกได้ไม่เกิน ${selected.quantity} ${selected.unit}`
              : `คงเหลือปัจจุบัน ${selected.quantity} ${selected.unit}`}
          </span>
        ) : null}
      </div>

      <div className="field">
        <label className="t-small" htmlFor="note">
          หมายเหตุ
        </label>
        <textarea
          id="note"
          name="note"
          className="input"
          rows={3}
          placeholder={isOut ? "ผู้เบิก / แผนก / เหตุผล" : "เลขที่ใบรับ / ผู้ส่งของ"}
        />
        {fieldErrors.note ? <span className="field-hint error">{fieldErrors.note}</span> : null}
      </div>

      <button
        type="submit"
        className={`btn ${isOut ? "btn-primary" : "btn-primary"} btn-lg`}
        disabled={pending}
      >
        {pending ? <IconSpinner size={18} className="animate-spin" aria-hidden /> : null}
        {isOut ? "บันทึกการเบิกจ่าย" : "บันทึกการรับเข้า"}
      </button>
    </form>
  )
}
