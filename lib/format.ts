/// Prisma คืน Decimal เป็น object — ต้องแปลงก่อนส่งเข้า Client Component เสมอ
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  if (typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  return Number(value)
}

export function formatBaht(value: unknown): string {
  return toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatNumber(value: unknown): string {
  return toNumber(value).toLocaleString("th-TH")
}

export function formatDateTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })
}
