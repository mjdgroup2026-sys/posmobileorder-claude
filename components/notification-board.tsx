"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  acknowledgeNotification,
  acknowledgeAllNotifications,
} from "@/app/actions/notifications"
import Link from "next/link"
import { formatBaht, formatClock, formatDateTime, formatNumber } from "@/lib/format"
import type { CustomerPaidBill, NotificationCard, PaymentAwaitingCallback } from "@/lib/queries"
import { LiveElapsed } from "@/components/live-elapsed"
import { AutoRefresh } from "@/components/auto-refresh"
import { CustomerPaidNotice } from "@/components/customer-paid-notice"
import { IconBell, IconReceipt, IconSpinner, IconWarning } from "@/components/icons"

export function NotificationBoard({
  notifications,
  awaitingCallback = [],
  paidBills = [],
}: {
  notifications: NotificationCard[]
  awaitingCallback?: PaymentAwaitingCallback[]
  paidBills?: CustomerPaidBill[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const waiting = notifications.filter((n) => n.status === "PENDING")
  const done = notifications.filter((n) => n.status === "ACKNOWLEDGED")

  async function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setPending(true)
    try {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? "ทำรายการไม่สำเร็จ")
        return
      }
      toast.success(result.message ?? "ทำรายการเรียบร้อยแล้ว")
      router.refresh()
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  function acknowledge(id: string) {
    const formData = new FormData()
    formData.set("id", id)
    void run(() => acknowledgeNotification(formData))
  }

  function renderCard(item: NotificationCard, urgent: boolean) {
    const isCall = item.type === "CALL_STAFF"
    return (
      <article
        key={item.id}
        className="card-ui card-pad"
        style={{ display: "flex", flexDirection: "column", gap: 8, opacity: urgent ? 1 : 0.8 }}
      >
        <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
          <span className="row" style={{ gap: 8 }}>
            {isCall ? <IconBell size={17} aria-hidden /> : <IconReceipt size={17} aria-hidden />}
            <span style={{ fontWeight: 700 }}>
              โต๊ะ {item.tableCode} · {isCall ? "เรียกพนักงาน" : "ขอเช็กบิล"}
            </span>
          </span>
          <span className={`chip ${urgent ? (isCall ? "chip-danger" : "chip-warning") : "chip-success"}`}>
            <span className="dot" />
            {urgent ? "รอรับทราบ" : "รับทราบแล้ว"}
          </span>
        </div>

        {item.reason ? <p className="t-small">{item.reason}</p> : null}

        {/* 2 จุดเวลาที่ F12 บังคับให้แสดงเสมอ: เวลาที่เปิดโต๊ะ และเปิดมาแล้วกี่นาที */}
        <span className="t-caption">
          เปิดโต๊ะ <span className="num">{formatClock(item.openedAt)}</span> ·{" "}
          <LiveElapsed since={item.openedAt} prefix="เปิดมาแล้ว " />
        </span>

        <span className="row" style={{ justifyContent: "space-between" }}>
          <span className="t-caption">
            แจ้งเมื่อ <span className="num">{formatDateTime(item.createdAt)}</span>
          </span>
          {item.sessionTotal > 0 ? (
            <span className="t-small num" style={{ fontWeight: 600 }}>
              ยอดรวม ฿{formatBaht(item.sessionTotal)}
            </span>
          ) : null}
        </span>

        {urgent ? (
          <button
            type="button"
            className={isCall ? "btn btn-danger btn-block btn-sm" : "btn btn-primary btn-block btn-sm"}
            disabled={pending}
            onClick={() => acknowledge(item.id)}
          >
            รับทราบ
          </button>
        ) : (
          <span className="t-caption">
            ✓ ดำเนินการแล้ว
            {item.acknowledgedByName ? ` โดย ${item.acknowledgedByName}` : ""}
            {item.acknowledgedAt ? ` · ${formatDateTime(item.acknowledgedAt)}` : ""}
          </span>
        )}
      </article>
    )
  }

  return (
    <>
      <AutoRefresh seconds={8} />

      <div className="page-head">
        <div>
          <p className="t-eyebrow">MJD Mobile Order</p>
          <h1 className="t-h1">การแจ้งเตือน</h1>
          <p className="t-body" style={{ marginTop: 4 }}>
            การรับทราบเป็นแค่ป้ายซ้อนทับ ไม่เปลี่ยนสถานะของโต๊ะ
          </p>
        </div>
        {waiting.length > 0 ? (
          <button
            type="button"
            className="btn btn-subtle"
            disabled={pending}
            onClick={() => void run(() => acknowledgeAllNotifications())}
          >
            {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
            รับทราบทั้งหมด
          </button>
        ) : null}
      </div>

      {/* ข่าวดีขึ้นก่อนเสมอ — พนักงานจะได้ไม่ต้องไล่หาว่าโต๊ะที่หายไปจ่ายเรียบร้อยแล้วหรือยัง */}
      <CustomerPaidNotice bills={paidBills} />

      {awaitingCallback.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="t-h3" style={{ color: "var(--warning)" }}>
            รอธนาคารยืนยันนานผิดปกติ · <span className="num">{formatNumber(awaitingCallback.length)}</span>
          </h2>

          <div className="alert-banner warning">
            โต๊ะเหล่านี้ออก QR ให้ลูกค้าไปแล้วเกิน 5 นาที แต่ธนาคารยังไม่ยืนยันว่าเงินเข้า ·
            อาจเป็นเพราะลูกค้ายังไม่ได้จ่าย (ไม่ต้องทำอะไร) หรือเงินเข้าแล้วแต่ธนาคารไม่แจ้งกลับมา ·
            <strong> กรุณาตรวจกับแอปธนาคารก่อนปิดบิล</strong> ระบบจะไม่ปิดบิลให้เองในกรณีนี้
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {awaitingCallback.map((item) => (
              <article
                key={item.intentId}
                className="card-ui card-pad"
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <IconWarning size={17} aria-hidden />
                    <span style={{ fontWeight: 700 }}>โต๊ะ {item.tableCode} · รอธนาคารยืนยัน</span>
                  </span>
                  <span className="chip chip-warning">
                    <span className="dot" />
                    ต้องตรวจสอบ
                  </span>
                </div>

                <span className="t-caption">
                  ออก QR เมื่อ <span className="num">{formatClock(item.issuedAt)}</span> ·{" "}
                  <LiveElapsed since={item.issuedAt} prefix="รอมาแล้ว " />
                </span>

                {/* ref1 คือตัวที่พนักงานเอาไปค้นรายการในแอปธนาคารได้ตรง ๆ */}
                <span className="t-caption">
                  เลขอ้างอิง <span className="num">{item.ref1}</span>
                </span>

                <span className="row" style={{ justifyContent: "space-between" }}>
                  <span className="t-small">ยอดที่ออก QR</span>
                  <span className="t-small num" style={{ fontWeight: 600 }}>
                    ฿{formatBaht(item.amount)}
                  </span>
                </span>

                <Link
                  href={`/mobile-order/tables/${item.tableId}/billing`}
                  className="btn btn-subtle btn-block btn-sm"
                >
                  เปิดหน้าปิดบิลของโต๊ะนี้
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="t-h3" style={{ color: "var(--danger)" }}>
          ต้องการความช่วยเหลือด่วน · <span className="num">{formatNumber(waiting.length)}</span>
        </h2>
        {waiting.length === 0 ? (
          <div className="card-ui card-pad">
            <p className="t-body">ไม่มีการแจ้งเตือนที่รอรับทราบ</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {waiting.map((n) => renderCard(n, true))}
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="t-h3">รับทราบแล้ว</h2>
        {done.length === 0 ? (
          <div className="card-ui card-pad">
            <p className="t-body">ยังไม่มีรายการที่รับทราบ</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {done.map((n) => renderCard(n, false))}
          </div>
        )}
      </section>
    </>
  )
}
