"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '',
    cedula: '',
    telefono: '',
    correo: ''
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    // Obtenemos los clientes y sus proyectos para calcular los saldos pendientes
    const { data } = await supabase
      .from('clientes')
      .select('*, proyectos(costo, adelanto, tiene_iva)')
      .order('nombre', { ascending: true });
      
    const procesados = (data || []).map(c => {
      let tieneSaldo = false;
      let totalSaldo = 0;
      if (c.proyectos) {
        c.proyectos.forEach(p => {
          const total = p.tiene_iva ? Number(p.costo) * 1.13 : Number(p.costo);
          const saldo = total - Number(p.adelanto);
          if (saldo > 0) {
            tieneSaldo = true;
            totalSaldo += saldo;
          }
        });
      }
      return { ...c, tiene_saldo: tieneSaldo, saldo_total: totalSaldo };
    });
    
    setClientes(procesados);
    setLoading(false);
  }

  async function consultarIdentidad(cedula) {
    if (!cedula || cedula.length < 9) return;
    setLoading(true);
    try {
      const response = await fetch(`https://api.hacienda.go.cr/fe/ae?identificacion=${cedula}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.nombre) setNuevoCliente(prev => ({ ...prev, nombre: data.nombre }));
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      await supabase.from('clientes').update(nuevoCliente).eq('id', editingId);
    } else {
      await supabase.from('clientes').insert([nuevoCliente]);
    }
    setShowModal(false);
    setEditingId(null);
    setNuevoCliente({ nombre: '', cedula: '', telefono: '', correo: '' });
    fetchData();
  }

  async function handleDelete(id) {
    if (confirm("¿Seguro que desea eliminar este cliente?")) {
      await supabase.from('clientes').delete().eq('id', id);
      fetchData();
    }
  }

  const clientesFiltrados = clientes.filter(c => {
    const coincideNombre = c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (c.cedula && c.cedula.includes(searchTerm));
    const coincideSaldo = soloPendientes ? c.tiene_saldo : true;
    return coincideNombre && coincideSaldo;
  });

  return (
    <div className="animate-fade">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Mantenimiento de Clientes</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gestión completa de la base de datos de contactos.</p>
        </div>
        <button onClick={() => { setEditingId(null); setNuevoCliente({ nombre: '', cedula: '', telefono: '', correo: '' }); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Nuevo Cliente
        </button>
      </header>
      
      {/* Barra de Búsqueda y Filtros */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="🔍 Buscar por nombre o cédula..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '0.75rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', minWidth: '300px', flex: 1, boxShadow: 'var(--shadow-sm)' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: soloPendientes ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-card)', color: soloPendientes ? 'var(--danger)' : 'var(--text-main)', padding: '0.75rem 1.25rem', borderRadius: 12, border: '1px solid var(--border)', fontWeight: 600, transition: 'var(--transition)' }}>
          <input 
            type="checkbox" 
            checked={soloPendientes} 
            onChange={(e) => setSoloPendientes(e.target.checked)} 
            style={{ accentColor: 'var(--danger)', width: 16, height: 16 }}
          /> 
          Mostrar Solo Pendientes de Pago
        </label>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 400, background: 'var(--bg-sidebar)' }}>
            <h2>{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <input placeholder="Cédula (Física o Jurídica)" value={nuevoCliente.cedula} onBlur={() => consultarIdentidad(nuevoCliente.cedula)} onChange={(e) => setNuevoCliente({...nuevoCliente, cedula: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <input placeholder="Nombre Completo" required value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente({...nuevoCliente, nombre: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={(e) => setNuevoCliente({...nuevoCliente, telefono: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <input placeholder="Correo Electrónico" type="email" value={nuevoCliente.correo} onChange={(e) => setNuevoCliente({...nuevoCliente, correo: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>{editingId ? 'Actualizar' : 'Guardar'}</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`${styles.card} glass`} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>Nombre</th>
              <th style={{ padding: '1rem' }}>Identificación</th>
              <th style={{ padding: '1rem' }}>Contacto</th>
              {soloPendientes && <th style={{ padding: '1rem' }}>Deuda Total</th>}
              <th style={{ padding: '1rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clientesFiltrados.length === 0 ? (
              <tr><td colSpan={soloPendientes ? "5" : "4"} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron clientes.</td></tr>
            ) : clientesFiltrados.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '1rem', fontWeight: 600 }}>
                  {c.nombre}
                  {c.tiene_saldo && <span style={{ marginLeft: '0.5rem', width: 8, height: 8, background: 'var(--danger)', borderRadius: '50%', display: 'inline-block' }} title="Con saldo pendiente"></span>}
                </td>
                <td style={{ padding: '1rem' }}>{c.cedula || '---'}</td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontSize: '0.9rem' }}>📞 {c.telefono || '---'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>✉️ {c.correo || '---'}</div>
                </td>
                {soloPendientes && (
                  <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--danger)' }}>
                    ₡{Math.round(c.saldo_total).toLocaleString()}
                  </td>
                )}
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => { setEditingId(c.id); setNuevoCliente(c); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                    <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
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
