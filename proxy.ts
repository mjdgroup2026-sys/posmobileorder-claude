import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// เส้นทางที่เข้าได้โดยไม่ต้องล็อกอิน
// หมายเหตุ: "/register" ถูกถอดออกโดยตั้งใจ — ปิดการสมัครเองแล้ว (ดู disableSignUp ใน lib/auth.ts)
const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/order", // ฝั่งลูกค้า (Phase 9) — สแกน QR เข้าได้เลย ไม่ต้องล็อกอิน
]

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // ตรวจแบบ optimistic จาก cookie เท่านั้น — หน้าและ Server Action ตรวจ session จริงซ้ำเสมอ
  const hasSession = Boolean(getSessionCookie(request))

  if (isPublic(pathname)) {
    // ล็อกอินแล้วแต่เข้าหน้า auth → ส่งกลับหน้าแรก
    if (hasSession && pathname !== "/api/auth" && !pathname.startsWith("/api/auth/") && !pathname.startsWith("/order")) {
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
