"use client";

import { MapPin, Plus, PanelLeftClose } from "lucide-react";
import type { ContactListItem } from "@/lib/api";

export default function ContactsList({
  contacts,
  search,
  onSearch,
  assignId,
  onOpen,
  onAssign,
  onNew,
  onToggle,
  mobileOpen,
  hidden,
}: {
  contacts: ContactListItem[];
  search: string;
  onSearch: (v: string) => void;
  assignId: string | null;
  onOpen: (id: string) => void;
  onAssign: (id: string) => void;
  onNew: () => void;
  onToggle: () => void;
  mobileOpen?: boolean;
  hidden?: boolean;
}) {
  const located = contacts.filter((c) => c.has_location).length;

  return (
    <div className={`sidebar-left panel${mobileOpen ? " mobile-open" : ""}${hidden ? " panels-hidden" : ""}`}>
      <div className="section-title-row">
        <p className="section-title">Contactos · {located}/{contacts.length} ubicados</p>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="icon-btn" onClick={onNew} title="Nuevo contacto">
            <Plus size={14} />
          </button>
          <button className="icon-btn" onClick={onToggle} title="Ocultar panel">
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>
      <input
        className="search"
        placeholder="Buscar por nombre…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className="contact-list">
        {contacts.map((c) => {
          const name = [c.first_name, c.surname].filter(Boolean).join(" ").trim() || c.contact_id;
          const isAssigning = assignId === c.contact_id;
          return (
            <div className={`contact-item ${isAssigning ? "assigning" : ""}`} key={c.contact_id}>
              <button className="contact-main" onClick={() => onOpen(c.contact_id)}>
                <span className={`loc-dot ${c.has_location ? "on" : ""}`} />
                <span className="contact-itemname">{name}</span>
              </button>
              <button
                className={`icon-btn pin-btn ${isAssigning ? "active" : ""}`}
                title={c.has_location ? "Mover en el mapa" : "Ubicar en el mapa"}
                onClick={() => onAssign(c.contact_id)}
              >
                <MapPin size={13} />
              </button>
            </div>
          );
        })}
        {contacts.length === 0 && <p className="empty">Sin resultados.</p>}
      </div>
    </div>
  );
}
