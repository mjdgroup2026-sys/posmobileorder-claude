import { describe, expect, it } from "vitest"
import { businessDayKey, businessDayRange, businessDateOnly, isSameBusinessDay } from "@/lib/day"

/// วันทางธุรกิจยึดเวลาไทยเสมอ (UTC+7) ไม่ใช่ TZ ของเครื่องที่รัน —
/// container บน production รันด้วย UTC ถ้าใช้เวลาเครื่องตรง ๆ "วันนี้" จะหมุนตอน 07:00 น. ตามเวลาไทย
describe("lib/day — วันทางธุรกิจตามเวลาไทย", () => {
  it("เวลา 23:30 ของวันที่ 3 ตามเวลาไทย ต้องยังเป็นวันที่ 3", () => {
    // 2026-09-03 23:30 (+07:00) = 2026-09-03 16:30 UTC
    const date = new Date("2026-09-03T16:30:00.000Z")
    expect(businessDayKey(date)).toBe("2026-09-03")
  })

  it("เวลา 00:30 ของวันที่ 4 ตามเวลาไทย ต้องเป็นวันที่ 4 (ไม่ใช่วันที่ 3 ตาม UTC)", () => {
    // 2026-09-04 00:30 (+07:00) = 2026-09-03 17:30 UTC
    const date = new Date("2026-09-03T17:30:00.000Z")
    expect(businessDayKey(date)).toBe("2026-09-04")
  })

  it("ช่วงของวันต้องเริ่ม 17:00 UTC ของวันก่อนหน้า และยาว 24 ชั่วโมงพอดี", () => {
    const { start, end } = businessDayRange(new Date("2026-09-03T16:30:00.000Z"))
    expect(start.toISOString()).toBe("2026-09-02T17:00:00.000Z")
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it("ค่าที่ใช้กับคอลัมน์ DATE ต้องเป็นเที่ยงคืน UTC ของวันทางธุรกิจนั้น", () => {
    expect(businessDateOnly(new Date("2026-09-03T17:30:00.000Z")).toISOString()).toBe(
      "2026-09-04T00:00:00.000Z",
    )
  })

  it("บิลที่ขาย 23:59 กับเวลา 00:01 ของวันถัดไป (เวลาไทย) ต้องถือว่าคนละวัน", () => {
    const sold = new Date("2026-09-03T16:59:00.000Z") // 23:59 ไทย
    const now = new Date("2026-09-03T17:01:00.000Z") // 00:01 ไทย ของวันถัดไป
    expect(isSameBusinessDay(sold, now)).toBe(false)
  })

  it("บิลที่ขายเช้าและตอนดึกของวันเดียวกัน (เวลาไทย) ต้องถือว่าวันเดียวกัน", () => {
    const morning = new Date("2026-09-03T02:00:00.000Z") // 09:00 ไทย
    const night = new Date("2026-09-03T16:00:00.000Z") // 23:00 ไทย
    expect(isSameBusinessDay(morning, night)).toBe(true)
  })
})
