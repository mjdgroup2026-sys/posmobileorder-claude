"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formatBaht } from "@/lib/format"
import type { MenuItemCard } from "@/lib/queries"
import { addToCart } from "@/lib/cart-storage"

/// หน้าปรับแต่งเมนูก่อนใส่ตะกร้า — radio เมื่อ selectionType = SINGLE, checkbox เมื่อ MULTIPLE (F14)
export function ItemForm({ qrToken, item }: { qrToken: string; item: MenuItemCard }) {
  const router = useRouter()
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState("")
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    // กลุ่มที่บังคับเลือกและเป็นแบบเลือกอย่างเดียว ให้ติ๊กตัวแรกไว้ก่อน ลูกค้าจะได้กดสั่งได้เลย
    const initial: Record<string, string[]> = {}
    for (const group of item.modifierGroups) {
      if (group.required && group.selectionType === "SINGLE" && group.options[0]) {
        initial[group.id] = [group.options[0].id]
      }
    }
    return initial
  })

  const optionIds = Object.values(selected).flat()
  const extra = item.modifierGroups
    .flatMap((g) => g.options)
    .filter((o) => optionIds.includes(o.id))
    .reduce((sum, o) => sum + o.priceDelta, 0)
  const unitPrice = Math.round((item.price + extra + Number.EPSILON) * 100) / 100

  function toggle(groupId: string, optionId: string, single: boolean) {
    setSelected((prev) => {
      const current = prev[groupId] ?? []
      if (single) return { ...prev, [groupId]: [optionId] }
      return {
        ...prev,
        [groupId]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      }
    })
  }

  function handleAdd() {
    for (const group of item.modifierGroups) {
      if (group.required && (selected[group.id] ?? []).length === 0) {
        toast.error(`กรุณาเลือก "${group.name}" ก่อน`)
        return
      }
    }

    const optionNames = item.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => optionIds.includes(o.id))
      .map((o) => o.name)

    addToCart(qrToken, {
      menuItemId: item.id,
      name: item.name,
      unitPrice,
      quantity,
      optionIds,
      optionNames,
      note: note.trim() === "" ? undefined : note.trim(),
    })

    toast.success(`เพิ่ม ${item.name} ลงตะกร้าแล้ว`)
    router.push(`/order/${qrToken}/menu`)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card-ui card-pad">
        <h1 className="t-h2">{item.name}</h1>
        {item.description ? (
          <p className="t-body" style={{ marginTop: 6 }}>
            {item.description}
          </p>
        ) : null}
        <p className="num" style={{ marginTop: 10, fontWeight: 700, color: "var(--brand-strong)" }}>
          ฿{formatBaht(item.price)}
        </p>
      </section>

      {item.modifierGroups.map((group) => (
        <section key={group.id} className="card-ui card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h2 className="t-h3">{group.name}</h2>
            <span className="t-caption">
              {group.required ? "ต้องเลือก" : "ไม่บังคับ"} ·{" "}
              {group.selectionType === "SINGLE" ? "เลือกได้ 1 อย่าง" : "เลือกได้หลายอย่าง"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {group.options.map((option) => {
              const checked = (selected[group.id] ?? []).includes(option.id)
              return (
                <label key={option.id} className="checkbox-row">
                  <input
                    type={group.selectionType === "SINGLE" ? "radio" : "checkbox"}
                    name={group.id}
                    checked={checked}
                    onChange={() => toggle(group.id, option.id, group.selectionType === "SINGLE")}
                  />
                  <span style={{ flex: 1 }}>{option.name}</span>
                  {option.priceDelta > 0 ? (
                    <span className="t-small num">+฿{formatBaht(option.priceDelta)}</span>
                  ) : null}
                </label>
              )
            })}
          </div>
        </section>
      ))}

      <section className="card-ui card-pad">
        <div className="field">
          <label className="t-small" htmlFor="note">
            โน้ตถึงครัว
          </label>
          <input
            id="note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น ไม่ใส่ผักชี"
          />
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
          <span className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-subtle btn-icon"
              aria-label="ลดจำนวน"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span className="num" style={{ minWidth: 32, textAlign: "center", fontWeight: 700 }}>
              {quantity}
            </span>
            <button
              type="button"
              className="btn btn-subtle btn-icon"
              aria-label="เพิ่มจำนวน"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            >
              +
            </button>
          </span>
          <span className="num" style={{ fontWeight: 700 }}>
            ฿{formatBaht(unitPrice * quantity)}
          </span>
        </div>
      </section>

      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={handleAdd}>
        เพิ่มลงตะกร้า
      </button>
    </div>
  )
}
