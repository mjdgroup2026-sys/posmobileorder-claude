"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/// ดึงข้อมูลใหม่เป็นรอบ ๆ สำหรับหน้าจอที่ต้องเห็นความเปลี่ยนแปลงเกือบทันที (ผังโต๊ะ / KDS / แจ้งเตือน)
///
/// เป็นทางสำรองที่ทำงานได้จริงบน deployment ปัจจุบัน (Next.js standalone ไม่มี custom server)
/// — Socket.IO ตาม §6a ต้องรอย้ายไป custom server ก่อน ดูหมายเหตุใน Docs/spec.md §8 Phase 8
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      // หยุดดึงตอนแท็บถูกซ่อน — กันยิงถี่ทิ้งเปล่าเวลาเครื่องครัวพักหน้าจอ
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      router.refresh()
    }, seconds * 1000)
    return () => clearInterval(timer)
  }, [router, seconds])

  return null
}
