"use client"

import { useSyncExternalStore } from "react"
import {
  getCartSnapshot,
  getServerCartSnapshot,
  subscribeCart,
  type CartLine,
} from "@/lib/cart-storage"

/// อ่านตะกร้าจาก localStorage แบบ React-friendly — ใช้ useSyncExternalStore แทน useEffect+setState
/// (ทั้งเลี่ยง cascading render และทำให้ทุกหน้าที่เปิดอยู่เห็นตะกร้าตรงกันทันทีที่มีการแก้ไข)
export function useCart(qrToken: string): CartLine[] {
  return useSyncExternalStore(
    subscribeCart,
    () => getCartSnapshot(qrToken),
    getServerCartSnapshot,
  )
}
