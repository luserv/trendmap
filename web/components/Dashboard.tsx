"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelRightClose, PanelLeftOpen, PanelRightOpen } from "lucide-react";
import Map, {
  Source,
  Layer,
  Marker,
  Popup,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
  type CircleLayer,
  type FillLayer,
  type LineLayer,
} from "react-map-gl/maplibre";
import {
  api,
  type ContactDetail,
  type ContactListItem,
  type FeatureCollection,
  type Trend,
  type ZoneItem,
} from "@/lib/api";
import TrendsPanel from "./TrendsPanel";
import ContactPanel from "./ContactPanel";
import ContactsList from "./ContactsList";
import Legend from "./Legend";
import ZonesPanel from "./ZonesPanel";
import NewContactModal from "./NewContactModal";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const RADIUS_OPTIONS = [1000, 5000, 10000, 25000];

const pointLayer: CircleLayer = {
  id: "locations",
  type: "circle",
  source: "locations",
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 14, 8],
    "circle-color": ["coalesce", ["get", "color"], "#4ade80"],
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#0b0f14",
    "circle-opacity": 0.92,
  },
};

const ringFill: FillLayer = {
  id: "ring-fill",
  type: "fill",
  source: "ring",
  paint: { "fill-color": "#38bdf8", "fill-opacity": 0.08 },
};
const ringLine: LineLayer = {
  id: "ring-line",
  type: "line",
  source: "ring",
  paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-dasharray": [2, 2] },
};

const zoneFill: FillLayer = {
  id: "zone-fill",
  type: "fill",
  source: "zones",
  paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 },
};
const zoneLine: LineLayer = {
  id: "zone-line",
  type: "line",
  source: "zones",
  paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.75 },
};

function ringGeoJSON(lng: number, lat: number, meters: number, points = 72) {
  const coords: [number, number][] = [];
  const dx = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = meters / 110540;
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * 2 * Math.PI;
    coords.push([lng + dx * Math.cos(a), lat + dy * Math.sin(a)]);
  }
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} }],
  };
}

