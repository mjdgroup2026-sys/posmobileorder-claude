import { listKitchenTickets, getStoreSettings } from "@/lib/queries"
import { KitchenDisplay } from "@/components/kitchen-display"

export const metadata = { title: "Kitchen Display" }

export default async function KitchenPage() {
  const [tickets, settings] = await Promise.all([listKitchenTickets(), getStoreSettings()])

  return <KitchenDisplay tickets={tickets} hasKDS={settings?.hasKDS ?? false} />
}
