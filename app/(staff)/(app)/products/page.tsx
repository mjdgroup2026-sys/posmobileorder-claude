import { Suspense } from "react"
import { listProducts, listCategories } from "@/lib/queries"
import { ProductManager } from "@/components/product-manager"

export const metadata = { title: "สินค้า" }

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const params = await searchParams
  const search = typeof params.q === "string" ? params.q : ""
  const category = typeof params.category === "string" ? params.category : ""
  const onlyLow = params.filter === "low"

  const [allProducts, categories] = await Promise.all([
    listProducts({ search, category }),
    listCategories(),
  ])

  const products = onlyLow ? allProducts.filter((p) => p.isLow) : allProducts

  return (
    <Suspense fallback={<p className="t-body">กำลังโหลด…</p>}>
      <ProductManager
        products={products}
        categories={categories}
        search={search}
        category={category}
        onlyLow={onlyLow}
      />
    </Suspense>
  )
}
