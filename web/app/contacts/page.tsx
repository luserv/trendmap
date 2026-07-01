"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Search, X, Plus, Trash2, Cake, ChevronLeft, ChevronRight } from "lucide-react";
import { api, type ContactListItem } from "@/lib/api";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAY_HEADERS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function parseBirthday(bd: string): { day: number; month: number } | null {
  const dm = bd.match(/^(\d{1,2})\/(\d{1,2})\//);
  if (dm) return { day: +dm[1], month: +dm[2] };
  const iso = bd.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (iso) return { day: +iso[2], month: +iso[1] };
  return null;
}

const STATUSES = [
  { id: "soltero",     label: "Soltero/a" },
  { id: "casado",      label: "Casado/a" },
  { id: "union_libre", label: "Unión libre" },
  { id: "divorciado",  label: "Divorciado/a" },
  { id: "separado",    label: "Separado/a" },
  { id: "viudo",       label: "Viudo/a" },
];

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"list" | "birthdays">("list");

  // ── create modal ──
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newMiddle, setNewMiddle] = useState("");
  const [newSurname, setNewSurname] = useState("");
  const [newBirthdate, setNewBirthdate] = useState("");
  const [newGender, setNewGender] = useState<"" | "MALE" | "FEMALE">("");
  const [newStatus, setNewStatus] = useState("");
  const [creating, setCreating] = useState(false);

  // ── calendar ──
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [selDay, setSelDay] = useState<{ m: number; d: number } | null>(null);

  // ── delete confirm ──
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async (q: string, ord: "asc" | "desc") => {
    setLoading(true);
    try {
      const data = await api.contacts(q, 1000, ord);
      setContacts(data);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(search, order), 200);
    return () => clearTimeout(timer);
  }, [search, order, load]);

  function toggleOrder() {
    setOrder((v) => (v === "desc" ? "asc" : "desc"));
  }

  const birthdayMap = useMemo(() => {
    const map = new Map<string, ContactListItem[]>();
    for (const c of contacts) {
      if (!c.birthdate) continue;
      const bd = parseBirthday(c.birthdate);
      if (bd) {
        const key = `${bd.month}-${bd.day}`;
        if (map.has(key)) map.get(key)!.push(c);
        else map.set(key, [c]);
      }
    }
    return map;
  }, [contacts]);

  const calendarGrid = useMemo(() => {
    const first = new Date(calYear, calMonth, 1).getDay();
    const days = new Date(calYear, calMonth + 1, 0).getDate();
    const g: (number | null)[] = [];
    for (let i = 0; i < first; i++) g.push(null);
    for (let d = 1; d <= days; d++) g.push(d);
    return g;
  }, [calMonth, calYear]);

  function calPrev() {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
    setSelDay(null);
  }
  function calNext() {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
    setSelDay(null);
  }

  async function handleCreate() {
    if (!newFirst.trim() || !newSurname.trim()) return;
    setCreating(true);
    try {
      await api.createContact({
        first_name: newFirst.trim(),
        middle_name: newMiddle.trim() || undefined,
        surname: newSurname.trim(),
        birthdate: newBirthdate || undefined,
        gender: newGender || undefined,
        status_id: newStatus || undefined,
      });
      setShowCreate(false);
      setNewFirst("");
      setNewMiddle("");
      setNewSurname("");
      setNewBirthdate("");
      setNewGender("");
      setNewStatus("");
      load(search, order);
    } catch (err: any) {
      alert(err.message ?? "Error al crear");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteContact(id);
      setDeleteId(null);
      setContacts((prev) => prev.filter((c) => c.contact_id !== id));
    } catch (err: any) {
      alert(err.message ?? "Error al eliminar");
    }
  }

  return (
    <div className="contacts-page">
      <nav className="contacts-nav">
        <button className="nav-back" onClick={() => router.push("/")} title="Volver al mapa">
          ← Mapa
        </button>
        <h1>Contactos</h1>
        <span className="contact-count">{contacts.length}</span>
        <button className="icon-btn create-btn" onClick={() => setShowCreate(true)} title="Nuevo contacto">
          <Plus size={15} />
        </button>
      </nav>

      <div className="contacts-toolbar">
        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input
            className="search-input"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="icon-btn" onClick={() => setSearch("")}>
              <X size={14} />
            </button>
          )}
        </div>
        {tab === "list" && (
          <button className="icon-btn sort-btn" onClick={toggleOrder} title={order === "desc" ? "Más recientes primero" : "Más antiguos primero"}>
            {order === "desc" ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
            <span>{order === "desc" ? "Más reciente" : "Más antiguo"}</span>
          </button>
        )}
      </div>

      <div className="contacts-tabs">
        <button className={`tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
          Lista
        </button>
        <button className={`tab ${tab === "birthdays" ? "active" : ""}`} onClick={() => setTab("birthdays")}>
          <Cake size={13} /> Cumpleaños
        </button>
      </div>

      {/* ── Create modal ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nuevo contacto</h2>
              <button className="icon-btn" onClick={() => setShowCreate(false)}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <label>Nombre *</label>
              <input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} />
              <label>Segundo nombre</label>
              <input value={newMiddle} onChange={(e) => setNewMiddle(e.target.value)} />
              <label>Apellido *</label>
              <input value={newSurname} onChange={(e) => setNewSurname(e.target.value)} />
              <label>Fecha de nacimiento</label>
              <input value={newBirthdate} onChange={(e) => setNewBirthdate(e.target.value)} placeholder="DD/MM/YYYY" />
              <label>Género</label>
              <select value={newGender} onChange={(e) => setNewGender(e.target.value as any)}>
                <option value="">—</option>
                <option value="MALE">Masculino</option>
                <option value="FEMALE">Femenino</option>
              </select>
              <label>Estado civil</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                <option value="">—</option>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn primary" onClick={handleCreate} disabled={creating || !newFirst.trim() || !newSurname.trim()}>
                {creating ? "Creando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <p>¿Eliminar este contacto?</p>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
              <button className="btn danger" onClick={() => handleDelete(deleteId)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── List ── */}
      {tab === "list" && (
        <div className="contacts-list-page">
          {loading ? (
            <p className="empty">Cargando…</p>
          ) : contacts.length === 0 ? (
            <p className="empty">Sin resultados.</p>
          ) : (
            contacts.map((c) => {
              const name = [c.first_name, c.surname].filter(Boolean).join(" ").trim() || c.contact_id;
              const date = c.created_at?.slice(0, 10);
              return (
                <div className="contact-row" key={c.contact_id}>
                  <div className="contact-row-main" onClick={() => router.push(`/contacto/${c.contact_id}`)}>
                    <span className={`loc-dot-sm ${c.has_location ? "on" : ""}`} />
                    <span className="contact-row-name">{name}</span>
                    <span className="contact-row-date">{date}</span>
                  </div>
                  <button
                    className="icon-btn row-delete"
                    title="Eliminar"
                    onClick={(e) => { e.stopPropagation(); setDeleteId(c.contact_id); }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Birthdays (calendar) ── */}
      {tab === "birthdays" && (
        <div className="birthdays-page">
          {loading ? (
            <p className="empty">Cargando…</p>
          ) : (
            <>
              <div className="cal-header">
                <button className="cal-nav" onClick={calPrev}><ChevronLeft size={16} /></button>
                <span className="cal-title">{MONTHS[calMonth]} {calYear}</span>
                <button className="cal-nav" onClick={calNext}><ChevronRight size={16} /></button>
              </div>
              <div className="cal-grid">
                {DAY_HEADERS.map((d) => (
                  <div className="cal-dow" key={d}>{d}</div>
                ))}
                {calendarGrid.map((day, i) => {
                  if (day === null) return <div className="cal-cell empty" key={`e-${i}`} />;
                  const key = `${calMonth + 1}-${day}`;
                  const list = birthdayMap.get(key);
                  const has = list && list.length > 0;
                  const isSel = selDay?.m === calMonth && selDay?.d === day;
                  return (
                    <div
                      className={`cal-cell${has ? " has" : ""}${isSel ? " sel" : ""}`}
                      key={`d-${day}`}
                      onClick={() => { if (has) setSelDay(isSel ? null : { m: calMonth, d: day }); }}
                    >
                      <span className="cal-num">{day}</span>
                      {has && <span className="cal-dot" />}
                    </div>
                  );
                })}
              </div>
              {selDay && (() => {
                const key = `${selDay.m + 1}-${selDay.d}`;
                const list = birthdayMap.get(key) ?? [];
                return (
                  <div className="cal-detail">
                    <h4 className="cal-detail-title">{selDay.d} de {MONTHS[selDay.m]}</h4>
                    {list.map((c) => {
                      const name = [c.first_name, c.surname].filter(Boolean).join(" ").trim() || c.contact_id;
                      return (
                        <div className="cal-contact" key={c.contact_id}
                          onClick={() => router.push(`/contacto/${c.contact_id}`)}>
                          <span className={`loc-dot-sm ${c.has_location ? "on" : ""}`} />
                          <span className="cal-contact-name">{name}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {!loading && contacts.filter((c) => c.birthdate).length === 0 && (
                <p className="empty" style={{ padding: "16px", textAlign: "center" }}>Sin cumpleaños registrados.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
