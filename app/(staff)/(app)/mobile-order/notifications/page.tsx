import { listCustomerPaidBills, listNotifications, listPaymentsAwaitingCallback } from "@/lib/queries"
import { NotificationBoard } from "@/components/notification-board"

export const metadata = { title: "การแจ้งเตือน" }

export default async function NotificationsPage() {
  const [notifications, awaitingCallback, paidBills] = await Promise.all([
    listNotifications(),
    listPaymentsAwaitingCallback(),
    listCustomerPaidBills(),
  ])

  return (
    <NotificationBoard
      notifications={notifications}
      awaitingCallback={awaitingCallback}
      paidBills={paidBills}
    />
  )
}
