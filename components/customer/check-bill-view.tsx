"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { requestBill } from "@/app/actions/customer-order"
import { formatBaht, formatNumber } from "@/lib/format"
import type { CustomerOrderView } from "@/lib/queries"
import { IconSpinner } from "@/components/icons"

export function CheckBillView({ qrToken, view }: { qrToken: string; view: CustomerOrderView }) {
  const [pending, setPending] = useState(false)
  const [requested, setRequested] = useState(view.awaitingBill)
  const [total, setTotal] = useState(view.total)

  const items = view.orders.flatMap((o) => o.items).filter((i) => i.status !== "CANCELLED")

  async function handleRequest() {
    setPending(true)
    const formData = new FormData()
    formData.set("qrToken", qrToken)

    try {
      const result = await requestBill(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      if (result.data) setTotal(result.data.total)
      setRequested(true)
    } catch {
      toast.error("เช็กบิลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section className="card-ui card-pad">
        <h2 className="t-h3" style={{ marginBottom: 10 }}>
          สรุปรายการ
        </h2>
        {items.length === 0 ? (
          <p className="t-body">ยังไม่มีรายการในบิลนี้</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item) => (
              <li key={item.id} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                <span>
                  <span className="num" style={{ fontWeight: 700 }}>
                    {formatNumber(item.quantity)}×
                  </span>{" "}
                  {item.menuItemName}
                </span>
                <span className="num">฿{formatBaht(item.subtotal)}</span>
              </li>
            ))}
          </ul>
        )}

        <div
          className="row"
          style={{
            justifyContent: "space-between",
            fontWeight: 700,
            fontSize: "1.05rem",
            borderTop: "1px solid var(--line)",
            marginTop: 12,
            paddingTop: 12,
          }}
        >
          <span>ยอดรวม</span>
          <span className="num">฿{formatBaht(total)}</span>
        </div>
      </section>

      <Link
        href={`/order/${qrToken}/pay`}
        className="btn btn-primary btn-lg btn-block"
        aria-disabled={items.length === 0}
      >
        ชำระเงินเอง (พร้อมเพย์/บัตร)
      </Link>

      {requested ? (
        <>
          <div className="alert-banner info">
            แจ้งพนักงานเช็กบิลแล้ว กรุณารอสักครู่ — พนักงานจะมาที่โต๊ะเพื่อรับชำระเงิน
          </div>
          <Link href={`/order/${qrToken}/status`} className="btn btn-subtle btn-block">
            กลับไปดูสถานะออร์เดอร์
          </Link>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={pending || items.length === 0}
          onClick={handleRequest}
        >
          {pending ? <IconSpinner size={18} className="animate-spin" aria-hidden /> : null}
          ขอเช็กบิล
        </button>
      )}

      <p className="t-caption" style={{ textAlign: "center" }}>
        ชำระเองผ่านพร้อมเพย์ได้ทันที หรือกด &ldquo;ขอเช็กบิล&rdquo; ให้พนักงานมารับชำระที่โต๊ะ
      </p>
    </div>
  )
}
