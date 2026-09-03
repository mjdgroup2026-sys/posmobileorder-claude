"use client"

import { useEffect, useState } from "react"
import { formatElapsed, minutesSince } from "@/lib/format"

/// "เปิดมาแล้วกี่นาที" — คำนวณสดจาก openedAt ทุกนาที (กติกา Phase 7: ห้ามเก็บเป็นฟิลด์ที่คำนวณครั้งเดียว)
///
/// เริ่มที่ null แล้วค่อยเติมค่าหลัง mount โดยตั้งใจ — ถ้า render ตัวเลขตั้งแต่ฝั่ง server
/// เวลาบนเซิร์ฟเวอร์กับเบราว์เซอร์จะต่างกันเล็กน้อยเสมอแล้ว hydration พัง
export function LiveElapsed({ since, prefix = "" }: { since: Date | string; prefix?: string }) {
  const [minutes, setMinutes] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setMinutes(minutesSince(since))
    update()
    const timer = setInterval(update, 30_000)
    return () => clearInterval(timer)
  }, [since])

  if (minutes === null) return null

  return (
    <span className="num">
      {prefix}
      {formatElapsed(minutes)}
    </span>
  )
}
