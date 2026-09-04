"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { guardAction, RESOURCE_ACTIONS } from "@/lib/permissions"
import { roleSchema, assignRoleSchema, idSchema, firstIssueMessage, zodToFieldErrors } from "@/lib/validation"
import type { ActionResult } from "@/lib/types"
import type { PermissionAction, ResourceKey } from "@/generated/prisma/client"

/// จัดการบทบาทและสิทธิ์ (§4) — ทุก action ใช้สิทธิ์ `USERS:EDIT` ตัวเดียวกัน
/// ไม่มี resource แยกสำหรับหน้า /roles ตามที่สเปกกำหนด

const SYSTEM_ROLE_ERROR = "บทบาทของระบบ แก้ชื่อหรือลบไม่ได้"

class RoleAbort extends Error {
  constructor(readonly reason: string) {
    super("ROLE_ABORT")
  }
}

function revalidateRolePages() {
  revalidatePath("/roles")
  revalidatePath("/users")
  // สิทธิ์เปลี่ยนแล้วเมนูใน Sidebar ต้องเปลี่ยนตามในคำขอถัดไป
  revalidatePath("/", "layout")
}

/// กรอง action ที่ไม่มีความหมายกับ resource นั้นทิ้งเสมอ (§4 ตาราง Action)
/// UI disable ช่องพวกนี้อยู่แล้ว แต่ห้ามเชื่อ client — ยิงตรงมาก็ต้องถูกตัดทิ้ง
function sanitize(resource: ResourceKey, actions: PermissionAction[]): PermissionAction[] {
  const allowed = RESOURCE_ACTIONS[resource]
  const unique = [...new Set(actions)]
  return allowed.filter((action) => unique.includes(action))
}

function parsePermissions(raw: FormDataEntryValue | null): { resource: ResourceKey; actions: PermissionAction[] }[] {
  if (typeof raw !== "string" || !raw.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RoleAbort("ข้อมูลสิทธิ์ไม่ถูกต้อง กรุณารีเฟรชหน้าแล้วลองใหม่")
  }
  if (!Array.isArray(parsed)) throw new RoleAbort("ข้อมูลสิทธิ์ไม่ถูกต้อง กรุณารีเฟรชหน้าแล้วลองใหม่")

  return parsed.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return []
    const record = entry as { resource?: unknown; actions?: unknown }
    if (typeof record.resource !== "string" || !(record.resource in RESOURCE_ACTIONS)) return []
    const resource = record.resource as ResourceKey
    const actions = Array.isArray(record.actions) ? (record.actions as PermissionAction[]) : []
    return [{ resource, actions: sanitize(resource, actions) }]
  })
}

async function writePermissions(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  roleId: string,
  rows: { resource: ResourceKey; actions: PermissionAction[] }[],
) {
  // เขียนทับทั้งชุดทุกครั้ง — resource ที่ไม่ได้ส่งมาถือว่าไม่มีสิทธิ์เลย
  await tx.rolePermission.deleteMany({ where: { roleId } })
  if (rows.length === 0) return
  await tx.rolePermission.createMany({
    data: rows.map((row) => ({ roleId, resource: row.resource, actions: row.actions })),
  })
}

export async function createRole(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("USERS", "EDIT")
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = roleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error), fieldErrors: zodToFieldErrors(parsed.error) }
  }

  try {
    const rows = parsePermissions(formData.get("permissions"))
    await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { name: parsed.data.name, description: parsed.data.description },
        select: { id: true },
      })
      await writePermissions(tx, role.id, rows)
    })
  } catch (error) {
    if (error instanceof RoleAbort) return { ok: false, error: error.reason }
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: "มีบทบาทชื่อนี้อยู่แล้ว" }
    return { ok: false, error: "สร้างบทบาทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }

  revalidateRolePages()
  return { ok: true, message: `สร้างบทบาท ${parsed.data.name} เรียบร้อยแล้ว` }
}

