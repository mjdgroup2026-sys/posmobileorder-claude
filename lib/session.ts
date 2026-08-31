import "server-only"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/// เรียกเป็นบรรทัดแรกของทุก Server Action ที่แตะข้อมูล — ห้ามพึ่ง UI ที่ซ่อนปุ่มอย่างเดียว
/// เพราะ Server Action ถูกเรียกตรงได้
export async function requireUser() {
  const session = await getSession()
  if (!session?.user) throw new Error("UNAUTHENTICATED")
  return session.user
}
