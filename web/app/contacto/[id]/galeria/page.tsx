"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, instaApi, type ContactDetail, type InstaMedia } from "@/lib/api";

export default function GaleriaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [gallery, setGallery] = useState<InstaMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  useEffect(() => {
    api.contact(id).then((c) => {
      setContact(c);
      if (!c.instagram_username) { setLoading(false); return; }
      instaApi.getDownloads(c.instagram_username).then((data) => {
        const items = data ? (Array.isArray(data.gallery)
          ? data.gallery
          : Object.values(data.gallery as Record<string, InstaMedia[]>).flat()
        ) : [];
        setGallery(items.filter((m) => m.filename && m.media_type !== 2));
        setLoading(false);
      });
    }).catch(() => setLoading(false));
  }, [id]);

  const openLightbox = (idx: number) => {
    setLightboxIdx(idx);
    setLightbox(instaApi.fileUrl(contact!.instagram_username!, "gallery", gallery[idx].filename!));
  };

  const moveLightbox = (delta: number) => {
    const next = (lightboxIdx + delta + gallery.length) % gallery.length;
    setLightboxIdx(next);
    setLightbox(instaApi.fileUrl(contact!.instagram_username!, "gallery", gallery[next].filename!));
  };

  const fullName = contact
    ? [contact.first_name, contact.middle_name, contact.surname].filter(Boolean).join(" ")
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "28px 24px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <button
          className="chip"
          onClick={() => router.back()}
          style={{ flexShrink: 0 }}
        >
          ← Volver
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>{fullName || "…"}</h1>
          {contact?.instagram_username && (
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)" }}>
              @{contact.instagram_username} · {gallery.length} fotos
            </p>
          )}
        </div>
      </div>

      {/* Estado */}
      {loading && <p style={{ color: "var(--muted)" }}>Cargando…</p>}

      {!loading && !contact?.instagram_username && (
        <p style={{ color: "var(--muted)" }}>
          Este contacto no tiene cuenta de Instagram vinculada.
        </p>
      )}

      {!loading && contact?.instagram_username && gallery.length === 0 && (
        <p style={{ color: "var(--muted)" }}>
          Sin contenido descargado para @{contact.instagram_username}.{" "}
          Descárgalo desde el panel de instagrapi.
        </p>
      )}

      {/* Grid */}
      {gallery.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 4,
        }}>
          {gallery.map((item, idx) => {
            const url = instaApi.fileUrl(contact!.instagram_username!, "gallery", item.filename!);
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${item.pk}-${idx}`}
                src={url}
                alt=""
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "cover",
                  cursor: "zoom-in",
                  borderRadius: 3,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                onClick={() => openLightbox(idx)}
              />
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.93)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setLightbox(null)}
        >
          {/* Prev */}
          <button
            className="chip"
            style={{ position: "absolute", left: 24, zIndex: 1001, fontSize: 20 }}
            onClick={e => { e.stopPropagation(); moveLightbox(-1); }}
          >
            ‹
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            style={{
              maxWidth: "88vw", maxHeight: "88vh",
              objectFit: "contain", borderRadius: 4,
              cursor: "zoom-out",
            }}
            onClick={e => e.stopPropagation()}
          />

          {/* Next */}
          <button
            className="chip"
            style={{ position: "absolute", right: 24, zIndex: 1001, fontSize: 20 }}
            onClick={e => { e.stopPropagation(); moveLightbox(1); }}
          >
            ›
          </button>

          {/* Counter */}
          <span style={{
            position: "absolute", bottom: 24,
            color: "var(--muted)", fontSize: 13,
          }}>
            {lightboxIdx + 1} / {gallery.length}
          </span>
        </div>
      )}
    </div>
  );
}
