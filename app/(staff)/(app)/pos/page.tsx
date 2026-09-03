import { listProductOptions, listCategoryOptions } from "@/lib/queries"
import { PosTerminal } from "@/components/pos-terminal"

export const metadata = { title: "ขายหน้าร้าน (POS)" }

export default async function PosPage() {
  const [products, categories] = await Promise.all([listProductOptions(), listCategoryOptions()])

  return <PosTerminal products={products} categories={categories} />
}
