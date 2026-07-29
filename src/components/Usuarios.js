"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [nuevoUsuario, setNuevoUsuario] = useState({
    usuario: '', nombre: '', password: '', rol: 'normal'
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase.from('usuarios').select('*').order('nombre', { ascending: true });
    setUsuarios(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      await supabase.from('usuarios').update(nuevoUsuario).eq('id', editingId);
    } else {
      await supabase.from('usuarios').insert([nuevoUsuario]);
    }
    setShowModal(false);
    setEditingId(null);
    setNuevoUsuario({ usuario: '', nombre: '', password: '', rol: 'normal' });
    fetchData();
  }

  async function handleDelete(id) {
    if (confirm("¿Seguro que desea eliminar este usuario del sistema?")) {
      await supabase.from('usuarios').delete().eq('id', id);
      fetchData();
    }
  }

  return (
    <div className="animate-fade">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Gestión de Usuarios</h1>
          <p style={{ color: 'var(--text-muted)' }}>Administración de accesos y roles del sistema.</p>
        </div>
        <button onClick={() => { setEditingId(null); setNuevoUsuario({ usuario: '', nombre: '', password: '', rol: 'normal' }); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Nuevo Usuario
        </button>
      </header>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 450, background: 'var(--bg-sidebar)' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>{editingId ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nombre Completo</label>
                <input required value={nuevoUsuario.nombre} onChange={(e) => setNuevoUsuario({...nuevoUsuario, nombre: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Usuario o Cédula (Login)</label>
                <input required value={nuevoUsuario.usuario} onChange={(e) => setNuevoUsuario({...nuevoUsuario, usuario: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Contraseña</label>
                <input required type={editingId ? "text" : "password"} value={nuevoUsuario.password} onChange={(e) => setNuevoUsuario({...nuevoUsuario, password: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Rol del Sistema</label>
                <select required value={nuevoUsuario.rol} onChange={(e) => setNuevoUsuario({...nuevoUsuario, rol: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                  <option value="normal">Usuario Normal</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>{editingId ? 'Guardar Cambios' : 'Crear Usuario'}</button>
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
              <th style={{ padding: '1rem' }}>Nombre</th>
              <th style={{ padding: '1rem' }}>Usuario / Cédula</th>
              <th style={{ padding: '1rem' }}>Rol</th>
              <th style={{ padding: '1rem' }}>Contraseña</th>
              <th style={{ padding: '1rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '1rem', fontWeight: 600 }}>{u.nombre}</td>
                <td style={{ padding: '1rem' }}>{u.usuario}</td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: u.rol === 'admin' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: u.rol === 'admin' ? '#3b82f6' : 'var(--success)' }}>
                    {u.rol === 'admin' ? 'Administrador' : 'Normal'}
                  </span>
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{u.password}</td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => { setEditingId(u.id); setNuevoUsuario(u); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                    <button onClick={() => handleDelete(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
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
