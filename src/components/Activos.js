"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

export default function Activos() {
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [nuevoActivo, setNuevoActivo] = useState({
    nombre: '', marca: '', modelo: '', serie: '', fecha_compra: '', valor: 0, estado: 'Operativo'
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase.from('activos').select('*').order('nombre', { ascending: true });
    setActivos(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      await supabase.from('activos').update(nuevoActivo).eq('id', editingId);
    } else {
      await supabase.from('activos').insert([nuevoActivo]);
    }
    setShowModal(false);
    setEditingId(null);
    setNuevoActivo({ nombre: '', marca: '', modelo: '', serie: '', fecha_compra: '', valor: 0, estado: 'Operativo' });
    fetchData();
  }

  async function handleDelete(id) {
    if (confirm("¿Eliminar este activo permanentemente?")) {
      await supabase.from('activos').delete().eq('id', id);
      fetchData();
    }
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Inventario de Activos</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gestión y mantenimiento de equipos técnicos.</p>
        </div>
        <button onClick={() => { setEditingId(null); setNuevoActivo({ nombre: '', marca: '', modelo: '', serie: '', fecha_compra: '', valor: 0, estado: 'Operativo' }); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Agregar Activo
        </button>
      </header>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 450, background: 'var(--bg-sidebar)' }}>
            <h2>{editingId ? 'Editar Activo' : 'Nuevo Activo'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <input placeholder="Nombre del Equipo" required value={nuevoActivo.nombre} onChange={(e) => setNuevoActivo({...nuevoActivo, nombre: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <input placeholder="Marca" value={nuevoActivo.marca} onChange={(e) => setNuevoActivo({...nuevoActivo, marca: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                <input placeholder="Modelo" value={nuevoActivo.modelo} onChange={(e) => setNuevoActivo({...nuevoActivo, modelo: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <input placeholder="Número de Serie" value={nuevoActivo.serie} onChange={(e) => setNuevoActivo({...nuevoActivo, serie: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <input type="date" value={nuevoActivo.fecha_compra} onChange={(e) => setNuevoActivo({...nuevoActivo, fecha_compra: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                <input type="number" placeholder="Valor (₡)" value={nuevoActivo.valor} onChange={(e) => setNuevoActivo({...nuevoActivo, valor: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <select value={nuevoActivo.estado} onChange={(e) => setNuevoActivo({...nuevoActivo, estado: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                <option value="Operativo">Operativo</option><option value="Mantenimiento">Mantenimiento</option><option value="Baja">Dañado / Baja</option>
              </select>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>{editingId ? 'Actualizar' : 'Guardar'}</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`${styles.card} glass`}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>Activo</th>
              <th style={{ padding: '1rem' }}>Valor</th>
              <th style={{ padding: '1rem' }}>Estado</th>
              <th style={{ padding: '1rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {activos.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 600 }}>{a.nombre}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{a.marca} {a.modelo} • SN: {a.serie}</div>
                </td>
                <td style={{ padding: '1rem', fontWeight: 700 }}>₡{Number(a.valor || 0).toLocaleString()}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: a.estado === 'Operativo' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: a.estado === 'Operativo' ? 'var(--success)' : 'var(--danger)' }}>{a.estado}</span>
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => { setEditingId(a.id); setNuevoActivo(a); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                    <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
