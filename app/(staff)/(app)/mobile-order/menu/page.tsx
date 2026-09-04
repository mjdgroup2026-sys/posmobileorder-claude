import { listMenuForManage } from "@/lib/queries"
import { MenuAdmin } from "@/components/menu-admin"

export const metadata = { title: "จัดการเมนูอาหาร" }

export default async function ManageMenuPage() {
  const items = await listMenuForManage()
  return <MenuAdmin items={items} />
}
