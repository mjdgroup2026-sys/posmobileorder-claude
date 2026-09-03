"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import {
  openTableSchema,
  mergeTablesSchema,
  unmergeTableSchema,
  cancelSessionSchema,
  firstIssueMessage,
  zodToFieldErrors,
} from "@/lib/validation"
import type { TableSessionStatus } from "@/generated/prisma/client"
import type { ActionResult, FieldErrors } from "@/lib/types"

const AUTH_ERROR = "กรุณาเข้าสู่ระบบก่อนทำรายการ"

/// สถานะ session ที่ยังถือว่า "โต๊ะเปิดอยู่"
const LIVE_SESSION_STATUS: TableSessionStatus[] = ["OPEN", "AWAITING_BILL"]

function revalidateTablePages() {
  revalidatePath("/mobile-order/tables")
  revalidatePath("/mobile-order/notifications")
  revalidatePath("/mobile-order/kitchen")
}

class TableAbort extends Error {
  constructor(readonly failure: { error: string; fieldErrors?: FieldErrors }) {
    super("TABLE_ABORT")
  }
}

export type OpenSessionResult = { sessionId: string; tableId: string; tableCode: string; reused: boolean }

/// เปิดโต๊ะ — ใช้ได้ทั้งตอนลูกค้าสแกน QR (qrToken) และตอนพนักงานกดเปิดเอง (tableId)
///
/// กติกา (§3 Table Session Lifecycle):
/// - สแกนซ้ำที่โต๊ะที่มี session OPEN/AWAITING_BILL อยู่แล้ว → คืน session เดิม ไม่สร้างซ้ำ
/// - โต๊ะที่ถูกรวมเข้าโต๊ะอื่น (primaryTableId != null) → เด้งไปที่ session ของโต๊ะหลัก
/// - QR ที่ INVALIDATED แล้ว → ไม่เปิดให้ ต้องให้พนักงานพิมพ์ใบใหม่
export async function openTableSession(formData: FormData): Promise<ActionResult<OpenSessionResult>> {
  // ลูกค้าที่สแกน QR ยังไม่ได้ล็อกอิน — ทางนี้จึงไม่บังคับ requireUser()
  // ส่วนการเปิดด้วย tableId (พนักงาน) บังคับล็อกอินเสมอ
  const parsed = openTableSchema.safeParse({
    tableId: formData.get("tableId") ?? undefined,
    qrToken: formData.get("qrToken") ?? undefined,
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error),
      fieldErrors: zodToFieldErrors(parsed.error),
    }
  }

  const { tableId, qrToken } = parsed.data

  if (!qrToken) {
    try {
      await requireUser()
    } catch {
      return { ok: false, error: AUTH_ERROR }
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let qrCodeId: string | undefined
      let targetTableId = tableId

      if (qrToken) {
        const qr = await tx.qRCode.findUnique({
          where: { token: qrToken },
          select: { id: true, tableId: true, status: true },
        })
        if (!qr) throw new TableAbort({ error: "ไม่พบ QR Code นี้ในระบบ กรุณาแจ้งพนักงาน" })
        if (qr.status === "INVALIDATED") {
          throw new TableAbort({ error: "QR Code นี้ใช้ไม่ได้แล้ว กรุณาแจ้งพนักงานให้เปิดโต๊ะใหม่" })
        }
        qrCodeId = qr.id
        targetTableId = qr.tableId
      }

      const table = await tx.table.findUnique({
        where: { id: targetTableId },
        select: { id: true, code: true, status: true, primaryTableId: true },
      })
      if (!table) throw new TableAbort({ error: "ไม่พบโต๊ะที่ต้องการเปิด" })

      // โต๊ะรองที่ถูกรวมแล้ว — ทุกอย่างวิ่งไปที่ session ของโต๊ะหลัก
      const effectiveTableId = table.primaryTableId ?? table.id
      const effectiveTable =
        table.primaryTableId === null
          ? table
          : await tx.table.findUniqueOrThrow({
              where: { id: table.primaryTableId },
              select: { id: true, code: true, status: true, primaryTableId: true },
            })

      const existing = await tx.tableSession.findFirst({
        where: { tableId: effectiveTableId, status: { in: LIVE_SESSION_STATUS } },
        orderBy: { openedAt: "desc" },
        select: { id: true },
      })
      if (existing) {
        return { sessionId: existing.id, tableId: effectiveTableId, tableCode: effectiveTable.code, reused: true }
      }

      if (table.primaryTableId !== null) {
        throw new TableAbort({ error: `โต๊ะ ${table.code} ถูกรวมกับโต๊ะ ${effectiveTable.code} อยู่ กรุณาแจ้งพนักงาน` })
      }

      // ★ conditional update — ด่านเดียวที่กันการสร้าง session ซ้ำตอนสแกนพร้อมกันสองเครื่อง
      //   (pattern เดียวกับกันขายเกินสต็อกในกติกาข้อ 4)
      const claimed = await tx.table.updateMany({
        where: { id: effectiveTableId, status: "EMPTY" },
        data: { status: "OPEN_NO_ORDER" },
      })
      if (claimed.count === 0) {
        const again = await tx.tableSession.findFirst({
          where: { tableId: effectiveTableId, status: { in: LIVE_SESSION_STATUS } },
          orderBy: { openedAt: "desc" },
          select: { id: true },
        })
        if (again) {
          return { sessionId: again.id, tableId: effectiveTableId, tableCode: effectiveTable.code, reused: true }
        }
        throw new TableAbort({ error: `โต๊ะ ${effectiveTable.code} ไม่พร้อมเปิด กรุณาแจ้งพนักงาน` })
      }

      const session = await tx.tableSession.create({
        data: { tableId: effectiveTableId, qrCodeId },
        select: { id: true },
      })

      return { sessionId: session.id, tableId: effectiveTableId, tableCode: effectiveTable.code, reused: false }
    })

    revalidateTablePages()
    return {
      ok: true,
      message: result.reused ? `กลับเข้าโต๊ะ ${result.tableCode}` : `เปิดโต๊ะ ${result.tableCode} เรียบร้อยแล้ว`,
      data: result,
    }
  } catch (error) {
    if (error instanceof TableAbort) return { ok: false, ...error.failure }
    return { ok: false, error: "เปิดโต๊ะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }
}

/// รวมโต๊ะ — โต๊ะรองต้องว่างเท่านั้น และบิลทั้งหมดหลังจากนี้วิ่งเข้า session ของโต๊ะหลัก
export async function mergeTables(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser()
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  const parsed = mergeTablesSchema.safeParse({
    primaryTableId: formData.get("primaryTableId") ?? "",
    secondaryTableId: formData.get("secondaryTableId") ?? "",
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error),
      fieldErrors: zodToFieldErrors(parsed.error),
    }
  }

  const { primaryTableId, secondaryTableId } = parsed.data

  try {
    const codes = await prisma.$transaction(async (tx) => {
      const primary = await tx.table.findUnique({
        where: { id: primaryTableId },
        select: { id: true, code: true, primaryTableId: true },
      })
      if (!primary) throw new TableAbort({ error: "ไม่พบโต๊ะหลัก" })
      if (primary.primaryTableId !== null) {
        throw new TableAbort({ error: `โต๊ะ ${primary.code} ถูกรวมกับโต๊ะอื่นอยู่แล้ว ใช้เป็นโต๊ะหลักไม่ได้` })
      }

      const secondary = await tx.table.findUnique({
        where: { id: secondaryTableId },
        select: { id: true, code: true, status: true },
      })
      if (!secondary) throw new TableAbort({ error: "ไม่พบโต๊ะที่จะรวม" })

      const primarySession = await tx.tableSession.findFirst({
        where: { tableId: primaryTableId, status: { in: LIVE_SESSION_STATUS } },
        select: { id: true },
      })
      if (!primarySession) {
        throw new TableAbort({ error: `โต๊ะ ${primary.code} ยังไม่ได้เปิดใช้งาน — เปิดโต๊ะหลักก่อนจึงจะรวมโต๊ะได้` })
      }

      // ★ conditional update — โต๊ะรองต้องยังว่างอยู่จริง ณ วินาทีที่เขียน
      const merged = await tx.table.updateMany({
        where: { id: secondaryTableId, status: "EMPTY", primaryTableId: null },
        data: { primaryTableId, status: "OCCUPIED_MERGED" },
      })
      if (merged.count === 0) {
        throw new TableAbort({ error: `โต๊ะ ${secondary.code} ไม่ว่าง จึงรวมเข้ากับโต๊ะ ${primary.code} ไม่ได้` })
      }

      return { primary: primary.code, secondary: secondary.code }
    })

    revalidateTablePages()
    return { ok: true, message: `รวมโต๊ะ ${codes.secondary} เข้ากับโต๊ะ ${codes.primary} เรียบร้อยแล้ว` }
  } catch (error) {
    if (error instanceof TableAbort) return { ok: false, ...error.failure }
    return { ok: false, error: "รวมโต๊ะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }
}

/// ยกเลิกการรวมโต๊ะ — ทำได้เฉพาะตอน session ของโต๊ะหลักยังไม่ปิดบิล
export async function unmergeTables(formData: FormData): Promise<ActionResult> {
  try {
    await requireUser()
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  const parsed = unmergeTableSchema.safeParse({
    secondaryTableId: formData.get("secondaryTableId") ?? "",
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error),
      fieldErrors: zodToFieldErrors(parsed.error),
    }
  }

  try {
    const code = await prisma.$transaction(async (tx) => {
      const secondary = await tx.table.findUnique({
        where: { id: parsed.data.secondaryTableId },
        select: { id: true, code: true, status: true, primaryTableId: true },
      })
      if (!secondary) throw new TableAbort({ error: "ไม่พบโต๊ะที่ต้องการยกเลิกการรวม" })
      if (secondary.primaryTableId === null) {
        throw new TableAbort({ error: `โต๊ะ ${secondary.code} ไม่ได้ถูกรวมกับโต๊ะไหนอยู่` })
      }

      const released = await tx.table.updateMany({
        where: { id: secondary.id, status: "OCCUPIED_MERGED" },
        data: { primaryTableId: null, status: "EMPTY" },
      })
      if (released.count === 0) {
        throw new TableAbort({ error: `โต๊ะ ${secondary.code} ถูกยกเลิกการรวมไปแล้ว` })
      }

      return secondary.code
    })

    revalidateTablePages()
    return { ok: true, message: `ยกเลิกการรวมโต๊ะ ${code} เรียบร้อยแล้ว` }
  } catch (error) {
    if (error instanceof TableAbort) return { ok: false, ...error.failure }
    return { ok: false, error: "ยกเลิกการรวมโต๊ะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }
}

/// ยกเลิกโต๊ะทั้งชุด — คนละกลไกกับ void บิล (F6) เพราะยังไม่มีการจ่ายเงิน จึง **ไม่สร้าง Sale**
/// รายการอาหารที่ยังไม่เสิร์ฟถูกยกเลิกตามทั้งหมด และโต๊ะที่รวมอยู่กลับเป็นว่างพร้อมกันในทรานแซคชันเดียว
export async function cancelTableSession(formData: FormData): Promise<ActionResult> {
  let user
  try {
    user = await requireUser()
  } catch {
    return { ok: false, error: AUTH_ERROR }
  }

  const parsed = cancelSessionSchema.safeParse({
    sessionId: formData.get("sessionId") ?? "",
    reason: formData.get("reason") ?? "",
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssueMessage(parsed.error),
      fieldErrors: zodToFieldErrors(parsed.error),
    }
  }

  const { sessionId, reason } = parsed.data

  try {
    const tableCode = await prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, tableId: true, table: { select: { code: true } } },
      })
      if (!session) throw new TableAbort({ error: "ไม่พบโต๊ะที่ต้องการยกเลิก" })

      // ★ conditional update — กัน race กับการปิดบิล/ยกเลิกซ้ำจากอีกหน้าจอ
      const cancelled = await tx.tableSession.updateMany({
        where: { id: sessionId, status: { in: LIVE_SESSION_STATUS } },
        data: {
          status: "CANCELLED",
          closedAt: new Date(),
          closedById: user.id,
          cancelReason: reason,
        },
      })
      if (cancelled.count === 0) {
        throw new TableAbort({ error: `โต๊ะ ${session.table.code} ถูกปิดหรือยกเลิกไปแล้ว` })
      }

      // ยกเลิกรายการอาหารที่ยังไม่เสิร์ฟทั้งหมด (SERVED/CANCELLED ไปแล้วไม่แตะ)
      await tx.mobileOrderItem.updateMany({
        where: {
          order: { tableSessionId: sessionId },
          status: { in: ["AWAITING_KITCHEN", "COOKING", "READY"] },
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancelReason: reason,
        },
      })

      // คืนโต๊ะหลักและโต๊ะที่รวมอยู่ทั้งหมดเป็นว่างพร้อมกัน
      await tx.table.updateMany({
        where: { primaryTableId: session.tableId },
        data: { primaryTableId: null, status: "EMPTY" },
      })
      await tx.table.update({
        where: { id: session.tableId },
        data: { status: "EMPTY" },
      })

      return session.table.code
    })

    revalidateTablePages()
    return { ok: true, message: `ยกเลิกโต๊ะ ${tableCode} เรียบร้อยแล้ว (ไม่มีการออกบิล)` }
  } catch (error) {
    if (error instanceof TableAbort) return { ok: false, ...error.failure }
    return { ok: false, error: "ยกเลิกโต๊ะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }
}
