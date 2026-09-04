import Link from "next/link"
import { getCurrentPermissions, RESOURCE_LABEL, type ResourceKey } from "@/lib/permissions"
import { IconLock } from "@/components/icons"

export const metadata = { title: "ไม่มีสิทธิ์เข้าถึง" }

/// ปลายทางของ `requirePageAccess()` เมื่อสิทธิ์ไม่ถึง — ตั้งใจให้เป็นหน้าอธิบาย ไม่ใช่ 404
/// ผู้ใช้จะได้รู้ว่าหน้ามีอยู่จริงแต่ต้องขอสิทธิ์ ไม่ใช่คิดว่าพิมพ์ URL ผิด
export default async function AccessDeniedPage({ searchParams }: PageProps<"/access-denied">) {
  const params = await searchParams
  const raw = typeof params.resource === "string" ? params.resource : ""
  const label = raw in RESOURCE_LABEL ? RESOURCE_LABEL[raw as ResourceKey] : null

  const permissions = await getCurrentPermissions()
  const unassigned = permissions !== null && permissions.roleId === null

  return (
    <section className="card-ui card-pad" style={{ maxWidth: 560 }}>
      <span className="chip chip-danger">
        <span className="dot" />
        ไม่มีสิทธิ์เข้าถึง
      </span>

      <h1 className="t-h1" style={{ marginTop: 12 }}>
        <IconLock size={22} aria-hidden /> เข้าหน้านี้ไม่ได้
      </h1>

      <p className="t-body" style={{ marginTop: 10 }}>
        {label
          ? `บัญชีของคุณไม่มีสิทธิ์ดูหน้า${label}`
          : "บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้านี้"}
        {permissions?.roleName ? ` · บทบาทปัจจุบัน: ${permissions.roleName}` : ""}
      </p>

      {unassigned ? (
        <div className="alert-banner warning" style={{ marginTop: 14 }}>
          บัญชีของคุณยังไม่ได้ถูกกำหนดบทบาท — ผู้ดูแลระบบต้องกำหนดบทบาทให้ก่อนจึงจะใช้งานหน้าอื่นได้
        </div>
      ) : (
        <p className="t-caption" style={{ marginTop: 10 }}>
          ถ้าคิดว่าควรเข้าได้ กรุณาติดต่อผู้ดูแลระบบเพื่อขอปรับสิทธิ์ของบทบาทที่คุณสังกัด
        </p>
      )}

      <div className="row" style={{ gap: 10, marginTop: 18 }}>
        <Link href="/settings" className="btn btn-primary">
          ไปหน้าตั้งค่าโปรไฟล์
        </Link>
        <Link href="/" className="btn btn-subtle">
          กลับหน้าแรก
        </Link>
      </div>
    </section>
  )
}
