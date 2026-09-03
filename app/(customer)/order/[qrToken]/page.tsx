import { SessionGate } from "@/components/customer/session-gate"

export const metadata = { title: "เปิดโต๊ะ" }

export default async function CustomerOrderEntryPage({ params }: PageProps<"/order/[qrToken]">) {
  const { qrToken } = await params

  return <SessionGate qrToken={qrToken} />
}
