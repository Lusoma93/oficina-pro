"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

export default function Calendario() {
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [nuevaCita, setNuevaCita] = useState({
    titulo: '', descripcion: '', fecha_inicio: '', cliente_id: '', cliente_nombre_manual: '', cliente_telefono_manual: ''
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data: citasData } = await supabase.from('citas').select('*, clientes(nombre, telefono)').order('fecha_inicio', { ascending: true });
    const { data: clieData } = await supabase.from('clientes').select('id, nombre').order('nombre', { ascending: true });
    setCitas(citasData || []);
    setClientes(clieData || []);
    setLoading(false);
  }

  async function handleSendWhatsApp(cita) {
    const telefono = cita.clientes?.telefono || cita.cliente_telefono_manual;
    if (!telefono) {
      alert("Este cliente no tiene número de teléfono registrado.");
      return;
    }
    
    const fechaFormat = new Date(cita.fecha_inicio).toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const horaFormat = new Date(cita.fecha_inicio).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    const clienteName = cita.clientes?.nombre || cita.cliente_nombre_manual || 'Estimado cliente';
    const defaultText = `Hola ${clienteName}, le saludamos de la oficina de Topografía y Agrimensura. Le recordamos que tenemos agendada la cita de levantamiento de campo para "${cita.titulo}" el día ${fechaFormat} a las ${horaFormat}. Por favor confirme su asistencia. ¡Muchas gracias!`;

    const txt = prompt("¿Desea enviar este recordatorio por WhatsApp? Puede editar el texto a continuación antes de enviar:", defaultText);
    
    if (txt === null) return; // Si cancela, no se envía
    
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: telefono, body: txt })
      });
      const data = await res.json();
      if (data.success) {
        alert("¡Mensaje enviado con éxito!" + (data.simulated ? " (Modo simulación: configure credenciales en su entorno)." : ""));
      } else {
        alert("Error enviando WhatsApp: " + (data.error || "Desconocido"));
      }
    } catch (e) {
      alert("Error de conexión al enviar WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    const payload = {
      titulo: nuevaCita.titulo,
      descripcion: nuevaCita.descripcion,
      fecha_inicio: nuevaCita.fecha_inicio,
      cliente_id: nuevaCita.cliente_id === 'manual' || nuevaCita.cliente_id === '' ? null : nuevaCita.cliente_id,
      cliente_nombre_manual: nuevaCita.cliente_id === 'manual' ? nuevaCita.cliente_nombre_manual : null,
      cliente_telefono_manual: nuevaCita.cliente_id === 'manual' ? nuevaCita.cliente_telefono_manual : null
    };

    if (editingId) {
      await supabase.from('citas').update(payload).eq('id', editingId);
    } else {
      await supabase.from('citas').insert([payload]);
    }
    setShowModal(false);
    setEditingId(null);
    setNuevaCita({ titulo: '', descripcion: '', fecha_inicio: '', cliente_id: '', cliente_nombre_manual: '', cliente_telefono_manual: '' });
    fetchData();
  }

  async function handleDelete(id) {
    if (confirm("¿Seguro que desea eliminar esta cita?")) {
      await supabase.from('citas').delete().eq('id', id);
      fetchData();
    }
  }

  const getGoogleCalendarUrl = (cita) => {
    try {
      const start = new Date(cita.fecha_inicio).toISOString().replace(/-|:|\.\d\d\d/g, "");
      const end = new Date(new Date(cita.fecha_inicio).getTime() + 3600000).toISOString().replace(/-|:|\.\d\d\d/g, "");
      return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(cita.titulo)}&details=${encodeURIComponent(cita.descripcion || '')}&dates=${start}/${end}`;
    } catch (e) { return "#"; }
  };

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Agenda de Trabajo</h1>
          <p style={{ color: 'var(--text-muted)' }}>Mantenimiento de citas y salidas de campo.</p>
        </div>
        <button onClick={() => { setEditingId(null); setNuevaCita({ titulo: '', descripcion: '', fecha_inicio: '', cliente_id: '', cliente_nombre_manual: '', cliente_telefono_manual: '' }); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Agendar Cita
        </button>
      </header>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 400, background: 'var(--bg-sidebar)' }}>
            <h2>{editingId ? 'Editar Cita' : 'Agendar Cita'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <input placeholder="Título" required value={nuevaCita.titulo} onChange={(e) => setNuevaCita({...nuevaCita, titulo: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <textarea placeholder="Descripción / Ubicación" value={nuevaCita.descripcion} onChange={(e) => setNuevaCita({...nuevaCita, descripcion: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', minHeight: 80 }} />
              <input type="datetime-local" required value={nuevaCita.fecha_inicio} onChange={(e) => setNuevaCita({...nuevaCita, fecha_inicio: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button 
                  type="button"
                  onClick={() => setNuevaCita({
                    ...nuevaCita, 
                    cliente_id: nuevaCita.cliente_id === 'manual' ? '' : 'manual',
                    cliente_nombre_manual: '',
                    cliente_telefono_manual: ''
                  })}
                  style={{ 
                    width: '100%', padding: '0.75rem', borderRadius: 8, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                    background: nuevaCita.cliente_id === 'manual' ? 'var(--primary)' : 'transparent',
                    color: nuevaCita.cliente_id === 'manual' ? 'white' : 'var(--primary)',
                    border: `1px solid var(--primary)`
                  }}
                >
                  {nuevaCita.cliente_id === 'manual' ? '👤 Volver a Cliente Registrado' : '➕ Agendar para Cliente NO Registrado'}
                </button>
              </div>

              {nuevaCita.cliente_id !== 'manual' ? (
                <select 
                  value={nuevaCita.cliente_id} 
                  onChange={(e) => setNuevaCita({...nuevaCita, cliente_id: e.target.value})} 
                  style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}
                >
                  <option value="">Seleccionar Cliente...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <input 
                    placeholder="Nombre de Referencia del Cliente" 
                    required 
                    value={nuevaCita.cliente_nombre_manual} 
                    onChange={(e) => setNuevaCita({...nuevaCita, cliente_nombre_manual: e.target.value})} 
                    style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} 
                  />
                  <input 
                    placeholder="Teléfono del Cliente (Ej: 88888888)" 
                    value={nuevaCita.cliente_telefono_manual || ''} 
                    onChange={(e) => setNuevaCita({...nuevaCita, cliente_telefono_manual: e.target.value})} 
                    style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} 
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Guardar</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={styles.statsGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
        {citas.map((cita) => (
          <div key={cita.id} className={`${styles.card} glass`} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', borderRadius: 8, textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>{new Date(cita.fecha_inicio).toLocaleDateString('es-CR', { month: 'short' }).toUpperCase()}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{new Date(cita.fecha_inicio).getDate()}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { 
                  setEditingId(cita.id); 
                  setNuevaCita({ 
                    ...cita, 
                    fecha_inicio: cita.fecha_inicio.substring(0, 16),
                    cliente_id: cita.cliente_id ? cita.cliente_id.toString() : (cita.cliente_nombre_manual ? 'manual' : '')
                  }); 
                  setShowModal(true); 
                }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✏️</button>
                <button onClick={() => handleDelete(cita.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button>
              </div>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{cita.titulo}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>{cita.descripcion}</p>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem' }}>⏰ {new Date(cita.fecha_inicio).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>👤 {cita.clientes?.nombre || cita.cliente_nombre_manual || 'General'}</span>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {(cita.clientes?.telefono || cita.cliente_telefono_manual) && (
                  <button onClick={() => handleSendWhatsApp(cita)} style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', borderRadius: 6, background: '#25D366', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>💬 WhatsApp</button>
                )}
                <a href={getGoogleCalendarUrl(cita)} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', borderRadius: 6, background: '#4285F4', color: 'white', textDecoration: 'none', fontWeight: 700 }}>+ Google</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
