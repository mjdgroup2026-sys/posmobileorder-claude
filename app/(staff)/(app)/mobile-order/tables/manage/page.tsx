import { listTablesForManage } from "@/lib/queries"
import { TableAdmin } from "@/components/table-admin"

export const metadata = { title: "จัดการโต๊ะ" }

export default async function ManageTablesPage() {
  const tables = await listTablesForManage()
  return <TableAdmin tables={tables} />
}
