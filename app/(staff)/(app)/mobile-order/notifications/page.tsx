import { listNotifications, listPaymentsAwaitingCallback } from "@/lib/queries"
import { NotificationBoard } from "@/components/notification-board"

export const metadata = { title: "การแจ้งเตือน" }

export default async function NotificationsPage() {
  const [notifications, awaitingCallback] = await Promise.all([
    listNotifications(),
    listPaymentsAwaitingCallback(),
  ])

  return <NotificationBoard notifications={notifications} awaitingCallback={awaitingCallback} />
}
