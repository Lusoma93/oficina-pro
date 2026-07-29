"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

export default function Protocolos() {
  const [protocolos, setProtocolos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [nuevoProtocolo, setNuevoProtocolo] = useState({
    nombre: '', descripcion: '', activo: true
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    // Traemos los protocolos y la cuenta de folios usados (proyectos asociados)
    const { data } = await supabase
      .from('protocolos')
      .select('*, proyectos(id)')
      .order('created_at', { ascending: false });
    
    setProtocolos(data || []);
    setLoading(false);
  }

  async function handleSetActivo(id) {
    setLoading(true);
    await supabase.from('protocolos').update({ activo: false }).not('id', 'eq', id);
    await supabase.from('protocolos').update({ activo: true }).eq('id', id);
    fetchData();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (nuevoProtocolo.activo) {
      await supabase.from('protocolos').update({ activo: false }).not('id', 'eq', editingId || 0);
    }
    
    if (editingId) {
      await supabase.from('protocolos').update({
        nombre: nuevoProtocolo.nombre,
        descripcion: nuevoProtocolo.descripcion,
        activo: nuevoProtocolo.activo
      }).eq('id', editingId);
    } else {
      await supabase.from('protocolos').insert([nuevoProtocolo]);
    }
    setShowModal(false);
    setEditingId(null);
    setNuevoProtocolo({ nombre: '', descripcion: '', activo: true });
    fetchData();
  }

  async function handleDelete(id) {
    if (confirm("¿Seguro que desea eliminar este protocolo? Si tiene folios asignados podría causar errores de referencia.")) {
      await supabase.from('protocolos').delete().eq('id', id);
      fetchData();
    }
  }

  return (
    <div className="animate-fade">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Tomos de Protocolo</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gestión de tomos activos para la asignación de folios pares (2 al 186).</p>
        </div>
        <button onClick={() => { setEditingId(null); setNuevoProtocolo({ nombre: '', descripcion: '', activo: true }); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Registrar Protocolo
        </button>
      </header>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 450, background: 'var(--bg-sidebar)' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>{editingId ? 'Editar Protocolo' : 'Nuevo Protocolo'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nombre / Referencia del Tomo</label>
                <input placeholder="Ej. Protocolo Tomo III (2025)" required value={nuevoProtocolo.nombre} onChange={(e) => setNuevoProtocolo({...nuevoProtocolo, nombre: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Descripción (Opcional)</label>
                <textarea placeholder="Detalles o notas sobre el uso de este tomo..." value={nuevoProtocolo.descripcion || ''} onChange={(e) => setNuevoProtocolo({...nuevoProtocolo, descripcion: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', minHeight: '80px' }} />
              </div>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <input type="checkbox" checked={nuevoProtocolo.activo} onChange={(e) => setNuevoProtocolo({...nuevoProtocolo, activo: e.target.checked})} style={{ width: 16, height: 16 }} />
                Tomo Activo (Disponible para asignar folios)
              </label>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>{editingId ? 'Guardar Cambios' : 'Registrar Tomo'}</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`${styles.card} glass`}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>Tomo de Protocolo</th>
              <th style={{ padding: '1rem' }}>Descripción</th>
              <th style={{ padding: '1rem' }}>Folios Asignados</th>
              <th style={{ padding: '1rem' }}>Estado</th>
              <th style={{ padding: '1rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {protocolos.length === 0 && (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay protocolos registrados.</td></tr>
            )}
            {protocolos.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '1rem', fontWeight: 700, fontSize: '1.05rem' }}>{p.nombre}</td>
                <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.descripcion || '---'}</td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.05)', padding: '0.3rem 0.6rem', borderRadius: 8, fontWeight: 600 }}>
                      {p.proyectos?.length || 0} / 93
                    </div>
                  </div>
                </td>
                <td style={{ padding: '1rem' }}>
                  {p.activo ? (
                    <span style={{ padding: '0.3rem 0.6rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                      🟢 ACTIVO
                    </span>
                  ) : (
                    <button 
                      onClick={() => handleSetActivo(p.id)} 
                      style={{ padding: '0.3rem 0.6rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: 'rgba(0,0,0,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseOver={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = 'white'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      ⚡ Activar
                    </button>
                  )}
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => { setEditingId(p.id); setNuevoProtocolo(p); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                    <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
