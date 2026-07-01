// El cliente siempre llama /api/... y Next lo reescribe al Fastify (next.config).
const BASE = "/api";

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, any>;
  }>;
}

export interface Trend {
  kind: string;
  label: string;
  color: string;
  contacts: number;
  total_weight: string;
}

export interface TraitCatalogItem {
  id: number;
  kind: string;
  label: string;
  color: string;
  contacts: number;
}

export interface ContactListItem {
  contact_id: string;
  first_name: string;
  middle_name: string | null;
  surname: string;
  birthdate: string | null;
  gender: string | null;
  created_at: string;
  lng: number | null;
  lat: number | null;
  has_location: boolean;
}

export interface ContactDetail {
  contact_id: string;
  first_name: string;
  middle_name: string | null;
  surname: string;
  gender: string | null;
  birthdate: string | null;
  status_id: string | null;
  instagram_username: string | null;
  created_at: string;
  phones: { phone: string; label: string | null }[];
  emails: { email: string; label: string | null }[];
  locations: { id: number; kind: string | null; lng: number; lat: number; is_primary: boolean }[];
  traits: {
    trait_id: number;
    kind: string;
    label: string;
    color: string;
    weight: number;
    source: string | null;
  }[];
}

export interface FamilyNode {
  contact_id: string;
  first_name: string;
  middle_name: string | null;
  surname: string;
  gender: string | null;
  has_location: boolean;
}

export interface FamilyEdge {
  id: number;
  source: string;
  target: string;
  type_id: string;
  label: string;
}

export interface FamilyTree {
  root_id: string;
  nodes: FamilyNode[];
  edges: FamilyEdge[];
}

export interface ZoneItem {
  zone_id: number;
  name: string;
  color: string;
  contact_count: number;
}

export interface InstaUser {
  pk: number;
  username: string;
  full_name: string | null;
  follower_count: number;
  is_verified: boolean;
  is_private: boolean;
  profile_pic_url: string | null;
}

export interface InstaMedia {
  pk: string | number;
  filename: string | null;
  taken_at: string;
  media_type: number; // 1=foto, 2=video, 8=álbum
}

const INSTA_BASE = "/insta";

export const instaApi = {
  searchUsers: async (q: string): Promise<InstaUser[]> => {
    try {
      const res = await fetch(`${INSTA_BASE}/api/history/users?q=${encodeURIComponent(q)}&limit=20`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.users ?? [];
    } catch {
      return [];
    }
  },
  getDownloads: async (username: string): Promise<{ gallery: InstaMedia[]; stories: InstaMedia[] } | null> => {
    try {
      const res = await fetch(`${INSTA_BASE}/api/downloads/${encodeURIComponent(username)}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },
  fileUrl: (username: string, section: "gallery" | "stories", filename: string) =>
    `${INSTA_BASE}/api/downloads/${encodeURIComponent(username)}/files/${section}/${encodeURIComponent(filename)}`,
  proxyUrl: (url: string) => `${INSTA_BASE}/api/proxy-image?url=${encodeURIComponent(url)}`,
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function send<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`${res.status} ${res.statusText}`);
}

export const api = {
  contacts: (q = "", limit = 1000, order = "desc") =>
    get<ContactListItem[]>(`/contacts?limit=${limit}&order=${order}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  assignLocation: (id: string, lng: number, lat: number, blur = true) =>
    send<{ id: number; lng: number; lat: number }>(`PUT`, `/contacts/${id}/location`, {
      lng,
      lat,
      blur,
    }),
  locations: (blurred = false) =>
    get<FeatureCollection>(`/geo/locations${blurred ? "?blurred=true" : ""}`),
  nearby: (lng: number, lat: number, radius: number, trait?: string) =>
    get<FeatureCollection>(
      `/geo/nearby?lng=${lng}&lat=${lat}&radius=${radius}` +
        (trait ? `&trait=${encodeURIComponent(trait)}` : ""),
    ),
  trends: (lng: number, lat: number, radius: number) =>
    get<{ trends: Trend[] }>(`/geo/trends?lng=${lng}&lat=${lat}&radius=${radius}`),
  contact: (id: string) => get<ContactDetail>(`/contacts/${id}`),

  // Catálogo de tendencias y asignación a contactos
  traitsCatalog: () => get<TraitCatalogItem[]>(`/traits`),
  addTrait: (
    id: string,
    body: {
      trait_id?: number;
      kind?: string;
      label?: string;
      color?: string;
      weight?: number;
      source?: string;
    },
  ) => send<unknown>("POST", `/contacts/${id}/traits`, body),
  removeTrait: (id: string, traitId: number) => del(`/contacts/${id}/traits/${traitId}`),
  updateTrait: (traitId: number, body: { color?: string; label?: string; kind?: string }) =>
    send<TraitCatalogItem>("PATCH", `/traits/${traitId}`, body),
  deleteTrait: (traitId: number) => del(`/traits/${traitId}`),

  familyTree: (id: string, depth = 4) =>
    get<FamilyTree>(`/contacts/${id}/family-tree?depth=${depth}`),

  // Zonas / sectores
  zones: () => get<FeatureCollection>("/geo/zones"),
  createZone: (name: string, color: string, coordinates: [number, number][]) =>
    send<{ id: number; name: string; color: string }>("POST", "/zones", { name, color, coordinates }),
  deleteZone: (id: number) => del(`/zones/${id}`),
  updateZone: (id: number, body: { name?: string; color?: string }) =>
    send<{ id: number; name: string; color: string }>("PATCH", `/zones/${id}`, body),
  zoneContacts: (id: number) =>
    get<{ contact_id: string; first_name: string; surname: string; lng: number; lat: number }[]>(
      `/zones/${id}/contacts`,
    ),
  createContact: async (data: {
    first_name: string; middle_name?: string; surname: string;
    birthdate?: string; gender?: "MALE" | "FEMALE"; status_id?: string;
  }): Promise<{ contact_id: string }> =>
    send<{ contact_id: string }>("POST", "/contacts", data),

  updateContact: (id: string, data: {
    first_name?: string; middle_name?: string | null; surname?: string;
    birthdate?: string | null; gender?: "MALE" | "FEMALE" | null; status_id?: string | null;
  }) => send<void>("PATCH", `/contacts/${id}`, data),

  deleteContact: (id: string) => del(`/contacts/${id}`),

  patchInstagram: async (id: string, instagram_username: string | null) => {
    const res = await fetch(`${BASE}/contacts/${id}/instagram`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instagram_username }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  },
};
