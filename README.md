# trenmap

Mapa de gestión de contactos con análisis geoespacial de tendencias. Permite ubicar contactos en el mapa, definir zonas/sectores, analizar preferencias por radio, visualizar árboles familiares y vincular perfiles de Instagram.

## Stack

| Capa | Tecnología | Carpeta | Puerto |
|------|-----------|---------|--------|
| Base de datos | PostgreSQL 16 + PostGIS | `db/` | 5433 |
| API | Rust + Axum + sqlx | `api-rust/` | 3000 |
| Frontend | Next.js 15 + MapLibre GL | `web/` | 5172 |
| Instagram | FastAPI + instagrapi → [luserv/grapi](https://github.com/luserv/grapi) | (externo) | 8000 |

---

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose (incluido con Docker Desktop o `docker compose plugin`)

> Ya no es necesario instalar Rust, Node.js ni pnpm localmente. Todo corre dentro de contenedores con recarga automática al editar código.

---

## Inicialización (primera vez)

Levanta **base de datos**, **API Rust** y **frontend Next.js**:

```bash
docker compose up
```

Esto inicia:

| Servicio | Puerto | Recarga automática |
|----------|--------|--------------------|
| `db` — PostgreSQL 16 + PostGIS | 5433 | — |
| `api` — Rust Axum | 3000 | `cargo-watch` (recompila al guardar) |
| `web` — Next.js 15 + Turbopack | 5172 | HMR (refleja cambios al instante) |

Los scripts de `db/` se ejecutan automáticamente la primera vez que el volumen está vacío:

- `01_schema.sql` — esquema completo
- `02_data.sql` — datos migrados (571 contactos) — **no incluido en el repositorio** por contener información personal. Si tienes acceso a este archivo, colócalo en `db/` antes del primer `docker compose up`.
- `03_zones.sql` — tabla de zonas geográficas

Verificar que está listo:

```bash
docker compose ps          # todos deben mostrar "Up" o "healthy"
docker exec -it trenmap-db psql -U trenmap -d trenmap -c "\dt"
```

Abrir [http://localhost:5172](http://localhost:5172).

> La primera compilación del backend Rust descarga dependencias y puede tomar varios minutos. Las compilaciones siguientes serán incrementales y mucho más rápidas gracias al volumen persistente `cargo-target`.
>
> El servicio `web` inyecta `CI=true` para evitar prompts interactivos de pnpm, y el archivo `web/.npmrc` incluye `confirmModulesPurge=false` y la lista blanca de `onlyBuiltDependencies` necesaria para sharp y SWC. El store global de pnpm se persiste en el volumen `pnpm-store` para no redescargar en cada reinicio.

### Servicio Instagram (opcional)

La funcionalidad de vincular cuentas de Instagram y visualizar galerías requiere el servicio **[luserv/grapi](https://github.com/luserv/grapi)** corriendo en el puerto **8000**.

```bash
git clone https://github.com/luserv/grapi.git
cd grapi
docker compose up -d   # levanta FastAPI + PostgreSQL propio
```

El frontend proxea `/insta/*` → `http://host.docker.internal:8000` automáticamente (configurado en `web/next.config.mjs`). Si el servicio no está activo, el resto de la app funciona con normalidad; solo la sección de Instagram en el panel de contacto no mostrará resultados.

---

## Flujo de trabajo

```bash
# Arrancar todo (con recarga automática)
docker compose up

# O en segundo plano
docker compose up -d
docker compose logs -f   # seguir logs de todos los servicios

# Detener
docker compose down

# Reconstruir imágenes tras cambios en Dockerfile o package.json
docker compose up --build
```

---

## Gestión de la base de datos

```bash
docker compose up -d db     # arrancar solo la base (preserva datos)
docker compose down         # parar todo (preserva datos)
docker compose down -v      # ⚠️ parar y BORRAR todos los datos

# Reinicializar desde cero (re-ejecuta los scripts SQL)
docker compose down -v && docker compose up -d

# Consola psql
docker exec -it trenmap-db psql -U trenmap -d trenmap
```

### Conexión a la base de datos

Desde el host:

```
Host:     localhost
Puerto:   5433
Base:     trenmap
Usuario:  trenmap
Password: trenmap

URL: postgresql://trenmap:trenmap@localhost:5433/trenmap
```

Dentro de la red de Docker (para otros contenedores):

```
URL: postgresql://trenmap:trenmap@db:5432/trenmap
```

---

## Estructura del proyecto

```
trendmap/
├── docker-compose.yml
├── db/
│   ├── 01_schema.sql      # Esquema: tablas + extensiones PostGIS
│   ├── 02_data.sql        # Datos iniciales — no incluido en el repo (datos personales)
│   └── 03_zones.sql       # Tabla de zonas geográficas
├── api-rust/              # Rust API (Axum + sqlx + PostGIS)
│   ├── Dockerfile.dev     # Imagen de desarrollo con cargo-watch
│   └── src/
│       ├── main.rs
│       ├── db.rs
│       ├── error.rs
│       └── routes/
│           ├── mod.rs
│           ├── contacts.rs
│           ├── geo.rs
│           ├── traits.rs
│           ├── zones.rs
│           ├── relationships.rs
│           └── ...
└── web/                   # Next.js frontend
    ├── .dockerignore
    ├── .npmrc              # Config pnpm: build scripts permitidos + confirmModulesPurge=false
    ├── next.config.mjs     # Proxy /api/* → Rust, /insta/* → grapi
    ├── Dockerfile.dev      # Imagen de desarrollo con HMR
    ├── app/
    │   ├── contacts/      # Página de lista con cumpleaños por mes
    │   ├── contacto/
    │   │   └── [id]/      # Detalle/edición de contacto, árbol familiar, galería
    │   └── page.tsx       # Dashboard (mapa principal)
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
- **Contactos** — CRUD completo, búsqueda, orden por fecha, ubicar/reubicar en el mapa
- **Lista de contactos** (`/contacts`) — tabla completa con búsqueda, orden asc/desc, y vista de cumpleaños agrupados por mes
- **Detalle de contacto** (`/contacto/[id]`) — ficha con todos los datos, modo edición inline y eliminación
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
