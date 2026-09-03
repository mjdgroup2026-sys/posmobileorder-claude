"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { submitOrder } from "@/app/actions/customer-order"
import { formatBaht, formatNumber } from "@/lib/format"
import { cartTotal, clearCart, writeCart, type CartLine } from "@/lib/cart-storage"
import { useCart } from "@/lib/use-cart"
import { IconSpinner, IconTrash } from "@/components/icons"

export function CartView({ qrToken, awaitingBill }: { qrToken: string; awaitingBill: boolean }) {
  const router = useRouter()
  const lines = useCart(qrToken)
  const [pending, setPending] = useState(false)

  function update(next: CartLine[]) {
    writeCart(qrToken, next)
  }

  function setQuantity(key: string, quantity: number) {
    if (quantity <= 0) {
      update(lines.filter((l) => l.key !== key))
      return
    }
    update(lines.map((l) => (l.key === key ? { ...l, quantity } : l)))
  }

  async function handleSubmit() {
    if (lines.length === 0) return
    setPending(true)

    const formData = new FormData()
    formData.set("qrToken", qrToken)
    formData.set(
      "items",
      JSON.stringify(
        lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          optionIds: l.optionIds,
          note: l.note ?? "",
        })),
      ),
    )

    try {
      const result = await submitOrder(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      clearCart(qrToken)
      router.push(`/order/${qrToken}/confirmed?order=${result.data?.orderNumber ?? ""}`)
    } catch {
      toast.error("ส่งออร์เดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  const total = cartTotal(lines)

  if (lines.length === 0) {
    return (
      <div className="card-ui card-pad" style={{ textAlign: "center" }}>
        <p className="t-body">ยังไม่มีรายการในตะกร้า</p>
        <Link href={`/order/${qrToken}/menu`} className="btn btn-primary btn-block" style={{ marginTop: 16 }}>
          เลือกเมนู
        </Link>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {awaitingBill ? (
        <div className="alert-banner warning">
          โต๊ะนี้แจ้งเช็กบิลแล้ว จึงส่งออร์เดอร์เพิ่มไม่ได้ — กรุณาแจ้งพนักงานหากต้องการสั่งต่อ
        </div>
      ) : null}

      {lines.map((line) => (
        <article key={line.key} className="card-ui card-pad" style={{ display: "grid", gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontWeight: 600 }}>{line.name}</span>
            <span className="num" style={{ fontWeight: 700 }}>
              ฿{formatBaht(line.unitPrice * line.quantity)}
            </span>
          </div>

          {line.optionNames.length > 0 ? (
            <span className="t-caption">({line.optionNames.join(", ")})</span>
          ) : null}
          {line.note ? <span className="t-caption">โน้ต: {line.note}</span> : null}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-subtle btn-sm btn-icon"
                aria-label={`ลดจำนวน ${line.name}`}
                onClick={() => setQuantity(line.key, line.quantity - 1)}
              >
                −
              </button>
              <span className="num" style={{ minWidth: 28, textAlign: "center", fontWeight: 600 }}>
                {formatNumber(line.quantity)}
              </span>
              <button
                type="button"
                className="btn btn-subtle btn-sm btn-icon"
                aria-label={`เพิ่มจำนวน ${line.name}`}
                onClick={() => setQuantity(line.key, line.quantity + 1)}
              >
                +
              </button>
            </span>
            <button
              type="button"
              className="btn btn-danger btn-sm btn-icon"
              aria-label={`ลบ ${line.name}`}
              onClick={() => setQuantity(line.key, 0)}
            >
              <IconTrash size={15} aria-hidden />
            </button>
          </div>
        </article>
      ))}

      <div className="card-ui card-pad">
        <div className="row" style={{ justifyContent: "space-between", fontWeight: 700 }}>
          <span>ยอดรวม</span>
          <span className="num">฿{formatBaht(total)}</span>
        </div>
        <p className="t-caption" style={{ marginTop: 6 }}>
          ยืนยันแล้วออร์เดอร์จะถูกส่งเข้าครัวทันทีและแก้ไขเองไม่ได้
        </p>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-lg btn-block"
        disabled={pending || awaitingBill}
        onClick={handleSubmit}
      >
        {pending ? <IconSpinner size={18} className="animate-spin" aria-hidden /> : null}
        ยืนยันออร์เดอร์
      </button>

      <Link href={`/order/${qrToken}/menu`} className="btn btn-ghost btn-block">
        สั่งเพิ่ม
      </Link>
    </div>
  )
}
