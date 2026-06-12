# trenmap

Mapa de gestión de contactos con análisis geoespacial de tendencias. Permite ubicar contactos en el mapa, definir zonas/sectores, analizar preferencias por radio, visualizar árboles familiares y vincular perfiles de Instagram.

## Stack

| Capa | Tecnología | Carpeta | Puerto |
|------|-----------|---------|--------|
| Base de datos | PostgreSQL 16 + PostGIS | `db/` | 5433 |
| API | Fastify + TypeScript | `api/` | 3000 |
| Frontend | Next.js 15 + MapLibre GL | `web/` | 5172 |
| Instagram | FastAPI + instagrapi → [luserv/grapi](https://github.com/luserv/grapi) | (externo) | 8000 |

---

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose
- [Node.js](https://nodejs.org/) ≥ 20
- [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`)

---

## Inicialización (primera vez)

### 1. Base de datos

```bash
docker compose up -d
```

Levanta PostgreSQL 16 + PostGIS en el puerto **5433**. Los scripts de `db/` se ejecutan automáticamente la primera vez que el volumen está vacío:

- `01_schema.sql` — esquema completo
- `02_data.sql` — datos migrados (571 contactos)
- `03_zones.sql` — tabla de zonas geográficas

Verificar que está listo:

```bash
docker compose ps          # Estado: healthy
docker exec -it trenmap-db psql -U trenmap -d trenmap -c "\dt"
```

### 2. API (Fastify)

```bash
cd api
npm install
npm run dev    # escucha en :3000, recarga automática con tsx watch
```

### 3. Frontend (Next.js)

```bash
cd web
pnpm install
pnpm dev       # escucha en :5172
```

Abrir [http://localhost:5172](http://localhost:5172).

### 4. Servicio Instagram (opcional)

La funcionalidad de vincular cuentas de Instagram y visualizar galerías requiere el servicio **[luserv/grapi](https://github.com/luserv/grapi)** corriendo en el puerto **8000**.

```bash
git clone https://github.com/luserv/grapi.git
cd grapi
docker compose up -d   # levanta FastAPI + PostgreSQL propio
```

El frontend proxea `/insta/*` → `http://localhost:8000` automáticamente (configurado en `web/next.config.mjs`). Si el servicio no está activo, el resto de la app funciona con normalidad; solo la sección de Instagram en el panel de contacto no mostrará resultados.

---

## Flujo de trabajo habitual

```bash
# Terminal 1 — base de datos (solo si no está corriendo)
docker compose up -d

# Terminal 2 — API
cd api && npm run dev

# Terminal 3 — frontend
cd web && pnpm dev
```

---

## Gestión de la base de datos

```bash
docker compose up -d        # arrancar (preserva datos)
docker compose down         # parar (preserva datos)
docker compose down -v      # ⚠️ parar y BORRAR todos los datos

# Reinicializar desde cero (re-ejecuta los scripts SQL)
docker compose down -v && docker compose up -d

# Consola psql
docker exec -it trenmap-db psql -U trenmap -d trenmap
```

### Conexión

```
Host:     localhost
Puerto:   5433
Base:     trenmap
Usuario:  trenmap
Password: trenmap

URL: postgresql://trenmap:trenmap@localhost:5433/trenmap
```

---

## Estructura del proyecto

```
trendmap/
├── docker-compose.yml
├── db/
│   ├── 01_schema.sql      # Esquema: tablas + extensiones PostGIS
│   ├── 02_data.sql        # Datos iniciales (contactos migrados de SQLite)
│   └── 03_zones.sql       # Tabla de zonas geográficas
├── api/                   # Fastify API (TypeScript)
│   ├── src/
│   │   ├── server.ts
│   │   └── routes/
│   │       ├── contacts.ts
│   │       ├── geo.ts
│   │       ├── traits.ts
│   │       └── zones.ts
│   └── package.json
└── web/                   # Next.js frontend
    ├── app/
    ├── components/
    │   ├── Dashboard.tsx
    │   ├── ContactPanel.tsx
    │   ├── ContactsList.tsx
    │   ├── FamilyTree.tsx
    │   ├── Legend.tsx
    │   └── ZonesPanel.tsx
    └── package.json
```

---

## Funcionalidades

- **Mapa interactivo** — puntos coloreados por tendencia principal, popup al hacer clic
- **Contactos** — CRUD completo, búsqueda, ubicar/reubicar en el mapa
- **Zonas** — dibujar polígonos en el mapa, ver contactos dentro de cada zona
- **Tendencias** — catálogo con CRUD, asignación por contacto, leyenda editable
- **Árbol familiar** — visualización de relaciones con React Flow
- **Radio de análisis** — tendencias dominantes dentro de 1/5/10/25 km
- **Instagram** — vincular cuentas a contactos, previsualizar galería descargada

---

## Tablas principales

| Tabla | Descripción |
|-------|-------------|
| `contact` | 571 contactos con nombre, género, estado civil |
| `contact_location` | Ubicación geográfica exacta (PostGIS) |
| `trait` | Catálogo de tendencias/preferencias |
| `contact_trait` | Relación contacto ↔ tendencia con peso |
| `contact_relationship` | Relaciones familiares entre contactos |
| `zone` | Polígonos de zonas definidos por el administrador |
