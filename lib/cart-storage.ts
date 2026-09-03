/// ตะกร้าฝั่งลูกค้าเก็บใน localStorage ต่อ QR token — ยังไม่ถูกส่งเข้าครัวจนกว่าจะกดยืนยัน
/// (ยืนยันแล้วแก้ไม่ได้ตามกติกา F14 — ต้องให้พนักงานยกเลิกรายการให้แทน)
export type CartLine = {
  /// คีย์ของบรรทัดในตะกร้า = เมนู + ตัวเลือกที่เลือก + โน้ต (เมนูเดียวกันแต่คนละตัวเลือกต้องเป็นคนละบรรทัด)
  key: string
  menuItemId: string
  name: string
  unitPrice: number
  quantity: number
  optionIds: string[]
  optionNames: string[]
  note?: string
}

const PREFIX = "mjd-cart:"

function storageKey(qrToken: string): string {
  return `${PREFIX}${qrToken}`
}

export function makeLineKey(menuItemId: string, optionIds: string[], note?: string): string {
  return [menuItemId, [...optionIds].sort().join("|"), note ?? ""].join("::")
}

/// อ่านตะกร้า — localStorage อาจถูกปิด (โหมดส่วนตัว) จึงต้องกัน throw ทุกครั้ง
export function readCart(qrToken: string): CartLine[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(qrToken))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CartLine[]) : []
  } catch {
    return []
  }
}

export function writeCart(qrToken: string, lines: CartLine[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(qrToken), JSON.stringify(lines))
    window.dispatchEvent(new CustomEvent("mjd-cart-changed", { detail: { qrToken } }))
  } catch {
    // เก็บไม่ได้ก็ปล่อยผ่าน — ตะกร้ายังอยู่ใน state ของหน้าปัจจุบัน
  }
}

export function addToCart(qrToken: string, line: Omit<CartLine, "key">): void {
  const key = makeLineKey(line.menuItemId, line.optionIds, line.note)
  const current = readCart(qrToken)
  const existing = current.find((l) => l.key === key)
  const next = existing
    ? current.map((l) => (l.key === key ? { ...l, quantity: l.quantity + line.quantity } : l))
    : [...current, { ...line, key }]
  writeCart(qrToken, next)
}

export function clearCart(qrToken: string): void {
  writeCart(qrToken, [])
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0)
}

export function cartTotal(lines: CartLine[]): number {
  const sum = lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0)
  return Math.round((sum + Number.EPSILON) * 100) / 100
}

/// snapshot ที่อ้างอิงเดิมได้ตราบใดที่ข้อมูลใน localStorage ไม่เปลี่ยน —
/// จำเป็นสำหรับ useSyncExternalStore (ถ้าคืน array ใหม่ทุกครั้งจะ re-render ไม่รู้จบ)
let snapshotCache: { token: string; raw: string | null; value: CartLine[] } | null = null
const EMPTY_CART: CartLine[] = []

export function getCartSnapshot(qrToken: string): CartLine[] {
  if (typeof window === "undefined") return EMPTY_CART
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(qrToken))
  } catch {
    return EMPTY_CART
  }

  if (snapshotCache && snapshotCache.token === qrToken && snapshotCache.raw === raw) {
    return snapshotCache.value
  }

  let value: CartLine[] = EMPTY_CART
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    value = Array.isArray(parsed) ? (parsed as CartLine[]) : EMPTY_CART
  } catch {
    value = EMPTY_CART
  }

  snapshotCache = { token: qrToken, raw, value }
  return value
}

export function getServerCartSnapshot(): CartLine[] {
  return EMPTY_CART
}

export function subscribeCart(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("mjd-cart-changed", callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener("mjd-cart-changed", callback)
    window.removeEventListener("storage", callback)
  }
}
