import { listNotifications } from "@/lib/queries"
import { NotificationBoard } from "@/components/notification-board"

export const metadata = { title: "การแจ้งเตือน" }

export default async function NotificationsPage() {
  const notifications = await listNotifications()

  return <NotificationBoard notifications={notifications} />
}
