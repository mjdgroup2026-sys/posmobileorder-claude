import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"
import type { PermissionAction, ResourceKey } from "@/generated/prisma/client"

export type { PermissionAction, ResourceKey }

/// ชั้นสิทธิ์ตามบทบาท (§4) — ครอบหน้าและ action ของ F1–F9
///
/// ตรวจ **2 ชั้นเสมอ** ตามกติกาใน §4:
///   1. `requirePageAccess(resource)` ที่ต้นทุกหน้า — ไม่ผ่าน → เด้งไป /access-denied
///   2. `requirePermission(resource, action)` ที่ต้นทุก Server Action ที่แตะข้อมูล
///
/// ⚠️ ห้ามพึ่งการซ่อนปุ่มฝั่ง client อย่างเดียว — Server Action ถูกเรียกตรงได้
///    (เหตุผลเดียวกับกติกาข้อ 5 ที่บังคับ `requireUser()` มาตั้งแต่ v1)

/// action ที่ "มีความหมาย" กับแต่ละ resource — ตารางใน §4
/// ใช้ทั้งตอน render matrix (disable ช่องที่ไม่เกี่ยว) และตอน validate ฝั่ง server
export const RESOURCE_ACTIONS: Record<ResourceKey, PermissionAction[]> = {
  DASHBOARD: ["VIEW"],
  PRODUCTS: ["VIEW", "ADD", "EDIT", "DELETE"],
  CATEGORIES: ["VIEW", "ADD", "EDIT", "DELETE"],
  // ledger เป็น append-only จึงไม่มี EDIT/DELETE (กติกาข้อ 3)
  STOCK_IN: ["VIEW", "ADD"],
  STOCK_OUT: ["VIEW", "ADD"],
  // ADD = ทำการขาย/checkout
  POS: ["VIEW", "ADD"],
  // DELETE = สิทธิ์กดปุ่ม void บิล
  POS_HISTORY: ["VIEW", "DELETE"],
  // ADD = สิทธิ์กดปิดยอดประจำวัน
  POS_CLOSING: ["VIEW", "ADD"],
  REPORTS: ["VIEW"],
  // EDIT ครอบการเปลี่ยนบทบาทผู้ใช้อื่น และเป็นสิทธิ์เดียวกับที่ใช้เข้าหน้า /roles
  USERS: ["VIEW", "ADD", "EDIT", "DELETE"],
}

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  DASHBOARD: "แดชบอร์ด",
  PRODUCTS: "สินค้า",
  CATEGORIES: "หมวดหมู่",
  STOCK_IN: "รับสินค้าเข้า",
  STOCK_OUT: "เบิกจ่ายสินค้า",
  POS: "ขายหน้าร้าน",
  POS_HISTORY: "ประวัติการขาย",
  POS_CLOSING: "ปิดยอดประจำวัน",
  REPORTS: "รายงาน",
  USERS: "ผู้ใช้งานและสิทธิ์",
}

export const ACTION_LABEL: Record<PermissionAction, string> = {
  VIEW: "ดู",
  ADD: "เพิ่ม",
  EDIT: "แก้ไข",
  DELETE: "ลบ",
}

/// คำอธิบายว่า action นั้นหมายถึงอะไรจริง ๆ กับ resource ที่ความหมายไม่ตรงตัว
export const ACTION_HINT: Partial<Record<`${ResourceKey}:${PermissionAction}`, string>> = {
  "POS:ADD": "ทำการขาย/ปิดการขาย",
  "POS_HISTORY:DELETE": "ยกเลิก (void) บิล",
  "POS_CLOSING:ADD": "กดปิดยอดประจำวัน",
  "USERS:EDIT": "แก้ผู้ใช้และจัดการบทบาท/สิทธิ์",
}

export type CurrentUserPermissions = {
  /// ตั้งชื่อ id ให้ตรงกับ session.user.id ของ Better Auth — โค้ดเดิมที่รับ user จาก
  /// requireUser() แล้วใช้ user.id ต่อได้ทันทีโดยไม่ต้องแก้
  id: string
  name: string
  email: string
  roleId: string | null
  roleName: string | null
  /// resource → action ที่ทำได้ · ไม่มีคีย์ = ไม่มีสิทธิ์เลยกับ resource นั้น
  granted: Partial<Record<ResourceKey, PermissionAction[]>>
}

