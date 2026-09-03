import { listTableOverview } from "@/lib/queries"
import { TableOverview } from "@/components/table-overview"

export const metadata = { title: "ผังโต๊ะ" }

export default async function TablesPage() {
  const tables = await listTableOverview()

  return <TableOverview tables={tables} />
}
