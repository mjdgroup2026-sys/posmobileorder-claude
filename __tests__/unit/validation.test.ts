import { describe, expect, it } from "vitest"
import { firstIssueMessage, stockMoveSchema, zodToFieldErrors } from "@/lib/validation"

/// ช่วงอักขระไทยใน Unicode — ใช้ยืนยันว่าข้อความ validation เป็นภาษาไทยจริง (กติกาข้อ 6)
const THAI = /[฀-๿]/

describe("stockMoveSchema — ตรวจข้อมูลก่อนแตะสต็อก", () => {
  it("ข้อมูลครบถ้วนต้องผ่านและแปลงจำนวนเป็นตัวเลข", () => {
    // arrange
    const input = { productId: "prod_1", quantity: "3", note: "เบิกเข้าครัว" }

    // act
    const parsed = stockMoveSchema.safeParse(input)

    // assert
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.quantity).toBe(3)
    expect(parsed.success && parsed.data.note).toBe("เบิกเข้าครัว")
  })

  it("หมายเหตุว่างต้องกลายเป็น undefined ไม่ใช่สตริงว่าง", () => {
    // arrange
    const input = { productId: "prod_1", quantity: "1", note: "" }

    // act
    const parsed = stockMoveSchema.safeParse(input)

    // assert
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.note).toBeUndefined()
  })

  it("จำนวน 0 ต้องไม่ผ่านพร้อมข้อความภาษาไทย", () => {
    // arrange
    const input = { productId: "prod_1", quantity: "0", note: "" }

    // act
    const parsed = stockMoveSchema.safeParse(input)

    // assert
    expect(parsed.success).toBe(false)
    expect(!parsed.success && firstIssueMessage(parsed.error)).toBe("จำนวน ต้องมากกว่า 0")
  })

  it("จำนวนติดลบต้องไม่ผ่าน", () => {
    // arrange
    const input = { productId: "prod_1", quantity: "-1", note: "" }

    // act
    const parsed = stockMoveSchema.safeParse(input)

    // assert
    expect(parsed.success).toBe(false)
    expect(!parsed.success && firstIssueMessage(parsed.error)).toBe("จำนวน ต้องมากกว่า 0")
  })

  it("จำนวนที่มีทศนิยมต้องไม่ผ่าน", () => {
    // arrange
    const input = { productId: "prod_1", quantity: "1.5", note: "" }

    // act
    const parsed = stockMoveSchema.safeParse(input)

    // assert
    expect(parsed.success).toBe(false)
    expect(!parsed.success && firstIssueMessage(parsed.error)).toBe("จำนวน ต้องเป็นจำนวนเต็ม")
  })

  it("ไม่ระบุสินค้าต้องไม่ผ่านและ fieldErrors ต้องชี้ที่ productId", () => {
    // arrange
    const input = { productId: "  ", quantity: "1", note: "" }

    // act
    const parsed = stockMoveSchema.safeParse(input)

    // assert
    expect(parsed.success).toBe(false)
    expect(!parsed.success && zodToFieldErrors(parsed.error).productId).toBe("กรุณาเลือกสินค้า")
  })

  it("ทุกข้อความผิดพลาดที่ผู้ใช้เห็นต้องเป็นภาษาไทย แม้ฟิลด์จะขาดไปทั้งหมด", () => {
    // arrange — จำลอง FormData ที่ไม่มีฟิลด์ใดเลย (formData.get คืน null)
    const input = { productId: null, quantity: null, note: null }

    // act
    const parsed = stockMoveSchema.safeParse(input)

    // assert
    expect(parsed.success).toBe(false)
    const messages = parsed.success ? [] : Object.values(zodToFieldErrors(parsed.error))
    expect(messages.length).toBeGreaterThan(0)
    for (const message of messages) {
      expect(message).toMatch(THAI)
    }
  })
})
