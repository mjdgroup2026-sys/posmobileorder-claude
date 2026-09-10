import { listCustomerPaidBills, listTableOverview } from "@/lib/queries"
import { TableOverview } from "@/components/table-overview"

export const metadata = { title: "ผังโต๊ะ" }

export default async function TablesPage() {
  const [tables, paidBills] = await Promise.all([listTableOverview(), listCustomerPaidBills()])

  return <TableOverview tables={tables} paidBills={paidBills} />
}
