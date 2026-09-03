import { listCategoriesWithCount } from "@/lib/queries"
import { CategoryManager } from "@/components/category-manager"

export const metadata = { title: "หมวดหมู่สินค้า" }

export default async function CategoriesPage() {
  const categories = await listCategoriesWithCount()

  return <CategoryManager categories={categories} />
}
