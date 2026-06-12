"use client";

import { useState } from "react";
import { api, type ZoneItem } from "@/lib/api";

export default function ZonesPanel({
  zones,
  drawingColor,
  onColorChange,
  onStartDraw,
  onZonesChanged,
}: {
  zones: ZoneItem[];
  drawingColor: string;
  onColorChange: (c: string) => void;
  onStartDraw: () => void;
  onZonesChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [zoneContacts, setZoneContacts] = useState<
    { contact_id: string; first_name: string; surname: string }[]
  >([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar esta zona?")) return;
    setBusy(true);
    try {
      await api.deleteZone(id);
      if (selectedZone === id) { setSelectedZone(null); setZoneContacts([]); }
      onZonesChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleZoneContacts(id: number) {
    if (selectedZone === id) { setSelectedZone(null); setZoneContacts([]); return; }
    setSelectedZone(id);
    setZoneContacts([]);
    setLoadingContacts(true);
    try {
      const rows = await api.zoneContacts(id);
      setZoneContacts(rows);
    } catch {
      setZoneContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }

  return (
    <section>
      <p className="section-title">Zonas / sectores</p>

      {zones.length === 0 && (
        <p className="empty">Sin zonas. Dibuja la primera en el mapa.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 }}>
        {zones.map((z) => (
          <div key={z.zone_id}>
            <div className="zone-row" onClick={() => toggleZoneContacts(z.zone_id)}>
              <span
                className="zone-swatch"
                style={{ background: z.color + "44", border: `2px solid ${z.color}` }}
              />
              <span className="zone-name">{z.name}</span>
              <span className="trend-count">{z.contact_count}</span>
              <button
                className="tag-x"
                disabled={busy}
                title="Eliminar zona"
                onClick={(e) => { e.stopPropagation(); handleDelete(z.zone_id); }}
              >
                ✕
              </button>
            </div>

            {selectedZone === z.zone_id && (
              <div className="zone-contacts">
                {loadingContacts && <p className="empty">Cargando…</p>}
                {!loadingContacts && zoneContacts.length === 0 && (
                  <p className="empty">Sin contactos ubicados en esta zona.</p>
                )}
                {zoneContacts.map((c) => (
                  <div key={c.contact_id} className="zone-contact-item">
                    {c.first_name} {c.surname}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="color"
          className="swatch"
          value={drawingColor}
          onChange={(e) => onColorChange(e.target.value)}
          title="Color de la nueva zona"
        />
        <button className="chip" style={{ flex: 1 }} onClick={onStartDraw}>
          + Dibujar zona
        </button>
      </div>
    </section>
  );
}
