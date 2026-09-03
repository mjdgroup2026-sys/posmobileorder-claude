import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getLowStockCount, getPendingNotificationCount } from "@/lib/queries"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const [lowStockCount, pendingNotificationCount] = await Promise.all([
    getLowStockCount(),
    getPendingNotificationCount(),
  ])

  return (
    <div className="app-shell">
      <Sidebar lowStockCount={lowStockCount} pendingNotificationCount={pendingNotificationCount} />
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
