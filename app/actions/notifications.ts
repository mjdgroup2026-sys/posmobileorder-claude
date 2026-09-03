"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { idSchema, firstIssueMessage } from "@/lib/validation"
import type { ActionResult } from "@/lib/types"

const AUTH_ERROR = "กรุณาเข้าสู่ระบบก่อนทำรายการ"

function revalidateNotificationPages() {
  revalidatePath("/mobile-order/tables")
  revalidatePath("/mobile-order/notifications")
}

/// กด "รับทราบ" — ไม่เปลี่ยนสถานะฐานของโต๊ะ (ORDERED/AWAITING_BILL) เป็นแค่ badge ซ้อนทับ (§3 F12)
export async function acknowledgeNotification(formData: FormData): Promise<ActionResult> {
  let user
  try {
    user = await requireUser()
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  const parsed = idSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error) }

  try {
    // ★ conditional update — กันสองคนกดรับทราบพร้อมกันแล้วชื่อผู้รับทราบทับกัน
    const updated = await prisma.notification.updateMany({
      where: { id: parsed.data.id, status: "PENDING" },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: user.id },
    })
    if (updated.count === 0) {
      return { ok: false, error: "การแจ้งเตือนนี้ถูกรับทราบไปแล้ว" }
    }
  } catch {
    return { ok: false, error: "รับทราบการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }

  revalidateNotificationPages()
  return { ok: true, message: "รับทราบการแจ้งเตือนแล้ว" }
}

export async function acknowledgeAllNotifications(): Promise<ActionResult> {
  let user
  try {
    user = await requireUser()
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  try {
    const updated = await prisma.notification.updateMany({
      where: { status: "PENDING" },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: user.id },
    })

    revalidateNotificationPages()
    return {
      ok: true,
      message:
        updated.count === 0
          ? "ไม่มีการแจ้งเตือนที่รอรับทราบ"
          : `รับทราบการแจ้งเตือน ${updated.count} รายการแล้ว`,
    }
  } catch {
    return { ok: false, error: "รับทราบการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }
}
