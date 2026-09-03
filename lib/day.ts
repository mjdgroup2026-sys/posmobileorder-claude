/// วันทางธุรกิจของร้าน — ยึดเวลาไทย (Asia/Bangkok) ไม่ใช่ TZ ของเครื่อง
/// เพราะ container บน VPS รันด้วย UTC ถ้าใช้เวลาเครื่องตรง ๆ "วันนี้" จะหมุนตอน 07:00 น. ตามเวลาไทย
/// แล้วกติกา void บิลวันเดียวกัน/ปิดยอดประจำวันจะเพี้ยนทันที
const TZ_OFFSET_MINUTES = 7 * 60

function shifted(date: Date): Date {
  return new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000)
}

/// คีย์ของวันทางธุรกิจในรูปแบบ YYYY-MM-DD (เวลาไทย)
export function businessDayKey(date: Date = new Date()): string {
  return shifted(date).toISOString().slice(0, 10)
}

/// ช่วงเวลาจริง (UTC) ของวันทางธุรกิจที่ครอบ `date` — ใช้กับ where createdAt: { gte, lt }
export function businessDayRange(date: Date = new Date()): { start: Date; end: Date } {
  const s = shifted(date)
  const startUtcMs = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())
  const start = new Date(startUtcMs - TZ_OFFSET_MINUTES * 60_000)
  const end = new Date(start.getTime() + 24 * 60 * 60_000)
  return { start, end }
}

/// ค่าสำหรับคอลัมน์ชนิด DATE (`@db.Date`) — เที่ยงคืน UTC ของวันทางธุรกิจนั้น
export function businessDateOnly(date: Date = new Date()): Date {
  return new Date(`${businessDayKey(date)}T00:00:00.000Z`)
}

export function isSameBusinessDay(a: Date, b: Date): boolean {
  return businessDayKey(a) === businessDayKey(b)
}
