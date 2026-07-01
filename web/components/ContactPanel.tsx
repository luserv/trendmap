"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, Pencil, MapPin, Link2, Link2Off, Plus, Trash2, GitBranch } from "lucide-react";
import { api, instaApi, type ContactDetail, type InstaMedia, type InstaUser, type TraitCatalogItem } from "@/lib/api";

const STATUSES = [
  { id: "soltero",     label: "Soltero/a" },
  { id: "casado",      label: "Casado/a" },
  { id: "union_libre", label: "Unión libre" },
  { id: "divorciado",  label: "Divorciado/a" },
  { id: "separado",    label: "Separado/a" },
  { id: "viudo",       label: "Viudo/a" },
];

export default function ContactPanel({
  contact,
  onClose,
  onChanged,
  onDeleted,
  onAssign,
}: {
  contact: ContactDetail | null;
  onClose: () => void;
  onChanged: () => void;
  onDeleted?: () => void;
  onAssign?: (id: string) => void;
}) {
  // ── traits ────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<TraitCatalogItem[]>([]);
  const [picker, setPicker] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState("politica");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#38bdf8");
  const [busy, setBusy] = useState(false);

  // ── Instagram ─────────────────────────────────────────────────────
  const [igQuery, setIgQuery] = useState("");
  const [igResults, setIgResults] = useState<InstaUser[]>([]);
  const [igSearching, setIgSearching] = useState(false);
  const [igPickerOpen, setIgPickerOpen] = useState(false);
  const igDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gallery, setGallery] = useState<InstaMedia[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  // ── edit mode ─────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editFirst, setEditFirst] = useState("");
  const [editMiddle, setEditMiddle] = useState("");
  const [editSurname, setEditSurname] = useState("");
  const [editBirthdate, setEditBirthdate] = useState("");
  const [editGender, setEditGender] = useState<"" | "MALE" | "FEMALE">("");
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // ── delete ────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadCatalog = () => api.traitsCatalog().then(setCatalog).catch(console.error);
  useEffect(() => { loadCatalog(); }, []);

  useEffect(() => {
    setIgPickerOpen(false);
    setIgQuery("");
    setIgResults([]);
    setGallery([]);
    setEditing(false);
    setConfirmDelete(false);
    if (contact?.instagram_username) {
      setGalleryLoading(true);
      instaApi.getDownloads(contact.instagram_username).then((data) => {
        const items = data ? (Array.isArray(data.gallery)
          ? data.gallery
          : Object.values(data.gallery as Record<string, InstaMedia[]>).flat()
        ) : [];
        setGallery(items.filter((m) => m.filename && m.media_type !== 2));
        setGalleryLoading(false);
      });
    }
  }, [contact?.contact_id, contact?.instagram_username]);

  useEffect(() => {
    if (!igPickerOpen) return;
    if (igDebounce.current) clearTimeout(igDebounce.current);
    igDebounce.current = setTimeout(async () => {
      setIgSearching(true);
      const users = await instaApi.searchUsers(igQuery.trim());
      setIgResults(users);
      setIgSearching(false);
    }, 300);
  }, [igQuery, igPickerOpen]);

  if (!contact) {
    return (
      <section>
        <p className="section-title">Contacto</p>
        <p className="empty">Haz clic en un punto del mapa para ver el detalle.</p>
      </section>
    );
  }

  const fullName = [contact.first_name, contact.middle_name, contact.surname]
    .filter(Boolean).join(" ");

  const assignedIds = new Set(contact.traits.map((t) => t.trait_id));
  const available = catalog.filter((t) => !assignedIds.has(t.id));

  // ── edit handlers ─────────────────────────────────────────────────
  function startEdit() {
    setEditFirst(contact!.first_name);
    setEditMiddle(contact!.middle_name ?? "");
    setEditSurname(contact!.surname);
    setEditBirthdate(contact!.birthdate ?? "");
    setEditGender((contact!.gender as "" | "MALE" | "FEMALE") ?? "");
    setEditStatus(contact!.status_id ?? "");
    setConfirmDelete(false);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editFirst.trim() || !editSurname.trim()) return;
    setSaving(true);
    try {
      await api.updateContact(contact!.contact_id, {
        first_name: editFirst.trim(),
        middle_name: editMiddle.trim() || null,
        surname: editSurname.trim(),
        birthdate: editBirthdate || null,
        gender: editGender || null,
        status_id: editStatus || null,
      });
      setEditing(false);
      onChanged();
    } catch (err: any) {
      alert(err.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  // ── delete handler ────────────────────────────────────────────────
  async function doDelete() {
    setDeleting(true);
    try {
      await api.deleteContact(contact!.contact_id);
      onDeleted?.();
    } catch (err: any) {
      alert(err.message ?? "Error al eliminar");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  // ── trait handlers ────────────────────────────────────────────────
  async function addFromCatalog(traitId: number) {
    setBusy(true);
    try {
      await api.addTrait(contact!.contact_id, { trait_id: traitId, source: "declarado" });
      setPicker("");
      onChanged();
    } finally { setBusy(false); }
  }

  async function createTrait() {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      await api.addTrait(contact!.contact_id, { kind: newKind.trim(), label: newLabel.trim(), color: newColor, source: "declarado" });
      setNewLabel(""); setCreating(false);
      await loadCatalog(); onChanged();
    } finally { setBusy(false); }
  }

  async function removeTrait(traitId: number) {
    setBusy(true);
    try { await api.removeTrait(contact!.contact_id, traitId); onChanged(); }
    finally { setBusy(false); }
  }

  // ── Instagram handlers ────────────────────────────────────────────
  async function linkInstagram(username: string) {
    setBusy(true);
    try { await api.patchInstagram(contact!.contact_id, username); setIgPickerOpen(false); setIgQuery(""); onChanged(); }
    finally { setBusy(false); }
  }
  async function unlinkInstagram() {
    setBusy(true);
    try { await api.patchInstagram(contact!.contact_id, null); onChanged(); }
    finally { setBusy(false); }
  }

  const fmtFollowers = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(0)}K`
    : String(n);

  // ── render ────────────────────────────────────────────────────────
  return (
    <section>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className="section-title">Contacto</p>
        <div style={{ display: "flex", gap: 4 }}>
          {!editing && (
            <button className="icon-btn" title="Editar" onClick={startEdit}><Pencil size={14} /></button>
          )}
          <button className="icon-btn" onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      {/* ── Modo edición ─────────────────────────────────────────── */}
      {editing ? (
        <div className="edit-form">
          <div className="modal-row">
            <label>
              Nombre <span className="req">*</span>
              <input value={editFirst} onChange={e => setEditFirst(e.target.value)} autoFocus />
            </label>
            <label>
              Segundo nombre
              <input value={editMiddle} onChange={e => setEditMiddle(e.target.value)} placeholder="(opcional)" />
            </label>
          </div>
          <label>
            Apellido <span className="req">*</span>
            <input value={editSurname} onChange={e => setEditSurname(e.target.value)} />
          </label>
          <div className="modal-row">
            <label>
              Género
              <select value={editGender} onChange={e => setEditGender(e.target.value as "" | "MALE" | "FEMALE")}>
                <option value="">Sin especificar</option>
                <option value="MALE">Masculino</option>
                <option value="FEMALE">Femenino</option>
              </select>
            </label>
            <label>
              Estado civil
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                <option value="">Sin especificar</option>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label>
            Fecha de nacimiento
            <input type="date" value={editBirthdate} onChange={e => setEditBirthdate(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button
              className="btn-primary"
              style={{ flex: 1 }}
              disabled={saving || !editFirst.trim() || !editSurname.trim()}
              onClick={saveEdit}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button className="btn-secondary" disabled={saving} onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>

          {/* Zona de eliminación */}
          <div className="delete-zone">
            {!confirmDelete ? (
              <button className="btn-delete" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} style={{ marginRight: 5 }} />Eliminar contacto
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#f87171", flex: 1 }}>¿Eliminar permanentemente?</span>
                <button className="btn-delete-confirm" disabled={deleting} onClick={doDelete}>
                  {deleting ? "…" : "Sí, eliminar"}
                </button>
                <button className="btn-secondary" style={{ padding: "5px 10px" }} onClick={() => setConfirmDelete(false)}>
                  No
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Vista normal ──────────────────────────────────────── */
        <>
          <p className="contact-name">{fullName}</p>
          {contact.gender && (
            <div className="kv">
              <span>Género</span>
              <span>{contact.gender === "MALE" ? "Masculino" : "Femenino"}</span>
            </div>
          )}
          {contact.birthdate && (
            <div className="kv"><span>Nacimiento</span><span>{contact.birthdate}</span></div>
          )}
          {contact.status_id && (
            <div className="kv">
              <span>Estado civil</span>
              <span>{STATUSES.find(s => s.id === contact.status_id)?.label ?? contact.status_id}</span>
            </div>
          )}
          {contact.created_at && (
            <div className="kv">
              <span>Creado</span>
              <span>{contact.created_at.slice(0, 10)}</span>
            </div>
          )}
          {contact.phones.map((p, i) => (
            <div className="kv" key={i}><span>{p.label ?? "teléfono"}</span><span>{p.phone}</span></div>
          ))}
          {contact.emails.map((e, i) => (
            <div className="kv" key={i}><span>{e.label ?? "email"}</span><span>{e.email}</span></div>
          ))}
        </>
      )}

      {/* ── Ubicación ─────────────────────────────────────────────── */}
      {!editing && (
        <>
          <p className="section-title" style={{ marginTop: 14 }}>Ubicación</p>
          {contact.locations.length === 0 ? (
            <p className="empty">Sin punto en el mapa.</p>
          ) : (
            contact.locations.map((l) => (
              <div className="kv" key={l.id}>
                <span>{l.kind ?? "principal"}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                  {l.lat.toFixed(5)}, {l.lng.toFixed(5)}
                </span>
              </div>
            ))
          )}
          {onAssign && (
            <button className="chip" style={{ marginTop: 6, width: "100%", gap: 6 }}
              onClick={() => onAssign(contact.contact_id)}>
              <MapPin size={13} />Reubicar en mapa
            </button>
          )}
          <Link href={`/contacto/${contact.contact_id}/arbol`} className="chip"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, textDecoration: "none" }}>
            <GitBranch size={13} />Ver árbol familiar
          </Link>

          {/* ── Instagram ──────────────────────────────────────────── */}
          <p className="section-title" style={{ marginTop: 14 }}>Instagram</p>
          {contact.instagram_username ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Link href={`/contacto/${contact.contact_id}/galeria`} className="chip active"
                style={{ textDecoration: "none" }}>
                @{contact.instagram_username}
              </Link>
              <button className="chip" disabled={busy} onClick={() => setIgPickerOpen(v => !v)}><Link2 size={12} />Cambiar</button>
              <button className="chip" disabled={busy} onClick={unlinkInstagram}><Link2Off size={12} />Desvincular</button>
            </div>
          ) : (
            <button className="chip" disabled={busy} onClick={() => setIgPickerOpen(v => !v)}>
              <Link2 size={12} />Vincular cuenta
            </button>
          )}

          {contact.instagram_username && !igPickerOpen && (
            <div style={{ marginTop: 8 }}>
              {galleryLoading && <p className="empty">Cargando…</p>}
              {!galleryLoading && gallery.length === 0 && <p className="empty">Sin contenido descargado.</p>}
              {gallery.length > 0 && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                    {gallery.slice(0, 6).map((item, idx) => {
                      const url = instaApi.fileUrl(contact.instagram_username!, "gallery", item.filename!);
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={`${item.pk}-${idx}`} src={url} alt=""
                          style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 2 }} />
                      );
                    })}
                  </div>
                  <Link href={`/contacto/${contact.contact_id}/galeria`} className="chip"
                    style={{ display: "block", textAlign: "center", marginTop: 8, textDecoration: "none" }}>
                    Ver galería completa ({gallery.length} fotos) →
                  </Link>
                </>
              )}
            </div>
          )}

          {igPickerOpen && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <input className="search" placeholder="Buscar por usuario o nombre…"
                value={igQuery} onChange={e => setIgQuery(e.target.value)} autoFocus />
              {igSearching && <p className="empty">Buscando…</p>}
              {!igSearching && igResults.length === 0 && igQuery.trim() && <p className="empty">Sin resultados.</p>}
              {!igSearching && igResults.length === 0 && !igQuery.trim() && <p className="empty">Escribe para buscar.</p>}
              <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {igResults.map(u => (
                  <button key={u.pk} className="chip" disabled={busy}
                    style={{ justifyContent: "flex-start", gap: 8, textAlign: "left" }}
                    onClick={() => linkInstagram(u.username)}>
                    {u.profile_pic_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={instaApi.proxyUrl(u.profile_pic_url)} alt="" width={24} height={24}
                        style={{ borderRadius: "50%", flexShrink: 0 }} />
                    )}
                    <span style={{ fontWeight: 600 }}>@{u.username}</span>
                    {u.full_name && <span style={{ opacity: 0.6 }}>{u.full_name}</span>}
                    <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: "0.8em" }}>{fmtFollowers(u.follower_count)}</span>
                    {u.is_verified && <span style={{ color: "#1D9BF0", fontSize: "0.8em" }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Tendencias ─────────────────────────────────────────── */}
          <p className="section-title" style={{ marginTop: 14 }}>Tendencias</p>
          {contact.traits.length === 0 && <p className="empty">Sin tendencias. Añade una abajo.</p>}
          <div className="tags">
            {contact.traits.map((t) => (
              <span className="tag" key={t.trait_id} title={t.kind}
                style={{ color: t.color, borderColor: t.color, background: `${t.color}22` }}>
                {t.label}
                <button className="tag-x" style={{ color: t.color }} disabled={busy}
                  onClick={() => removeTrait(t.trait_id)}><X size={10} /></button>
              </span>
            ))}
          </div>

          <div className="add-trait">
            {!creating ? (
              <>
                <select className="search" value={picker} disabled={busy}
                  onChange={(e) => e.target.value && addFromCatalog(Number(e.target.value))}>
                  <option value="">+ añadir del catálogo…</option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>{t.kind} · {t.label}</option>
                  ))}
                </select>
                <button className="chip" onClick={() => setCreating(true)}><Plus size={12} />Nueva</button>
              </>
            ) : (
              <div className="new-trait">
                <select className="search" value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                  <option value="politica">política</option>
                  <option value="gastronomia">gastronomía</option>
                  <option value="agricultura">agricultura</option>
                  <option value="comercio">comercio</option>
                  <option value="otro">otro</option>
                </select>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="color" className="swatch" value={newColor}
                    onChange={(e) => setNewColor(e.target.value)} title="color" />
                  <input className="search" style={{ flex: 1 }} placeholder="etiqueta (ej. tendencia: derecha)"
                    value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createTrait()} autoFocus />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="chip active" disabled={busy || !newLabel.trim()} onClick={createTrait}>Guardar</button>
                  <button className="chip" onClick={() => setCreating(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
