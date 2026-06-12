# trenmap-api

API REST en Node.js + TypeScript (Fastify + `pg`) sobre la base PostGIS de
trenmap. Sirve contactos, ubicaciones, tendencias y **GeoJSON** para el mapa.

## Arrancar

```bash
cp .env.example .env      # ajustar DATABASE_URL si hace falta
npm install
npm run dev               # desarrollo con recarga (tsx watch)
# o
npm start                 # ejecución simple
```

La base debe estar levantada (`docker compose up -d` en la raíz del proyecto).
Por defecto el API escucha en `http://localhost:3000`.

## Endpoints

### Salud
- `GET /health` → estado + versión de PostGIS.

### Contactos
- `GET /contacts?q=&limit=&offset=` → listado con búsqueda por nombre/apellido.
- `GET /contacts/:id` → detalle con teléfonos, emails, ubicaciones y tendencias.
- `POST /contacts/:id/locations` → añadir ubicación.
  ```json
  { "kind": "casa", "lng": -78.52, "lat": -0.23, "is_primary": true, "blur": true }
  ```
  `blur:true` genera `geom_blurred` (rejilla ~0.5 km) para mapas públicos.
- `DELETE /contacts/:id/locations/:locId`
- `POST /contacts/:id/traits` → asignar tendencia. Acepta `trait_id`, o
  `kind`+`label` (crea la tendencia si no existe).
  ```json
  { "kind": "agricultura", "label": "pitahaya", "weight": 1, "source": "declarado" }
  ```
- `DELETE /contacts/:id/traits/:traitId`

### Tendencias (catálogo)
- `GET /traits?kind=` → catálogo con nº de contactos por tendencia.
- `POST /traits` → `{ "kind": "...", "label": "..." }`

### Geo (para el mapa)
- `GET /geo/locations?bbox=minLng,minLat,maxLng,maxLat&blurred=true`
  → `FeatureCollection` de ubicaciones (con `blurred=true` usa el punto difuminado).
- `GET /geo/nearby?lng=&lat=&radius=&trait=`
  → `FeatureCollection` de contactos a `radius` metros, filtrable por tendencia.
- `GET /geo/trends?lng=&lat=&radius=&kind=`
  → tendencia dominante en la zona (agregado por `kind`/`label`).

## Geocodificación por lotes

Muchos contactos tienen en sus notas el bloque del **padrón electoral**
(`PROVINCIA`/`CANTÓN`/`PARROQUIA`/`RECINTO`). El script los ubica de golpe
consultando **Nominatim (OpenStreetMap)** — gratis, sin API key.

```bash
npx tsx scripts/geocode.ts --dry   # previsualiza (no escribe)
npx tsx scripts/geocode.ts         # geocodifica y guarda los puntos
```

- Resuelve a nivel **parroquia/cantón** (lo fiable en OSM para pueblos pequeños),
  coherente con el enfoque de "tendencias por zona".
- Respeta la política de Nominatim: User-Agent propio + 1 req/seg (con caché por
  consulta, así que parroquias repetidas no se repiten).
- Los votantes en el **exterior** (provincia = país) se ubican en su país real.
- Solo procesa contactos **sin ubicación previa**; es idempotente por contacto.

## Estructura

```
src/
  server.ts          # bootstrap Fastify + CORS
  db.ts              # pool de Postgres
  routes/
    contacts.ts      # CRUD contactos, ubicaciones, tendencias
    traits.ts        # catálogo de tendencias
    geo.ts           # consultas espaciales y GeoJSON
```

## Notas de diseño

- El GeoJSON se construye en SQL con `ST_AsGeoJSON` + `json_build_object`
  (sin serializar en JS) → rápido y directo.
- Para mapas públicos usa siempre `geom_blurred` (`blurred=true`); el `geom`
  exacto queda para uso interno.
- Si el volumen de puntos crece mucho, el siguiente paso es servir **vector
  tiles** (pg_tileserv / Martin) en vez de GeoJSON crudo.
```
