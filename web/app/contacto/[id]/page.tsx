"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { api, type ContactDetail } from "@/lib/api";

const STATUSES = [
  { id: "soltero",     label: "Soltero/a" },
  { id: "casado",      label: "Casado/a" },
  { id: "union_libre", label: "Unión libre" },
  { id: "divorciado",  label: "Divorciado/a" },
  { id: "separado",    label: "Separado/a" },
  { id: "viudo",       label: "Viudo/a" },
];

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // edit
  const [editing, setEditing] = useState(false);
  const [editFirst, setEditFirst] = useState("");
  const [editMiddle, setEditMiddle] = useState("");
  const [editSurname, setEditSurname] = useState("");
  const [editBirthdate, setEditBirthdate] = useState("");
  const [editGender, setEditGender] = useState<"" | "MALE" | "FEMALE">("");
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.contact(id);
      setContact(data);
    } catch {
      setContact(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function startEdit() {
    if (!contact) return;
    setEditFirst(contact.first_name);
    setEditMiddle(contact.middle_name ?? "");
    setEditSurname(contact.surname);
    setEditBirthdate(contact.birthdate ?? "");
    setEditGender((contact.gender as "" | "MALE" | "FEMALE") ?? "");
    setEditStatus(contact.status_id ?? "");
    setConfirmDelete(false);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editFirst.trim() || !editSurname.trim()) return;
    setSaving(true);
    try {
      await api.updateContact(id, {
        first_name: editFirst.trim(),
        middle_name: editMiddle.trim() || null,
        surname: editSurname.trim(),
        birthdate: editBirthdate || null,
        gender: editGender || null,
        status_id: editStatus || null,
      });
      setEditing(false);
      load();
    } catch (err: any) {
      alert(err.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await api.deleteContact(id);
      router.push("/contacts");
    } catch (err: any) {
      alert(err.message ?? "Error al eliminar");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const label = (v: string) => STATUSES.find((s) => s.id === v)?.label ?? v;

  if (loading) {
    return (
      <div className="contact-detail-page">
        <div className="contact-detail-header">
          <button className="nav-back" onClick={() => router.back()}>← Volver</button>
        </div>
        <p className="empty">Cargando…</p>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="contact-detail-page">
        <div className="contact-detail-header">
          <button className="nav-back" onClick={() => router.back()}>← Volver</button>
        </div>
        <p className="empty">Contacto no encontrado.</p>
      </div>
    );
  }

  const fullName = [contact.first_name, contact.middle_name, contact.surname]
    .filter(Boolean).join(" ");

  return (
    <div className="contact-detail-page">
      <div className="contact-detail-header">
        <button className="nav-back" onClick={() => router.back()}>← Volver</button>
        <h1>{fullName}</h1>
        {!editing && (
          <button className="icon-btn" title="Editar" onClick={startEdit}>
            <Pencil size={15} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="contact-detail-body">
          <div className="edit-fields">
            <label>Nombre <span className="req">*</span></label>
            <input value={editFirst} onChange={(e) => setEditFirst(e.target.value)} autoFocus />

            <label>Segundo nombre</label>
            <input value={editMiddle} onChange={(e) => setEditMiddle(e.target.value)} placeholder="(opcional)" />

            <label>Apellido <span className="req">*</span></label>
            <input value={editSurname} onChange={(e) => setEditSurname(e.target.value)} />

            <div className="edit-row">
              <div>
                <label>Género</label>
                <select value={editGender} onChange={(e) => setEditGender(e.target.value as any)}>
                  <option value="">Sin especificar</option>
                  <option value="MALE">Masculino</option>
                  <option value="FEMALE">Femenino</option>
                </select>
              </div>
              <div>
                <label>Estado civil</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <label>Fecha de nacimiento</label>
            <input type="date" value={editBirthdate} onChange={(e) => setEditBirthdate(e.target.value)} />

            <div className="edit-actions">
              <button className="btn primary" disabled={saving || !editFirst.trim() || !editSurname.trim()} onClick={saveEdit}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              <button className="btn secondary" disabled={saving} onClick={() => setEditing(false)}>Cancelar</button>
            </div>

            <div className="delete-zone">
              {!confirmDelete ? (
                <button className="btn danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={13} /> Eliminar contacto
                </button>
              ) : (
                <div className="delete-confirm">
                  <span>¿Eliminar permanentemente?</span>
                  <button className="btn danger" disabled={deleting} onClick={doDelete}>
                    {deleting ? "…" : "Sí, eliminar"}
                  </button>
                  <button className="btn secondary" onClick={() => setConfirmDelete(false)}>No</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="contact-detail-body">
          <section>
            <h2>Información</h2>
            {contact.gender && <div className="kv"><span>Género</span><span>{contact.gender === "MALE" ? "Masculino" : "Femenino"}</span></div>}
            {contact.birthdate && <div className="kv"><span>Nacimiento</span><span>{contact.birthdate}</span></div>}
            {contact.status_id && <div className="kv"><span>Estado civil</span><span>{label(contact.status_id)}</span></div>}
            {contact.created_at && <div className="kv"><span>Creado</span><span>{contact.created_at.slice(0, 10)}</span></div>}
          </section>

          {contact.phones.length > 0 && (
            <section>
              <h2>Teléfonos</h2>
              {contact.phones.map((p, i) => (
                <div className="kv" key={i}><span>{p.label ?? "teléfono"}</span><span>{p.phone}</span></div>
              ))}
            </section>
          )}

          {contact.emails.length > 0 && (
            <section>
              <h2>Emails</h2>
              {contact.emails.map((e, i) => (
                <div className="kv" key={i}><span>{e.label ?? "email"}</span><span>{e.email}</span></div>
              ))}
            </section>
          )}

          {contact.locations.length > 0 && (
            <section>
              <h2>Ubicación</h2>
              {contact.locations.map((l) => (
                <div className="kv" key={l.id}>
                  <span>{l.kind ?? "principal"}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                    {l.lat.toFixed(5)}, {l.lng.toFixed(5)}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
