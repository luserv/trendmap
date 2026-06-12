"use client";

import type { Trend } from "@/lib/api";

export default function TrendsPanel({ trends }: { trends: Trend[] }) {
  const max = Math.max(1, ...trends.map((t) => t.contacts));
  return (
    <section>
      <p className="section-title">Tendencias en la zona</p>
      {trends.length === 0 && <p className="empty">Sin datos en este radio. Arrastra el punto azul.</p>}
      {trends.map((t) => (
        <div className="trend-row" key={`${t.kind}-${t.label}`}>
          <div>
            <div className="trend-kind">{t.kind}</div>
            <div className="trend-label">
              <span className="trend-swatch" style={{ background: t.color }} />
              {t.label}
            </div>
            <div
              className="trend-bar"
              style={{ width: `${(t.contacts / max) * 100}%`, background: t.color }}
            />
          </div>
          <div className="trend-count" style={{ color: t.color }}>
            {t.contacts}
          </div>
        </div>
      ))}
    </section>
  );
}