export default function Dashboard() {
  const [locations, setLocations] = useState<FeatureCollection | null>(null);
  const [center, setCenter] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const l = p.get("lng"), a = p.get("lat");
      if (l && a) return { lng: parseFloat(l), lat: parseFloat(a) };
    }
    return { lng: -78.52, lat: -0.23 };
  });
  const [radius, setRadius] = useState(10000);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [blurred, setBlurred] = useState(false);

  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [search, setSearch] = useState("");
  const [assignId, setAssignId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [mobileTab, setMobileTab] = useState<"contacts" | "analysis" | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const mapRef = useRef<MapRef>(null);
  const flyTo = useCallback((lng: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 14 });
  }, []);

  // Popup al hacer clic en un punto del mapa
  const [popup, setPopup] = useState<{
    lng: number; lat: number;
    contactId: string; name: string;
    color: string; trait: string | null;
  } | null>(null);

  const [showNewContact, setShowNewContact] = useState(false);

  // ── Zones state ─────────────────────────────────────────────────────────────
  const [zonesGeoJSON, setZonesGeoJSON] = useState<FeatureCollection | null>(null);
  const [zonesVersion, setZonesVersion] = useState(0);
  const bumpZones = useCallback(() => setZonesVersion((v) => v + 1), []);

  // Polygon drawing
  const [drawingZone, setDrawingZone] = useState(false);
  const [draftVertices, setDraftVertices] = useState<[number, number][]>([]);
  const [draftComplete, setDraftComplete] = useState(false);
  const [draftZoneName, setDraftZoneName] = useState("");
  const [draftZoneColor, setDraftZoneColor] = useState("#38bdf8");
  const [zoneSaving, setZoneSaving] = useState(false);

  // Derived: zone items for ZonesPanel
  const zoneItems = useMemo<ZoneItem[]>(
    () =>
      zonesGeoJSON?.features.map((f) => ({
        zone_id: f.properties.zone_id as number,
        name: f.properties.name as string,
        color: f.properties.color as string,
        contact_count: f.properties.contact_count as number,
      })) ?? [],
    [zonesGeoJSON],
  );

  // Draft polygon GeoJSON preview
  const draftGeoJSON = useMemo(() => {
    if (draftVertices.length < 2) return null;
    const coords = draftVertices;
    const closedCoords = [...coords, coords[0]];
    const features: object[] = [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: closedCoords },
        properties: {},
      },
    ];
    if (coords.length >= 3) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [closedCoords] },
        properties: {},
      });
    }
    return { type: "FeatureCollection", features };
  }, [draftVertices]);

  // ── Data loaders ─────────────────────────────────────────────────────────────
  const reloadTrends = useCallback(() => {
    api.trends(center.lng, center.lat, radius).then((r) => setTrends(r.trends)).catch(console.error);
  }, [center, radius]);

  const reloadLocations = useCallback(() => {
    api.locations(blurred).then(setLocations).catch(console.error);
  }, [blurred, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadContacts = useCallback(() => {
    api.contacts(search).then(setContacts).catch(console.error);
  }, [search]);

  const reloadZones = useCallback(() => {
    api.zones().then(setZonesGeoJSON).catch(console.error);
  }, [zonesVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reloadLocations(); }, [reloadLocations]);
  useEffect(() => {
    const t = setTimeout(reloadContacts, 200);
    return () => clearTimeout(t);
  }, [reloadContacts]);
  useEffect(() => { reloadTrends(); }, [reloadTrends, version]);
  useEffect(() => { reloadZones(); }, [reloadZones]);

  // Auto-refresh lista de contactos y puntos cada 30 s
  useEffect(() => {
    const id = setInterval(() => {
      reloadContacts();
      reloadLocations();
    }, 30_000);
    return () => clearInterval(id);
  }, [reloadContacts, reloadLocations]);

  // Esc cancels assign mode and drawing mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAssignId(null);
      setPopup(null);
      cancelDrawing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ring = useMemo(() => ringGeoJSON(center.lng, center.lat, radius), [center, radius]);

  const assignName = useMemo(() => {
    const c = contacts.find((x) => x.contact_id === assignId);
    return c ? [c.first_name, c.surname].filter(Boolean).join(" ").trim() : "";
  }, [assignId, contacts]);

  const openContact = useCallback((id: string) => {
    api.contact(id).then((c) => {
      setContact(c);
      setMobileTab("analysis");
    }).catch(console.error);
  }, []);

  // ── Drawing helpers ───────────────────────────────────────────────────────────
  function cancelDrawing() {
    setDrawingZone(false);
    setDraftVertices([]);
    setDraftComplete(false);
    setDraftZoneName("");
  }

  async function saveDraftZone() {
    if (!draftZoneName.trim() || draftVertices.length < 3) return;
    setZoneSaving(true);
    try {
      await api.createZone(draftZoneName.trim(), draftZoneColor, draftVertices);
      cancelDrawing();
      bumpZones();
    } finally {
      setZoneSaving(false);
    }
  }

  // ── Map click ─────────────────────────────────────────────────────────────────
  const onClick = useCallback(
    async (e: MapLayerMouseEvent) => {
      // Drawing zone: each click adds a vertex
      if (drawingZone && !draftComplete) {
        const { lng, lat } = e.lngLat;
        setDraftVertices((v) => [...v, [lng, lat] as [number, number]]);
        return;
      }

      // Assign location mode
      if (assignId) {
        const { lng, lat } = e.lngLat;
        try {
          await api.assignLocation(assignId, lng, lat, false);
          setAssignId(null);
          reloadLocations();
          reloadContacts();
          openContact(assignId);
        } catch (err) {
          console.error(err);
        }
        return;
      }

      // Normal: click en un punto → popup con info básica
      const f = e.features?.[0];
      if (f?.properties?.contact_id) {
        const { lng, lat } = e.lngLat;
        setPopup({
          lng, lat,
          contactId: String(f.properties.contact_id),
          name:      String(f.properties.name ?? ""),
          color:     String(f.properties.color ?? "#4ade80"),
          trait:     f.properties.trait ? String(f.properties.trait) : null,
        });
      } else {
        setPopup(null);
      }
    },
    [drawingZone, draftComplete, assignId, blurred, reloadLocations, reloadContacts, openContact],
  );

  const isDrawingOrAssigning = drawingZone || !!assignId;

  return (
    <main>
      <div className="brand panel">
        <span className="dot" />
        <div>
          <h1>trenmap</h1>
          <small>mapa de tendencias · {locations?.features.length ?? 0} ubicaciones</small>
        </div>
      </div>

      {/* Banner: asignar ubicación */}
      {assignId && !drawingZone && (
        <div className="assign-banner panel">
          Haz clic en el mapa para ubicar a <strong>{assignName || "este contacto"}</strong>
          <button className="chip" onClick={() => setAssignId(null)}>
            Cancelar (Esc)
          </button>
        </div>
      )}

      {/* Banner: dibujar zona (fase 1 — añadiendo vértices) */}
      {drawingZone && !draftComplete && (
        <div className="assign-banner panel" style={{ borderColor: draftZoneColor, boxShadow: `0 0 0 1px ${draftZoneColor}, 0 8px 30px rgba(0,0,0,.45)` }}>
          <span>
            Haz clic en el mapa para añadir vértices
            {draftVertices.length > 0 && ` · ${draftVertices.length} punto${draftVertices.length !== 1 ? "s" : ""}`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {draftVertices.length >= 3 && (
              <button className="chip active" onClick={() => setDraftComplete(true)}>
                Cerrar polígono
              </button>
            )}
            <button className="chip" onClick={cancelDrawing}>Cancelar (Esc)</button>
          </div>
        </div>
      )}

      {/* Banner: dibujar zona (fase 2 — nombrar y guardar) */}
      {drawingZone && draftComplete && (
        <div className="assign-banner panel" style={{ borderColor: draftZoneColor, boxShadow: `0 0 0 1px ${draftZoneColor}, 0 8px 30px rgba(0,0,0,.45)`, gap: 10 }}>
          <input
            className="search"
            style={{ flex: 1, minWidth: 0, padding: "6px 10px", fontSize: 13 }}
            placeholder="Nombre de la zona…"
            value={draftZoneName}
            onChange={(e) => setDraftZoneName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveDraftZone()}
            autoFocus
          />
          <button
            className="chip active"
            disabled={zoneSaving || !draftZoneName.trim()}
            onClick={saveDraftZone}
          >
            {zoneSaving ? "Guardando…" : "Guardar"}
          </button>
          <button className="chip" onClick={cancelDrawing}>Cancelar</button>
        </div>
      )}

      <ContactsList
        contacts={contacts}
        search={search}
        onSearch={setSearch}
        assignId={assignId}
        onOpen={(id) => { openContact(id); setMobileTab("analysis"); }}
        onAssign={setAssignId}
        onLocate={flyTo}
        onNew={() => setShowNewContact(true)}
        mobileOpen={mobileTab === "contacts"}
        hidden={!leftOpen}
        onToggle={() => setLeftOpen(v => !v)}
      />

      {showNewContact && (
        <NewContactModal
          onClose={() => setShowNewContact(false)}
          onCreated={(id) => {
            setShowNewContact(false);
            bump();
            openContact(id);
            setMobileTab("analysis");
          }}
        />
      )}

      <Map
        ref={mapRef}
        initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 11 }}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={["locations"]}
        onClick={onClick}
        cursor={isDrawingOrAssigning ? "crosshair" : "auto"}
      >
        <NavigationControl position="bottom-left" />

        {/* Zonas (debajo de los puntos) */}
        {zonesGeoJSON && (
          <Source id="zones" type="geojson" data={zonesGeoJSON as any}>
            <Layer {...zoneFill} />
            <Layer {...zoneLine} />
          </Source>
        )}

        {/* Anillo del radio de análisis */}
        <Source id="ring" type="geojson" data={ring as any}>
          <Layer {...ringFill} />
          <Layer {...ringLine} />
        </Source>

        {/* Puntos de ubicaciones */}
        {locations && (
          <Source id="locations" type="geojson" data={locations as any}>
            <Layer {...pointLayer} />
          </Source>
        )}

        {/* Preview del polígono en construcción */}
        {draftGeoJSON && (
          <Source id="draft-zone" type="geojson" data={draftGeoJSON as any}>
            <Layer
              id="draft-zone-fill"
              type="fill"
              filter={["==", ["geometry-type"], "Polygon"]}
              paint={{ "fill-color": draftZoneColor, "fill-opacity": 0.18 }}
            />
            <Layer
              id="draft-zone-line"
              type="line"
              filter={["==", ["geometry-type"], "LineString"]}
              paint={{ "line-color": draftZoneColor, "line-width": 2, "line-dasharray": [4, 2] }}
            />
          </Source>
        )}

        {/* Vértices del polígono en construcción */}
        {drawingZone && draftVertices.map((v, i) => (
          <Marker key={i} longitude={v[0]} latitude={v[1]} anchor="center">
            <div
              style={{
                width: i === 0 && draftVertices.length >= 3 ? 14 : 9,
                height: i === 0 && draftVertices.length >= 3 ? 14 : 9,
                borderRadius: "50%",
                background: draftZoneColor,
                border: "2px solid #fff",
                opacity: 0.9,
              }}
            />
          </Marker>
        ))}

        {/* Popup al hacer clic en un punto */}
        {popup && (
          <Popup
            longitude={popup.lng}
            latitude={popup.lat}
            anchor="bottom"
            offset={14}
            closeButton={false}
            onClose={() => setPopup(null)}
          >
            <div className="map-popup">
              <div className="map-popup-name">{popup.name}</div>
              {popup.trait && (
                <div className="map-popup-trait">
                  <span
                    className="map-popup-dot"
                    style={{ background: popup.color }}
                  />
                  {popup.trait}
                </div>
              )}
              <button
                className="chip active"
                style={{ marginTop: 8, width: "100%", fontSize: 12 }}
                onClick={() => {
                  openContact(popup.contactId);
                  setMobileTab("analysis");
                  setPopup(null);
                }}
              >
                Ver detalle →
              </button>
            </div>
          </Popup>
        )}

        {/* Centro de análisis, arrastrable */}
        <Marker
          longitude={center.lng}
          latitude={center.lat}
          draggable
          onDragEnd={(e) => setCenter({ lng: e.lngLat.lng, lat: e.lngLat.lat })}
          anchor="center"
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#38bdf8",
              border: "3px solid #04222e",
              boxShadow: "0 0 12px #38bdf8",
              cursor: "grab",
            }}
          />
        </Marker>
      </Map>

      <div className={`sidebar panel${mobileTab === "analysis" ? " mobile-open" : ""}${!rightOpen ? " panels-hidden" : ""}`}>
        <section>
          <div className="section-title-row">
            <p className="section-title">Radio de análisis</p>
            <button className="icon-btn" onClick={() => setRightOpen(false)} title="Ocultar panel"><PanelRightClose size={14} /></button>
          </div>
          <div className="controls">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                className={`chip ${r === radius ? "active" : ""}`}
                onClick={() => setRadius(r)}
              >
                {r / 1000} km
              </button>
            ))}
          </div>
          <label className="kv" style={{ marginTop: 12, cursor: "pointer" }}>
            <span>Ubicación difuminada</span>
            <input type="checkbox" checked={blurred} onChange={(e) => setBlurred(e.target.checked)} />
          </label>
        </section>

        <Legend refreshKey={version} onRecolor={bump} />
        <TrendsPanel trends={trends} />

        <ZonesPanel
          zones={zoneItems}
          drawingColor={draftZoneColor}
          onColorChange={setDraftZoneColor}
          onStartDraw={() => { setDrawingZone(true); setDraftVertices([]); setDraftComplete(false); }}
          onZonesChanged={bumpZones}
        />

        <ContactPanel
          contact={contact}
          onClose={() => setContact(null)}
          onAssign={(id) => {
            setAssignId(id);
            setContact(null);
            setMobileTab(null);
          }}
          onChanged={() => {
            if (contact) openContact(contact.contact_id);
            bump();
          }}
          onDeleted={() => {
            setContact(null);
            bump();
          }}
        />
      </div>

      {/* Pestañas de reapertura cuando un panel está cerrado */}
      {!leftOpen && (
        <button className="panel-tab panel-tab-left panel" onClick={() => setLeftOpen(true)} title="Mostrar contactos">
          <PanelLeftOpen size={14} />
        </button>
      )}
      {!rightOpen && (
        <button className="panel-tab panel-tab-right panel" onClick={() => setRightOpen(true)} title="Mostrar análisis">
          <PanelRightOpen size={14} />
        </button>
      )}

      <nav className="mobile-tabbar">
        <button
          className={`mobile-tab${mobileTab === null ? " active" : ""}`}
          onClick={() => setMobileTab(null)}
        >
          <span className="mobile-tab-icon">🗺️</span>
          Mapa
        </button>
        <button
          className={`mobile-tab${mobileTab === "contacts" ? " active" : ""}`}
          onClick={() => setMobileTab((t) => t === "contacts" ? null : "contacts")}
        >
          <span className="mobile-tab-icon">👥</span>
          Contactos
        </button>
        <button
          className={`mobile-tab${mobileTab === "analysis" ? " active" : ""}`}
          onClick={() => setMobileTab((t) => t === "analysis" ? null : "analysis")}
        >
          {contact && <span className="mobile-tab-badge" />}
          <span className="mobile-tab-icon">📊</span>
          Análisis
        </button>
      </nav>
    </main>
  );
}
