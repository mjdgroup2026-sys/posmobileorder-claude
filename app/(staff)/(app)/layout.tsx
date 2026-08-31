import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getLowStockCount } from "@/lib/queries"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  const lowStockCount = await getLowStockCount()

  return (
    <div className="app-shell">
      <Sidebar lowStockCount={lowStockCount} />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar
          user={{ name: session.user.name, email: session.user.email }}
          lowStockCount={lowStockCount}
        />
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