/// อ่านสิทธิ์ของผู้ใช้ปัจจุบันจาก DB — `cache()` ทำให้เรียกกี่ครั้งในคำขอเดียวก็ยิง query ครั้งเดียว
/// แต่ **ไม่ข้ามคำขอ** ตาม §4 ("เปลี่ยน Role แล้วมีผลทันทีในคำขอถัดไป")
export const getCurrentPermissions = cache(async (): Promise<CurrentUserPermissions | null> => {
  const session = await getSession()
  if (!session?.user) return null

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      roleId: true,
      role: { select: { name: true, permissions: { select: { resource: true, actions: true } } } },
    },
  })
  if (!user) return null

  const granted: Partial<Record<ResourceKey, PermissionAction[]>> = {}
  for (const row of user.role?.permissions ?? []) {
    if (row.actions.length > 0) granted[row.resource] = row.actions
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    roleName: user.role?.name ?? null,
    granted,
  }
})

export async function hasPermission(resource: ResourceKey, action: PermissionAction): Promise<boolean> {
  const permissions = await getCurrentPermissions()
  if (!permissions) return false
  return permissions.granted[resource]?.includes(action) ?? false
}

export class PermissionDenied extends Error {
  constructor(
    readonly resource: ResourceKey,
    readonly action: PermissionAction,
  ) {
    super("PERMISSION_DENIED")
  }
}

/// ด่านของ Server Action — โยน `PermissionDenied` เมื่อไม่มีสิทธิ์
/// ผู้เรียกต้องจับแล้วคืน `ActionResult` ภาษาไทย (ดู `permissionErrorResult`)
export async function requirePermission(
  resource: ResourceKey,
  action: PermissionAction,
): Promise<CurrentUserPermissions> {
  const permissions = await getCurrentPermissions()
  if (!permissions) throw new PermissionDenied(resource, action)
  if (!permissions.granted[resource]?.includes(action)) throw new PermissionDenied(resource, action)
  return permissions
}

export function permissionErrorMessage(resource: ResourceKey, action: PermissionAction): string {
  return `คุณไม่มีสิทธิ์${ACTION_LABEL[action]}ในหน้า${RESOURCE_LABEL[resource]} กรุณาติดต่อผู้ดูแลระบบ`
}

export type ActionGuard =
  | { ok: true; user: CurrentUserPermissions }
  | { ok: false; error: string }

/// ด่านสำเร็จรูปสำหรับ Server Action — รวม "ต้องล็อกอิน" กับ "ต้องมีสิทธิ์" ไว้ในบรรทัดเดียว
/// แล้วคืนข้อความภาษาไทยที่ต่างกันตามสาเหตุ (ยังไม่ล็อกอิน vs ล็อกอินแล้วแต่สิทธิ์ไม่ถึง)
///
///   const guard = await guardAction("PRODUCTS", "ADD")
///   if (!guard.ok) return { ok: false, error: guard.error }
export async function guardAction(
  resource: ResourceKey,
  action: PermissionAction,
): Promise<ActionGuard> {
  const permissions = await getCurrentPermissions()
  if (!permissions) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" }
  if (!permissions.granted[resource]?.includes(action)) {
    return { ok: false, error: permissionErrorMessage(resource, action) }
  }
  return { ok: true, user: permissions }
}

/// ด่านของหน้า — เรียกเป็นบรรทัดแรกของทุก page ที่คุมสิทธิ์
/// ไม่ผ่าน → เด้งไป /access-denied (ไม่ใช่ 404 เพื่อให้ผู้ใช้รู้ว่าหน้ามีอยู่แต่สิทธิ์ไม่ถึง)
export async function requirePageAccess(resource: ResourceKey): Promise<CurrentUserPermissions> {
  const permissions = await getCurrentPermissions()
  if (!permissions) redirect("/login")
  if (!permissions.granted[resource]?.includes("VIEW")) {
    redirect(`/access-denied?resource=${resource}`)
  }
  return permissions
}
