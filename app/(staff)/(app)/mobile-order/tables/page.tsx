import { listCustomerPaidBills, listPaymentsAwaitingCallback, listTableOverview } from "@/lib/queries"
import { TableOverview } from "@/components/table-overview"

export const metadata = { title: "ผังโต๊ะ" }

export default async function TablesPage() {
  const [tables, paidBills, awaitingCallback] = await Promise.all([
    listTableOverview(),
    listCustomerPaidBills(),
    listPaymentsAwaitingCallback(),
  ])

  return <TableOverview tables={tables} paidBills={paidBills} awaitingCallback={awaitingCallback} />
}