export async function updateRole(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("USERS", "EDIT")
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = roleSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error), fieldErrors: zodToFieldErrors(parsed.error) }
  }
  const id = parsed.data.id
  if (!id) return { ok: false, error: "ไม่พบบทบาทที่ต้องการแก้ไข" }

  try {
    const rows = parsePermissions(formData.get("permissions"))
    await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id }, select: { isSystem: true, name: true } })
      if (!role) throw new RoleAbort("ไม่พบบทบาทที่ต้องการแก้ไข")

      // ★ บทบาทระบบแก้ชื่อไม่ได้ แต่ยังปรับสิทธิ์ได้ — กันไม่ให้ใครลดสิทธิ์ตัวเองจนระบบไม่มีคนดูแล
      //   ต้องเหลือสิทธิ์ USERS:EDIT ไว้เสมอ ไม่งั้นจะไม่มีใครกลับมาแก้สิทธิ์ได้อีก
      if (role.isSystem) {
        if (parsed.data.name !== role.name) throw new RoleAbort(SYSTEM_ROLE_ERROR)
        const users = rows.find((r) => r.resource === "USERS")
        if (!users?.actions.includes("EDIT")) {
          throw new RoleAbort("บทบาทของระบบต้องมีสิทธิ์แก้ไขผู้ใช้เสมอ ไม่งั้นจะไม่มีใครจัดการสิทธิ์ได้อีก")
        }
      }

      await tx.role.update({
        where: { id },
        data: { name: parsed.data.name, description: parsed.data.description },
      })
      await writePermissions(tx, id, rows)
    })
  } catch (error) {
    if (error instanceof RoleAbort) return { ok: false, error: error.reason }
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: "มีบทบาทชื่อนี้อยู่แล้ว" }
    return { ok: false, error: "บันทึกบทบาทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }

  revalidateRolePages()
  return { ok: true, message: `บันทึกบทบาท ${parsed.data.name} เรียบร้อยแล้ว` }
}

export async function deleteRole(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("USERS", "EDIT")
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = idSchema.safeParse({ id: formData.get("id") })
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error) }

  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id: parsed.data.id },
        select: { isSystem: true, name: true, _count: { select: { users: true } } },
      })
      if (!role) throw new RoleAbort("ไม่พบบทบาทที่ต้องการลบ")
      if (role.isSystem) throw new RoleAbort(SYSTEM_ROLE_ERROR)
      if (role._count.users > 0) {
        throw new RoleAbort(
          `ลบไม่ได้ — ยังมีผู้ใช้ ${role._count.users} คนใช้บทบาทนี้อยู่ กรุณาย้ายผู้ใช้ไปบทบาทอื่นก่อน`,
        )
      }
      await tx.role.delete({ where: { id: parsed.data.id } })
    })
  } catch (error) {
    if (error instanceof RoleAbort) return { ok: false, error: error.reason }
    return { ok: false, error: "ลบบทบาทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }

  revalidateRolePages()
  return { ok: true, message: "ลบบทบาทเรียบร้อยแล้ว" }
}

/// กำหนดบทบาทให้ผู้ใช้ — ส่ง roleId ว่างเพื่อถอดบทบาทออก (ผู้ใช้จะเข้าได้เฉพาะ /settings)
export async function assignUserRole(formData: FormData): Promise<ActionResult> {
  const guard = await guardAction("USERS", "EDIT")
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = assignRoleSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId") ?? undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error), fieldErrors: zodToFieldErrors(parsed.error) }
  }
  const { userId, roleId } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true, role: { select: { id: true, isSystem: true } } },
      })
      if (!target) throw new RoleAbort("ไม่พบผู้ใช้ที่ต้องการแก้ไข")

      if (roleId) {
        const role = await tx.role.findUnique({ where: { id: roleId }, select: { id: true } })
        if (!role) throw new RoleAbort("ไม่พบบทบาทที่เลือก")
      }

      // ★ ห้ามถอดผู้ดูแลระบบคนสุดท้ายออก — ไม่งั้นจะไม่เหลือใครกำหนดสิทธิ์ได้อีกเลย
      //   นับในทรานแซคชันเดียวกับการเขียน ไม่ใช่เช็คก่อนแล้วค่อยเขียน
      const wasSystemAdmin = target.role?.isSystem === true
      const staysSystemAdmin = roleId === target.role?.id
      if (wasSystemAdmin && !staysSystemAdmin) {
        const remaining = await tx.user.count({
          where: { role: { isSystem: true }, id: { not: userId } },
        })
        if (remaining === 0) {
          throw new RoleAbort("เปลี่ยนไม่ได้ — นี่คือผู้ดูแลระบบคนสุดท้าย ต้องมีผู้ดูแลระบบอย่างน้อย 1 คนเสมอ")
        }
      }

      await tx.user.update({ where: { id: userId }, data: { roleId: roleId ?? null } })
    })
  } catch (error) {
    if (error instanceof RoleAbort) return { ok: false, error: error.reason }
    return { ok: false, error: "กำหนดบทบาทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }
  }

  revalidateRolePages()
  return { ok: true, message: roleId ? "กำหนดบทบาทเรียบร้อยแล้ว" : "ถอดบทบาทออกแล้ว" }
}
