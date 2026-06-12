"use client";

import dynamic from "next/dynamic";

// MapLibre toca `window`, así que el dashboard se carga solo en cliente.
const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => <main style={{ display: "grid", placeItems: "center" }}>Cargando mapa…</main>,
});

export default function Page() {
  return <Dashboard />;
}
