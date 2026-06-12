# trenmap-web

Frontend en **Next.js (App Router) + React + MapLibre GL** (`react-map-gl`).
Mapa oscuro interactivo con los puntos de las ubicaciones, panel de tendencias
por zona y detalle de contacto.

## Arrancar

```bash
npm install
npm run dev      # http://localhost:5173
```

Requiere el API Fastify corriendo en `http://localhost:3000` (y la base PostGIS
levantada con `docker compose up -d` en la raíz). Next reescribe `/api/*` hacia
el Fastify (ver `next.config.mjs`), así que no hay problemas de CORS.

Para apuntar a otro backend: `API_URL=http://otro:3000 npm run dev`.

## Qué hace

- **Mapa** (Carto dark, sin API key) con las ubicaciones como puntos verdes.
- **Panel izquierdo con todos los contactos** (buscable). Un punto relleno =
  ya ubicado; hueco = sin ubicar. Contador `ubicados/total`.
- **Asignar ubicación**: clic en 📍 junto a un contacto → modo "ubicar" → clic
  en el mapa para fijar su punto (`PUT /contacts/:id/location`, upsert: no
  duplica, lo mueve). `Esc` cancela.
- **Punto azul arrastrable** = centro de análisis. Al moverlo se recalculan las
  tendencias de la zona (`GET /geo/trends`).
- **Selector de radio** (1 / 5 / 10 / 25 km) que dibuja el anillo en el mapa.
- **Clic en un punto** → detalle del contacto con sus tendencias (`GET /contacts/:id`).
- **Ubicación difuminada** (on por defecto): usa `geom_blurred` para no exponer
  el domicilio exacto.

## Estructura

```
app/
  layout.tsx        # layout + CSS (incluye maplibre-gl.css)
  page.tsx          # carga el Dashboard solo en cliente (ssr:false)
  globals.css       # estilo glass / dark
components/
  Dashboard.tsx     # mapa, fuentes/capas, estado, interacción
  TrendsPanel.tsx   # ranking de tendencias en la zona
  ContactPanel.tsx  # detalle del contacto seleccionado
lib/
  api.ts            # cliente del API
```

## Notas

- El mapa se carga con `next/dynamic({ ssr:false })` porque MapLibre usa `window`.
- El basemap es de Carto (gratis para dev). Para producción considera MapTiler u
  OpenFreeMap con tu propia config.
- Si los puntos crecen mucho, conviene pasar de GeoJSON a **vector tiles**.
```
