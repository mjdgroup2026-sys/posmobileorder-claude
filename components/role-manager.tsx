"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createRole, updateRole, deleteRole } from "@/app/actions/roles"
import { formatNumber } from "@/lib/format"
import type { RoleRow } from "@/lib/queries"
import type { FieldErrors } from "@/lib/types"
import { IconLock, IconPlus, IconSpinner, IconTrash } from "@/components/icons"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ResourceKey = keyof typeof import("@/lib/permissions")["RESOURCE_ACTIONS"]
type PermissionAction = "VIEW" | "ADD" | "EDIT" | "DELETE"

type Matrix = Partial<Record<string, PermissionAction[]>>

export type RoleManagerProps = {
  roles: RoleRow[]
  /// ส่งมาจาก server เพื่อไม่ให้ client ต้อง import lib/permissions (ซึ่งเป็น server-only)
  resourceActions: Record<string, PermissionAction[]>
  resourceLabels: Record<string, string>
  actionLabels: Record<PermissionAction, string>
  actionHints: Record<string, string>
  canEdit: boolean
}

const ALL_ACTIONS: PermissionAction[] = ["VIEW", "ADD", "EDIT", "DELETE"]

export function RoleManager({
  roles,
  resourceActions,
  resourceLabels,
  actionLabels,
  actionHints,
  canEdit,
}: RoleManagerProps) {
  const router = useRouter()
  const resources = Object.keys(resourceActions)

  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<RoleRow | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [matrix, setMatrix] = useState<Matrix>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const open = creating || editing !== null

  function startCreate() {
    setEditing(null)
    setCreating(true)
    setName("")
    setDescription("")
    setMatrix({})
    setFieldErrors({})
  }

  function startEdit(role: RoleRow) {
    setCreating(false)
    setEditing(role)
    setName(role.name)
    setDescription(role.description ?? "")
    setMatrix({ ...role.permissions } as Matrix)
    setFieldErrors({})
  }

  function toggle(resource: string, action: PermissionAction) {
    setMatrix((current) => {
      const now = current[resource] ?? []
      const next = now.includes(action) ? now.filter((a) => a !== action) : [...now, action]
      return { ...current, [resource]: next }
    })
  }

  /// ปุ่มลัดตาม §4 — Full = ทุก action ที่ resource นั้นรองรับจริง, Readonly = เฉพาะ VIEW
  function preset(resource: string, mode: "full" | "readonly" | "none") {
    setMatrix((current) => ({
      ...current,
      [resource]:
        mode === "full" ? [...(resourceActions[resource] ?? [])] : mode === "readonly" ? ["VIEW"] : [],
    }))
  }

  function presetAll(mode: "full" | "readonly" | "none") {
    const next: Matrix = {}
    for (const resource of resources) {
      next[resource] =
        mode === "full" ? [...(resourceActions[resource] ?? [])] : mode === "readonly" ? ["VIEW"] : []
    }
    setMatrix(next)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setFieldErrors({})

    const formData = new FormData()
    if (editing) formData.set("id", editing.id)
    formData.set("name", name)
    formData.set("description", description)
    formData.set(
      "permissions",
      JSON.stringify(resources.map((resource) => ({ resource, actions: matrix[resource] ?? [] }))),
    )

    try {
      const result = await (editing ? updateRole(formData) : createRole(formData))
      if (!result.ok) {
        toast.error(result.error)
        setFieldErrors(result.fieldErrors ?? {})
        return
      }
      toast.success(result.message)
      setCreating(false)
      setEditing(null)
      router.refresh()
    } catch {
      toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  async function confirmDelete() {
    if (!removing) return
    setPending(true)
    const formData = new FormData()
    formData.set("id", removing.id)
    try {
      const result = await deleteRole(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      setRemoving(null)
      router.refresh()
    } catch {
      toast.error("ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  function summarize(role: RoleRow): string {
    const parts = resources
      .filter((resource) => (role.permissions[resource as ResourceKey] ?? []).length > 0)
      .map((resource) => resourceLabels[resource] ?? resource)
    return parts.length === 0 ? "ยังไม่มีสิทธิ์ใด" : parts.join(" · ")
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h1">บทบาทและสิทธิ์</h1>
          <p className="t-body" style={{ marginTop: 4 }}>
            กำหนดว่าบทบาทไหนเข้าหน้าใดได้และทำอะไรได้บ้าง — มีผลกับผู้ใช้ที่สังกัดบทบาทนั้นทันทีในคำขอถัดไป
          </p>
        </div>
        {canEdit ? (
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            <IconPlus size={17} aria-hidden />
            เพิ่มบทบาท
          </button>
        ) : null}
      </div>

      {canEdit ? null : (
        <div className="alert-banner info">
          คุณมีสิทธิ์ดูอย่างเดียว — การแก้ไขบทบาทต้องใช้สิทธิ์ {actionLabels.EDIT}ผู้ใช้งานและสิทธิ์
        </div>
      )}

      <section className="card-ui">
        <div className="datatable-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-3)", background: "var(--surface-2)" }}>
                <th style={{ padding: "10px 24px", fontWeight: 500 }}>บทบาท</th>
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>เข้าถึงได้</th>
                <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>ผู้ใช้</th>
                <th style={{ padding: "10px 24px", fontWeight: 500, textAlign: "right" }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "12px 24px" }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{role.name}</span>
                      {role.isSystem ? (
                        <span className="chip chip-brand">
                          <span className="dot" />
                          บทบาทระบบ
                        </span>
                      ) : null}
                    </span>
                    {role.description ? <span className="t-caption">{role.description}</span> : null}
                  </td>
                  <td className="t-caption" style={{ padding: "12px" }}>
                    {summarize(role)}
                  </td>
                  <td className="num" style={{ padding: "12px", textAlign: "right" }}>
                    {formatNumber(role.userCount)}
                  </td>
                  <td style={{ padding: "12px 24px", textAlign: "right" }}>
                    <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button type="button" className="btn btn-subtle btn-sm" onClick={() => startEdit(role)}>
                        {canEdit ? "แก้สิทธิ์" : "ดูสิทธิ์"}
                      </button>
                      {canEdit && !role.isSystem ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setRemoving(role)}
                        >
                          <IconTrash size={15} aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setCreating(false)
            setEditing(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {creating ? "เพิ่มบทบาทใหม่" : `${canEdit ? "แก้ไข" : "ดู"}บทบาท ${editing?.name ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              ติ๊กสิทธิ์ที่ต้องการต่อหน้า — ช่องที่จางคือ action ที่หน้านั้นไม่รองรับ (เช่น ledger ที่แก้ย้อนหลังไม่ได้)
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field-grid">
              <div className="field">
                <label className="t-small" htmlFor="roleName">
                  ชื่อบทบาท
                </label>
                <input
                  id="roleName"
                  className="input"
                  required
                  maxLength={60}
                  value={name}
                  disabled={!canEdit || editing?.isSystem}
                  onChange={(e) => setName(e.target.value)}
                />
                {editing?.isSystem ? (
                  <span className="field-hint">
                    <IconLock size={12} aria-hidden /> บทบาทระบบเปลี่ยนชื่อไม่ได้ แต่ปรับสิทธิ์ได้
                  </span>
                ) : null}
                {fieldErrors.name ? <span className="field-hint error">{fieldErrors.name}</span> : null}
              </div>

              <div className="field">
                <label className="t-small" htmlFor="roleDescription">
                  คำอธิบาย (ไม่บังคับ)
                </label>
                <input
                  id="roleDescription"
                  className="input"
                  maxLength={200}
                  value={description}
                  disabled={!canEdit}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            {canEdit ? (
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="t-small">ตั้งทั้งหมดเป็น:</span>
                <button type="button" className="btn btn-subtle btn-sm" onClick={() => presetAll("full")}>
                  Full
                </button>
                <button type="button" className="btn btn-subtle btn-sm" onClick={() => presetAll("readonly")}>
                  Readonly
                </button>
                <button type="button" className="btn btn-subtle btn-sm" onClick={() => presetAll("none")}>
                  ไม่มีสิทธิ์
                </button>
              </div>
            ) : null}

            <div className="datatable-wrap" style={{ maxHeight: 380, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--ink-3)", background: "var(--surface-2)" }}>
                    <th style={{ padding: "10px 12px", fontWeight: 500 }}>หน้า</th>
                    {ALL_ACTIONS.map((action) => (
                      <th key={action} style={{ padding: "10px 8px", fontWeight: 500, textAlign: "center" }}>
                        {actionLabels[action]}
                      </th>
                    ))}
                    <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>ลัด</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => {
                    const available = resourceActions[resource] ?? []
                    const selected = matrix[resource] ?? []
                    return (
                      <tr key={resource} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px 12px" }}>{resourceLabels[resource] ?? resource}</td>
                        {ALL_ACTIONS.map((action) => {
                          const supported = available.includes(action)
                          const hint = actionHints[`${resource}:${action}`]
                          return (
                            <td key={action} style={{ padding: "10px 8px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                aria-label={`${resourceLabels[resource] ?? resource} — ${actionLabels[action]}`}
                                title={hint}
                                checked={selected.includes(action)}
                                disabled={!supported || !canEdit}
                                onChange={() => toggle(resource, action)}
                              />
                              {hint ? (
                                <span className="t-caption" style={{ display: "block" }}>
                                  {hint}
                                </span>
                              ) : null}
                            </td>
                          )
                        })}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          {canEdit ? (
                            <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className="btn btn-subtle btn-sm"
                                onClick={() => preset(resource, "full")}
                              >
                                Full
                              </button>
                              <button
                                type="button"
                                className="btn btn-subtle btn-sm"
                                onClick={() => preset(resource, "readonly")}
                              >
                                Readonly
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => preset(resource, "none")}
                              >
                                ล้าง
                              </button>
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCreating(false)
                  setEditing(null)
                }}
              >
                ปิด
              </button>
              {canEdit ? (
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
                  บันทึก
                </button>
              ) : null}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ลบบทบาท {removing?.name}</DialogTitle>
            <DialogDescription>
              ลบได้เฉพาะบทบาทที่ไม่มีผู้ใช้สังกัดอยู่ — ถ้ายังมีผู้ใช้ ระบบจะปฏิเสธและบอกจำนวนให้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
              ไม่ลบ
            </button>
            <button type="button" className="btn btn-danger-solid" disabled={pending} onClick={confirmDelete}>
              {pending ? <IconSpinner size={17} className="animate-spin" aria-hidden /> : null}
              ยืนยันลบ
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
