import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// เส้นทางสาธารณะที่ "ห้าม" redirect ไม่ว่าจะล็อกอินอยู่หรือไม่
// /api/health ต้องอยู่ในนี้ — ถ้าโดน redirect ตัวตรวจสุขภาพจะได้ 307 แทน 200/503
// แล้ว HEALTHCHECK ของ container กับ nginx จะอ่านผลผิดทั้งหมด
const ALWAYS_PUBLIC_PREFIXES = [
  "/api/auth",
  "/api/health",
  "/order", // ฝั่งลูกค้า (Phase 9) — สแกน QR เข้าได้เลย ไม่ต้องล็อกอิน
  "/api/order", // endpoint โพลสถานะของหน้าลูกค้า — ยึด qrToken เป็นตัวระบุตัวตน ไม่มี session
]

// หน้า auth ของพนักงาน — เข้าได้โดยไม่ต้องล็อกอิน แต่ถ้าล็อกอินอยู่แล้วให้เด้งกลับหน้าแรก
// หมายเหตุ: "/register" ถูกถอดออกโดยตั้งใจ — ปิดการสมัครเองแล้ว (ดู disableSignUp ใน lib/auth.ts)
const AUTH_PAGE_PREFIXES = ["/login", "/forgot-password", "/reset-password"]

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (matches(pathname, ALWAYS_PUBLIC_PREFIXES)) {
    return NextResponse.next()
  }

  // ตรวจแบบ optimistic จาก cookie เท่านั้น — หน้าและ Server Action ตรวจ session จริงซ้ำเสมอ
  const hasSession = Boolean(getSessionCookie(request))

  if (matches(pathname, AUTH_PAGE_PREFIXES)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url))
    }
    return NextResponse.next()
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
