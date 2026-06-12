"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { api, type ContactDetail, type FamilyTree } from "@/lib/api";
import FamilyTreeComponent from "@/components/FamilyTree";

// Leyenda de tipos de aristas
const LEGEND = [
  { color: "#38bdf8", dash: false, label: "Padre / Madre / Abuelo" },
  { color: "#6ee7b7", dash: false, label: "Tío / Tía" },
  { color: "#f472b6", dash: true, label: "Cónyuge" },
  { color: "#a78bfa", dash: true, label: "Hermano / Hermana" },
];

export default function ArbolPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [tree, setTree] = useState<FamilyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depth, setDepth] = useState(4);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.contact(id), api.familyTree(id, depth)])
      .then(([c, t]) => {
        setContact(c);
        setTree(t);
      })
      .catch(() => setError("No se pudo cargar el árbol familiar."))
      .finally(() => setLoading(false));
  }, [id, depth]);

  const fullName = contact
    ? [contact.first_name, contact.middle_name, contact.surname]
        .filter(Boolean)
        .join(" ")
    : "…";

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#0b0f14",
        color: "#e8edf2",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* ── Barra superior ───────────────────────────────────────────── */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(20,26,34,0.95)",
          backdropFilter: "blur(12px)",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "#9aa7b4",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "4px 10px",
          }}
          title="Volver al mapa"
        >
          ←
        </button>

        <div
          style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }}
        />

        <div>
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "1.2px",
              color: "#9aa7b4",
              display: "block",
            }}
          >
            Árbol familiar
          </span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{fullName}</span>
        </div>

        {/* Control de profundidad */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "#9aa7b4" }}>Generaciones:</span>
          {[2, 3, 4, 5].map((d) => (
            <button
              key={d}
              onClick={() => setDepth(d)}
              style={{
                background: depth === d ? "#38bdf8" : "rgba(255,255,255,0.04)",
                border: `1px solid ${depth === d ? "#38bdf8" : "rgba(255,255,255,0.1)"}`,
                color: depth === d ? "#04222e" : "#e8edf2",
                borderRadius: 999,
                padding: "4px 11px",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: depth === d ? 600 : 400,
              }}
            >
              {d}
            </button>
          ))}
        </div>

        {tree && (
          <span style={{ fontSize: 12, color: "#9aa7b4", marginLeft: 16 }}>
            {tree.nodes.length} persona{tree.nodes.length !== 1 ? "s" : ""} ·{" "}
            {tree.edges.length} relación{tree.edges.length !== 1 ? "es" : ""}
          </span>
        )}
      </div>

      {/* ── Contenido principal ───────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9aa7b4",
              fontSize: 14,
            }}
          >
            Cargando árbol…
          </div>
        )}

        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && tree && tree.nodes.length === 1 && tree.edges.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              padding: "10px 18px",
              background: "rgba(56,189,248,0.08)",
              borderBottom: "1px solid rgba(56,189,248,0.2)",
              fontSize: 13,
              color: "#9aa7b4",
              zIndex: 5,
            }}
          >
            Este contacto no tiene relaciones registradas. Puedes añadirlas desde el panel principal.
          </div>
        )}

        {!loading && !error && tree && (
          <ReactFlowProvider>
            <FamilyTreeComponent
              apiNodes={tree.nodes}
              apiEdges={tree.edges}
              rootId={id}
            />
          </ReactFlowProvider>
        )}

        {/* ── Leyenda ─────────────────────────────────────────────────── */}
        {!loading && !error && tree && (
          <div
            style={{
              position: "absolute",
              bottom: 18,
              right: 18,
              background: "rgba(20,26,34,0.85)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              zIndex: 5,
            }}
          >
            {LEGEND.map((l) => (
              <div
                key={l.label}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <svg width={28} height={4}>
                  <line
                    x1={0}
                    y1={2}
                    x2={28}
                    y2={2}
                    stroke={l.color}
                    strokeWidth={2}
                    strokeDasharray={l.dash ? "5 3" : undefined}
                  />
                </svg>
                <span style={{ color: "#9aa7b4" }}>{l.label}</span>
              </div>
            ))}
            <div
              style={{
                marginTop: 4,
                paddingTop: 6,
                borderTop: "1px solid rgba(255,255,255,0.06)",
                color: "#6b7280",
                fontSize: 11,
              }}
            >
              Clic en un nodo para centrar el árbol en esa persona
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
