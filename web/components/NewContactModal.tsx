"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";

const STATUSES = [
  { id: "soltero",     label: "Soltero/a" },
  { id: "casado",      label: "Casado/a" },
  { id: "union_libre", label: "Unión libre" },
  { id: "divorciado",  label: "Divorciado/a" },
  { id: "separado",    label: "Separado/a" },
  { id: "viudo",       label: "Viudo/a" },
];

interface Props { onClose: () => void; onCreated: (id: string) => void; }

export default function NewContactModal({ onClose, onCreated }: Props) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [surname, setSurname] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<"" | "MALE" | "FEMALE">("");
  const [statusId, setStatusId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !surname.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { contact_id } = await api.createContact({
        first_name: firstName.trim(),
        middle_name: middleName.trim() || undefined,
        surname: surname.trim(),
        birthdate: birthdate || undefined,
        gender: gender || undefined,
        status_id: statusId || undefined,
      });
      onCreated(contact_id);
    } catch (err: any) {
      setError(err.message ?? "Error al crear contacto");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <span>Nuevo contacto</span>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-row">
            <label>
              Nombre <span className="req">*</span>
              <input ref={firstRef} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nombre" required />
            </label>
            <label>
              Segundo nombre
              <input value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="(opcional)" />
            </label>
          </div>

          <label>
            Apellido <span className="req">*</span>
            <input value={surname} onChange={e => setSurname(e.target.value)} placeholder="Apellido" required />
          </label>

          <div className="modal-row">
            <label>
              Género
              <select value={gender} onChange={e => setGender(e.target.value as "" | "MALE" | "FEMALE")}>
                <option value="">Sin especificar</option>
                <option value="MALE">Masculino</option>
                <option value="FEMALE">Femenino</option>
              </select>
            </label>
            <label>
              Estado civil
              <select value={statusId} onChange={e => setStatusId(e.target.value)}>
                <option value="">Sin especificar</option>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>

          <label>
            Fecha de nacimiento
            <input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} />
          </label>

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving || !firstName.trim() || !surname.trim()}>
              {saving ? "Guardando…" : "Crear contacto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
