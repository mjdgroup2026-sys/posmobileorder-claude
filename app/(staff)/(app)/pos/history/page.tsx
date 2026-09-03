import { Suspense } from "react"
import { listSales } from "@/lib/queries"
import { SaleHistory } from "@/components/sale-history"

export const metadata = { title: "ประวัติการขาย" }

export default async function SaleHistoryPage({ searchParams }: PageProps<"/pos/history">) {
  const params = await searchParams
  const from = typeof params.from === "string" ? params.from : ""
  const to = typeof params.to === "string" ? params.to : ""
  const status = typeof params.status === "string" ? params.status : ""
  const search = typeof params.q === "string" ? params.q : ""

  const sales = await listSales({ from, to, status, search })

  return (
    <Suspense fallback={<p className="t-body">กำลังโหลด…</p>}>
      <SaleHistory sales={sales} from={from} to={to} status={status} search={search} />
    </Suspense>
  )
}
