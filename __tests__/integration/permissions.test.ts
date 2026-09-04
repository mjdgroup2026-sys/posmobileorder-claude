import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ActionResult } from "@/lib/types"
import {
  createTestCategory,
  createTestProduct,
  disconnectTestDb,
  ensureTestUser,
  isTestDbReachable,
  resetDb,
  testPrisma,
} from "../helpers/db"
import { makeFormData } from "../helpers/form"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

/// สลับผู้ใช้ที่ "ล็อกอินอยู่" ได้ระหว่างเทส — ด่านสิทธิ์อ่าน session ผ่าน getSession()
let currentUserId: string | null = "test-user"
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => (currentUserId ? { user: { id: currentUserId } } : null)),
  requireUser: vi.fn(async () => {
    if (!currentUserId) throw new Error("UNAUTHENTICATED")
    return { id: currentUserId, name: "ผู้ทดสอบ", email: "test@example.com" }
  }),
}))

const dbReady = await isTestDbReachable()

describe.skipIf(!dbReady)("ระบบสิทธิ์ตามบทบาท (§4)", () => {
  let createProduct: (formData: FormData) => Promise<ActionResult>
  let deleteProduct: (formData: FormData) => Promise<ActionResult>
  let stockIn: (formData: FormData) => Promise<ActionResult>
  let assignUserRole: (formData: FormData) => Promise<ActionResult>
  let updateRole: (formData: FormData) => Promise<ActionResult>
  let deleteRole: (formData: FormData) => Promise<ActionResult>
  let permissions: typeof import("@/lib/permissions")

  beforeAll(async () => {
    const products = await import("@/app/actions/products")
    const stock = await import("@/app/actions/stock")
    const roles = await import("@/app/actions/roles")
    permissions = await import("@/lib/permissions")
    createProduct = products.createProduct
    deleteProduct = products.deleteProduct
    stockIn = stock.stockIn
    assignUserRole = roles.assignUserRole
    updateRole = roles.updateRole
    deleteRole = roles.deleteRole
  })

  beforeEach(async () => {
    await resetDb()
    // ไฟล์นี้ทดสอบระบบสิทธิ์เอง จึงเริ่มจาก "ไม่มีบทบาท" แล้วค่อยผูกทีละเคส
    await ensureTestUser("test-user", "ผู้ทดสอบ", { withFullPermissions: false })
    currentUserId = "test-user"
  })

  afterAll(async () => {
    await disconnectTestDb()
  })

  /// สร้างบทบาทพร้อมสิทธิ์แล้วผูกกับผู้ใช้ทดสอบ
  async function giveRole(
    name: string,
    grants: Partial<Record<string, string[]>>,
    options: { isSystem?: boolean; userId?: string } = {},
  ) {
    const db = testPrisma()
    const role = await db.role.create({
      data: {
        name,
        isSystem: options.isSystem ?? false,
        permissions: {
          create: Object.entries(grants).map(([resource, actions]) => ({
            resource: resource as never,
            actions: (actions ?? []) as never,
          })),
        },
      },
      select: { id: true },
    })
    await db.user.update({ where: { id: options.userId ?? "test-user" }, data: { roleId: role.id } })
    return role.id
  }

  describe("ด่านชั้นที่ 2 — Server Action", () => {
    it("ไม่มีบทบาทเลย = ทำอะไรกับข้อมูลไม่ได้", async () => {
      const category = await createTestCategory()
      const result = await createProduct(
        makeFormData({ name: "สินค้าใหม่", sku: "", categoryId: category.id, unit: "ชิ้น", price: "10", reorderPoint: "0" }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain("ไม่มีสิทธิ์")
      expect(await testPrisma().product.count()).toBe(0)
    })

    it("มี VIEW แต่ไม่มี ADD ก็ยังสร้างไม่ได้", async () => {
      await giveRole("ผู้ดูอย่างเดียว", { PRODUCTS: ["VIEW"] })
      const category = await createTestCategory()

      const result = await createProduct(
        makeFormData({ name: "สินค้าใหม่", sku: "", categoryId: category.id, unit: "ชิ้น", price: "10", reorderPoint: "0" }),
      )
      expect(result.ok).toBe(false)
      expect(await testPrisma().product.count()).toBe(0)
    })

    it("มี ADD แล้วสร้างได้ แต่ยังลบไม่ได้ถ้าไม่มี DELETE", async () => {
      await giveRole("เพิ่มได้อย่างเดียว", { PRODUCTS: ["VIEW", "ADD"] })
      const category = await createTestCategory()

      const created = await createProduct(
        makeFormData({ name: "สินค้าใหม่", sku: "", categoryId: category.id, unit: "ชิ้น", price: "10", reorderPoint: "0" }),
      )
      expect(created.ok).toBe(true)

      const product = await testPrisma().product.findFirstOrThrow()
      const removed = await deleteProduct(makeFormData({ id: product.id }))
      expect(removed.ok).toBe(false)
      expect(await testPrisma().product.count()).toBe(1)
    })

    it("สิทธิ์แยกตาม resource — มี STOCK_IN ไม่ได้แปลว่าแตะสินค้าได้", async () => {
      await giveRole("พนักงานคลัง", { STOCK_IN: ["VIEW", "ADD"] })
      const product = await createTestProduct({ quantity: 0 })

      const received = await stockIn(makeFormData({ productId: product.id, quantity: "5" }))
      expect(received.ok).toBe(true)

      const category = await createTestCategory("หมวดอื่น")
      const blocked = await createProduct(
        makeFormData({ name: "ของใหม่", sku: "", categoryId: category.id, unit: "ชิ้น", price: "10", reorderPoint: "0" }),
      )
      expect(blocked.ok).toBe(false)
    })

    it("ยังไม่ล็อกอิน ต้องได้ข้อความให้เข้าสู่ระบบ ไม่ใช่ข้อความสิทธิ์", async () => {
      currentUserId = null
      const category = await createTestCategory()
      const result = await createProduct(
        makeFormData({ name: "x", sku: "", categoryId: category.id, unit: "ชิ้น", price: "10", reorderPoint: "0" }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain("เข้าสู่ระบบ")
    })
  })

  describe("guardAction / hasPermission", () => {
    it("อ่านสิทธิ์จาก DB สดทุกคำขอ — actions ว่างถือว่าไม่มีสิทธิ์", async () => {
      await giveRole("ไม่มีสิทธิ์เลย", { PRODUCTS: [], REPORTS: ["VIEW"] })

      expect(await permissions.hasPermission("PRODUCTS", "VIEW")).toBe(false)
      expect(await permissions.hasPermission("REPORTS", "VIEW")).toBe(true)

      const guard = await permissions.guardAction("PRODUCTS", "ADD")
      expect(guard.ok).toBe(false)
    })

    it("RESOURCE_ACTIONS ตรงกับตารางใน §4 — ledger ไม่มี EDIT/DELETE", () => {
      expect(permissions.RESOURCE_ACTIONS.STOCK_IN).toEqual(["VIEW", "ADD"])
      expect(permissions.RESOURCE_ACTIONS.STOCK_OUT).toEqual(["VIEW", "ADD"])
      expect(permissions.RESOURCE_ACTIONS.DASHBOARD).toEqual(["VIEW"])
      expect(permissions.RESOURCE_ACTIONS.REPORTS).toEqual(["VIEW"])
      expect(permissions.RESOURCE_ACTIONS.POS_HISTORY).toEqual(["VIEW", "DELETE"])
    })
  })

  describe("จัดการบทบาท", () => {
    it("ต้องมี USERS:EDIT ถึงจะแก้บทบาทได้", async () => {
      const roleId = await giveRole("ดูผู้ใช้ได้อย่างเดียว", { USERS: ["VIEW"] })

      const result = await updateRole(
        makeFormData({ id: roleId, name: "ชื่อใหม่", permissions: JSON.stringify([]) }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain("ไม่มีสิทธิ์")
    })

    it("action ที่ resource ไม่รองรับถูกตัดทิ้งแม้ยิงตรงมา", async () => {
      const db = testPrisma()
      await giveRole("ผู้ดูแล", { USERS: ["VIEW", "EDIT"] })
      const target = await db.role.create({ data: { name: "บทบาททดสอบ" }, select: { id: true } })

      const result = await updateRole(
        makeFormData({
          id: target.id,
          name: "บทบาททดสอบ",
          // STOCK_IN ไม่รองรับ EDIT/DELETE — ต้องเหลือแค่ VIEW/ADD
          permissions: JSON.stringify([{ resource: "STOCK_IN", actions: ["VIEW", "ADD", "EDIT", "DELETE"] }]),
        }),
      )
      expect(result.ok).toBe(true)

      const saved = await db.rolePermission.findFirstOrThrow({ where: { roleId: target.id } })
      expect(saved.actions).toEqual(["VIEW", "ADD"])
    })

    it("บทบาทระบบเปลี่ยนชื่อไม่ได้ และลบไม่ได้", async () => {
      const db = testPrisma()
      await giveRole("ผู้ดูแล", { USERS: ["VIEW", "EDIT"] })
      const system = await db.role.create({
        data: {
          name: "ผู้ดูแลระบบ",
          isSystem: true,
          permissions: { create: [{ resource: "USERS", actions: ["VIEW", "EDIT"] }] },
        },
        select: { id: true },
      })

      const renamed = await updateRole(
        makeFormData({
          id: system.id,
          name: "ชื่อใหม่",
          permissions: JSON.stringify([{ resource: "USERS", actions: ["VIEW", "EDIT"] }]),
        }),
      )
      expect(renamed.ok).toBe(false)

      const removed = await deleteRole(makeFormData({ id: system.id }))
      expect(removed.ok).toBe(false)
      expect(await db.role.count({ where: { id: system.id } })).toBe(1)
    })

    it("บทบาทระบบต้องเหลือสิทธิ์ USERS:EDIT เสมอ — ตัดออกไม่ได้", async () => {
      const db = testPrisma()
      await giveRole("ผู้ดูแล", { USERS: ["VIEW", "EDIT"] })
      const system = await db.role.create({
        data: { name: "บทบาทระบบ", isSystem: true },
        select: { id: true },
      })

      const result = await updateRole(
        makeFormData({
          id: system.id,
          name: "บทบาทระบบ",
          permissions: JSON.stringify([{ resource: "USERS", actions: ["VIEW"] }]),
        }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain("จัดการสิทธิ์")
    })

    it("ลบบทบาทที่ยังมีผู้ใช้สังกัดอยู่ไม่ได้", async () => {
      const db = testPrisma()
      const roleId = await giveRole("ผู้ดูแล", { USERS: ["VIEW", "EDIT"] })

      const result = await deleteRole(makeFormData({ id: roleId }))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain("ยังมีผู้ใช้")
      expect(await db.role.count({ where: { id: roleId } })).toBe(1)
    })
  })

  describe("กำหนดบทบาทให้ผู้ใช้", () => {
    it("ถอดผู้ดูแลระบบคนสุดท้ายออกไม่ได้", async () => {
      const db = testPrisma()
      await giveRole("ผู้ดูแลระบบ", { USERS: ["VIEW", "EDIT"] }, { isSystem: true })

      const result = await assignUserRole(makeFormData({ userId: "test-user", roleId: "" }))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain("คนสุดท้าย")

      const stillAdmin = await db.user.findUniqueOrThrow({ where: { id: "test-user" } })
      expect(stillAdmin.roleId).not.toBeNull()
    })

    it("ถอดได้ถ้ายังเหลือผู้ดูแลระบบคนอื่น", async () => {
      const db = testPrisma()
      const systemRoleId = await giveRole("ผู้ดูแลระบบ", { USERS: ["VIEW", "EDIT"] }, { isSystem: true })
      await ensureTestUser("admin-2", "ผู้ดูแลสอง", { withFullPermissions: false })
      await db.user.update({ where: { id: "admin-2" }, data: { roleId: systemRoleId } })

      const result = await assignUserRole(makeFormData({ userId: "admin-2", roleId: "" }))
      expect(result.ok).toBe(true)
      expect((await db.user.findUniqueOrThrow({ where: { id: "admin-2" } })).roleId).toBeNull()
    })

    it("กำหนดบทบาทที่ไม่มีอยู่จริงไม่ได้", async () => {
      await giveRole("ผู้ดูแล", { USERS: ["VIEW", "EDIT"] })
      const result = await assignUserRole(makeFormData({ userId: "test-user", roleId: "ไม่มีอยู่จริง" }))
      expect(result.ok).toBe(false)
    })
  })
})
