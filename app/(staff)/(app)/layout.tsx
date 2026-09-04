import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getLowStockCount, getPendingNotificationCount } from "@/lib/queries"
import { getCurrentPermissions, type ResourceKey } from "@/lib/permissions"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const [lowStockCount, pendingNotificationCount, permissions] = await Promise.all([
    getLowStockCount(),
    getPendingNotificationCount(),
    getCurrentPermissions(),
  ])

  // เมนูที่ไม่มีสิทธิ์ VIEW ต้องหายไปจาก Sidebar (§4) — อ่านจาก DB ทุกคำขอ ไม่ cache ข้ามคำขอ
  // จึงมีผลทันทีในคำขอถัดไปหลังผู้ดูแลเปลี่ยนบทบาทให้
  const viewableResources = (Object.keys(permissions?.granted ?? {}) as ResourceKey[]).filter((key) =>
    permissions?.granted[key]?.includes("VIEW"),
  )

  return (
    <div className="app-shell">
      <Sidebar
        lowStockCount={lowStockCount}
        pendingNotificationCount={pendingNotificationCount}
        viewableResources={viewableResources}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar
          user={{ name: session.user.name, email: session.user.email }}
          lowStockCount={lowStockCount}
          pendingNotificationCount={pendingNotificationCount}
        />
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
