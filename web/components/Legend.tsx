"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { api, type TraitCatalogItem } from "@/lib/api";

const KINDS = ["politica", "gastronomia", "agricultura", "comercio", "otro"];

type EditState = { label: string; kind: string; color: string };

export default function Legend({ refreshKey, onRecolor }: { refreshKey: number; onRecolor: () => void }) {
  const [catalog, setCatalog] = useState<TraitCatalogItem[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditState>({ label: "", kind: "", color: "" });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // New trait form
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState("politica");
  const [newColor, setNewColor] = useState("#38bdf8");

  const load = () => api.traitsCatalog().then(setCatalog).catch(console.error);
  useEffect(() => { load(); }, [refreshKey]);

  // Group by kind
  const grouped = catalog.reduce<Record<string, TraitCatalogItem[]>>((acc, t) => {
    (acc[t.kind] ??= []).push(t);
    return acc;
  }, {});

  function startEdit(t: TraitCatalogItem) {
    setEditId(t.id);
    setEdit({ label: t.label, kind: t.kind, color: t.color });
    setDeleteId(null);
  }

  async function saveEdit() {
    if (!editId || !edit.label.trim()) return;
    setBusy(true);
    try {
      const updated = await api.updateTrait(editId, {
        label: edit.label.trim(),
        kind: edit.kind,
        color: edit.color,
      });
      setCatalog((cs) => cs.map((c) => (c.id === editId ? { ...c, ...updated } : c)));
      setEditId(null);
      onRecolor();
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  }

  async function doDelete(id: number) {
    setBusy(true);
    try {
      await api.deleteTrait(id);
      setCatalog((cs) => cs.filter((c) => c.id !== id));
      setDeleteId(null);
      setEditId(null);
      onRecolor();
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  }

  async function createTrait() {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      await api.updateTrait(0, {}); // no-op type check; use direct send below
    } catch { /* ignore */ }
    try {
      const res = await fetch("/api/traits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: newKind, label: newLabel.trim(), color: newColor }),
      });
      if (res.ok) {
        setNewLabel(""); setCreating(false);
        await load();
        onRecolor();
      }
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <div className="section-title-row">
        <p className="section-title">Tendencias · catálogo</p>
        <button className="icon-btn" onClick={() => { setCreating(v => !v); setEditId(null); }} title="Nueva tendencia">
          {creating ? <X size={14} /> : <Plus size={14} />}
        </button>
      </div>

      {/* Formulario nueva tendencia */}
      {creating && (
        <div className="trait-create-form">
          <div className="modal-row">
            <label>
              Categoría
              <select value={newKind} onChange={e => setNewKind(e.target.value)}>
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label>
              Color
              <input type="color" className="swatch" style={{ width: "100%", height: 34 }}
                value={newColor} onChange={e => setNewColor(e.target.value)} />
            </label>
          </div>
          <label>
            Etiqueta
            <input className="search" placeholder="ej. tendencia: derecha"
              value={newLabel} onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createTrait()} autoFocus />
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-primary" style={{ flex: 1 }}
              disabled={busy || !newLabel.trim()} onClick={createTrait}>
              Crear
            </button>
            <button className="btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista agrupada por categoría */}
      {Object.entries(grouped).map(([kind, items]) => (
        <div key={kind} className="trait-group">
          <p className="trait-kind-label">{kind}</p>
          {items.map((t) => (
            <div key={t.id} className="trait-row">
              {editId === t.id ? (
                /* Fila en edición */
                <div className="trait-edit-inline">
                  <div className="modal-row" style={{ gap: 6 }}>
                    <select className="search" style={{ fontSize: 12, padding: "4px 6px" }}
                      value={edit.kind} onChange={e => setEdit(v => ({ ...v, kind: e.target.value }))}>
                      {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <input type="color" className="swatch"
                      value={edit.color} onChange={e => setEdit(v => ({ ...v, color: e.target.value }))} />
                  </div>
                  <input className="search" style={{ fontSize: 12, padding: "4px 8px" }}
                    value={edit.label} onChange={e => setEdit(v => ({ ...v, label: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && saveEdit()} autoFocus />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="chip active" style={{ flex: 1, fontSize: 11, gap: 4 }}
                      disabled={busy || !edit.label.trim()} onClick={saveEdit}>
                      <Check size={11} />Guardar
                    </button>
                    <button className="icon-btn" onClick={() => setEditId(null)}><X size={13} /></button>
                  </div>
                  {deleteId === t.id ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#f87171", flex: 1 }}>¿Eliminar?</span>
                      <button className="btn-delete-confirm" disabled={busy} onClick={() => doDelete(t.id)}>
                        Sí
                      </button>
                      <button className="btn-secondary" style={{ padding: "3px 8px", fontSize: 11 }}
                        onClick={() => setDeleteId(null)}>No</button>
                    </div>
                  ) : (
                    <button className="btn-delete" style={{ fontSize: 11, padding: "4px 0", gap: 5 }}
                      onClick={() => setDeleteId(t.id)}>
                      <Trash2 size={11} />Eliminar ({t.contacts} contacto{t.contacts !== 1 ? "s" : ""})
                    </button>
                  )}
                </div>
              ) : (
                /* Fila normal */
                <>
                  <span className="trait-swatch-sm" style={{ background: t.color }} />
                  <span className="trait-label-sm">{t.label}</span>
                  <span className="trait-count-sm">{t.contacts}</span>
                  <button className="trait-edit-btn icon-btn" onClick={() => startEdit(t)} title="Editar"><Pencil size={11} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      {catalog.length === 0 && <p className="empty">Sin tendencias. Crea una arriba.</p>}
    </section>
  );
}
