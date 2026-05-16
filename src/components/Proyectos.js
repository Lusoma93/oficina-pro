"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

const SERVICIOS_INGENIERIA = ["Segregación (Venta/Donación)", "Reunión de Fincas", "Rectificación de Medida", "Levantamiento Topográfico (Relieve/Curvas)", "Deslinde y Amojonamiento", "Georreferenciación (Puntos Control)", "Urbanización / Condominio", "Catastro Municipal", "Trámite de Visado", "Nivelación de Precisión"];
const SERVICIOS_VALUACION = ["Avalúo Inmueble (Casa/Lote)", "Avalúo de Finca / Agrícola", "Avalúo de Maquinaria y Equipo", "Peritaje Judicial", "Avalúo Bancario (Garantía)", "Valoración de Activos"];
const ESTADOS_PRESENTACION = ["Catastro", "Disponibilidad de Agua", "Trámites Adicionales", "Municipalidad", "Apelación", "Mantenimiento de Mapa", "Catastro Final", "Finalizado"];

export default function Proyectos() {
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedProy, setExpandedProy] = useState(null);
  const [presentaciones, setPresentaciones] = useState({});
  const [showPresForm, setShowPresForm] = useState(false);
  
  const [nuevaPres, setNuevaPres] = useState({ nombre: `${new Date().getFullYear()}-`, estado: 'Catastro' });
  const [nuevoProyecto, setNuevoProyecto] = useState({
    nombre: '', cliente_id: '', folio: '', tipo: 'Segregación (Venta/Donación)',
    costo: 0, adelanto: 0, numero_contrato: '',
    fecha_contrato: new Date().toISOString().split('T')[0], tiene_iva: false
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    // Aseguramos traer el teléfono del cliente para WhatsApp
    const { data: proyData } = await supabase.from('proyectos').select('*, clientes(nombre, telefono)').order('created_at', { ascending: false });
    const { data: clieData } = await supabase.from('clientes').select('id, nombre').order('nombre', { ascending: true });
    setProyectos(proyData || []);
    setClientes(clieData || []);
    setLoading(false);
  }

  async function fetchPresentaciones(proyId) {
    const { data } = await supabase.from('presentaciones').select('*').eq('proyecto_id', proyId).order('created_at', { ascending: true });
    setPresentaciones(prev => ({ ...prev, [proyId]: data || [] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      const { error } = await supabase.from('proyectos').update(nuevoProyecto).eq('id', editingId);
      if (error) alert(error.message);
    } else {
      const { data, error } = await supabase.from('proyectos').insert([nuevoProyecto]).select();
      if (!error && Number(nuevoProyecto.adelanto) > 0) {
        const subtotal = Number(nuevoProyecto.adelanto) / 1.13;
        const iva = Number(nuevoProyecto.adelanto) - subtotal;
        await supabase.from('transacciones').insert([{
          descripcion: `Adelanto: ${nuevoProyecto.nombre}`, monto: nuevoProyecto.adelanto,
          tipo: 'Ingreso', categoria: 'Ingeniería', subtotal, iva, fecha: nuevoProyecto.fecha_contrato,
          metodo_pago: 'Efectivo' // Valor por defecto
        }]);
      }
      if (error) alert(error.message);
    }
    setShowModal(false);
    setEditingId(null);
    resetForm();
    fetchData();
  }

  async function handleDelete(id) {
    if (confirm("¿Seguro que desea eliminar este proyecto?")) {
      await supabase.from('proyectos').delete().eq('id', id);
      fetchData();
    }
  }

  async function handleAddPres(proyId) {
    if (!nuevaPres.nombre) return;
    const { error } = await supabase.from('presentaciones').insert([{ ...nuevaPres, proyecto_id: proyId }]);
    if (!error) {
      setNuevaPres({ nombre: `${new Date().getFullYear()}-`, estado: 'Catastro' });
      setShowPresForm(false);
      fetchPresentaciones(proyId);
    }
  }

  async function handleDeletePres(proyId, presId) {
    if (confirm("¿Eliminar este trámite?")) {
      await supabase.from('presentaciones').delete().eq('id', presId);
      fetchPresentaciones(proyId);
    }
  }

  // Notificación automatizada vía WhatsApp
  async function notificarWhatsApp(proyId, nombreTramite) {
    const proyecto = proyectos.find(p => p.id === proyId);
    const telefono = proyecto?.clientes?.telefono;
    
    if (!telefono) {
      console.warn("No hay teléfono registrado para notificar.");
      return;
    }

    const mensaje = `Hola ${proyecto.clientes.nombre},\n\nSGIN PRO te informa que el trámite *${nombreTramite}* asociado a tu contrato #${proyecto.numero_contrato || 'S/N'} ha sido marcado como *Finalizado*.\n\nSaludos cordiales.`;

    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: telefono, body: mensaje })
      });
      const data = await res.json();
      if (data.simulated) {
        alert("Trámite finalizado. (Simulación WhatsApp: " + data.message + ")");
      } else if (data.success) {
        alert("Trámite finalizado. Notificación enviada al cliente.");
      } else {
        alert("Trámite finalizado, pero hubo un error enviando WhatsApp: " + data.error);
      }
    } catch (err) {
      console.error("Error contactando servidor WhatsApp", err);
    }
  }

  async function handleUpdatePresEstado(proyId, presId, nuevoEstado, nombreTramite) {
    await supabase.from('presentaciones').update({ estado: nuevoEstado, created_at: new Date().toISOString() }).eq('id', presId);
    fetchPresentaciones(proyId);
    
    if (nuevoEstado === 'Finalizado') {
      notificarWhatsApp(proyId, nombreTramite);
    }
  }

  function resetForm() {
    setNuevoProyecto({
      nombre: '', cliente_id: '', folio: '', tipo: 'Segregación (Venta/Donación)',
      costo: 0, adelanto: 0, numero_contrato: '',
      fecha_contrato: new Date().toISOString().split('T')[0], tiene_iva: false
    });
  }

  const calcularTotalConIVA = (costo, tieneIva) => tieneIva ? Number(costo) * 1.13 : Number(costo);

  const necesitaActualizacion = (fecha) => {
    const dias = (new Date() - new Date(fecha)) / (1000 * 60 * 60 * 24);
    return dias > 8;
  };

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Gestión de Proyectos</h1>
          <p style={{ color: 'var(--text-muted)' }}>Mantenimiento técnico y automatización WhatsApp.</p>
        </div>
        <button onClick={() => { setEditingId(null); resetForm(); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Nuevo Proyecto
        </button>
      </header>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 600, background: 'var(--bg-sidebar)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>{editingId ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <input placeholder="Número de Contrato" value={nuevoProyecto.numero_contrato} onChange={(e) => setNuevoProyecto({...nuevoProyecto, numero_contrato: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                <input type="date" value={nuevoProyecto.fecha_contrato} onChange={(e) => setNuevoProyecto({...nuevoProyecto, fecha_contrato: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <input placeholder="Nombre / Ubicación" required value={nuevoProyecto.nombre} onChange={(e) => setNuevoProyecto({...nuevoProyecto, nombre: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <select required value={nuevoProyecto.cliente_id} onChange={(e) => setNuevoProyecto({...nuevoProyecto, cliente_id: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                <option value="">Seleccionar Cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <input placeholder="Folio Real" value={nuevoProyecto.folio} onChange={(e) => setNuevoProyecto({...nuevoProyecto, folio: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                <select value={nuevoProyecto.tipo} onChange={(e) => setNuevoProyecto({...nuevoProyecto, tipo: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                  <optgroup label="Topografía">{SERVICIOS_INGENIERIA.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>
                  <optgroup label="Valuación">{SERVICIOS_VALUACION.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>
                </select>
              </div>
              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontWeight: 600 }}>Costo Honorarios</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={nuevoProyecto.tiene_iva} onChange={(e) => setNuevoProyecto({...nuevoProyecto, tiene_iva: e.target.checked})} /> Aplicar IVA 13%
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <input type="number" placeholder="Monto Base" value={nuevoProyecto.costo} onChange={(e) => setNuevoProyecto({...nuevoProyecto, costo: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                  <input type="number" placeholder="Adelanto" value={nuevoProyecto.adelanto} onChange={(e) => setNuevoProyecto({...nuevoProyecto, adelanto: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                </div>
                <div style={{ marginTop: '1rem', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)' }}>
                  Total: ₡{calcularTotalConIVA(nuevoProyecto.costo, nuevoProyecto.tiene_iva).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
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
              <th style={{ padding: '1rem' }}>Proyecto</th>
              <th style={{ padding: '1rem' }}>Cliente</th>
              <th style={{ padding: '1rem' }}>Costo / Saldo</th>
              <th style={{ padding: '1rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {proyectos.map((p) => {
              const total = calcularTotalConIVA(p.costo, p.tiene_iva);
              const saldo = total - Number(p.adelanto);
              const isExpanded = expandedProy === p.id;
              return (
                <React.Fragment key={p.id}>
                  <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 700 }}>{p.nombre}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contrato: {p.numero_contrato || 'N/A'} • {p.tipo}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {p.clientes?.nombre}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.clientes?.telefono || 'Sin teléfono'}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600 }}>₡{total.toLocaleString()}</div>
                      <div style={{ fontSize: '0.8rem', color: saldo > 0 ? 'var(--danger)' : 'var(--success)' }}>Saldo: ₡{saldo.toLocaleString()}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingId(p.id); setNuevoProyecto(p); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✏️</button>
                        <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button>
                        <button onClick={() => { if (expandedProy === p.id) setExpandedProy(null); else { setExpandedProy(p.id); fetchPresentaciones(p.id); } }} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--primary)', background: isExpanded ? 'var(--primary)' : 'transparent', color: isExpanded ? 'white' : 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>{isExpanded ? 'Cerrar' : 'Trámites'}</button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                      <td colSpan="4" style={{ padding: '1.5rem' }}>
                        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h4 style={{ margin: 0 }}>Seguimiento de Trámites</h4>
                            {!showPresForm && <button onClick={() => setShowPresForm(true)} style={{ padding: '0.4rem 0.8rem', borderRadius: 6, background: 'var(--success)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>+ Agregar Trámite</button>}
                          </div>
                          
                          {showPresForm && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: 10 }}>
                              <input placeholder="ID Trámite (20XX-XXXXXX-C)" value={nuevaPres.nombre} onChange={(e) => setNuevaPres({...nuevaPres, nombre: e.target.value})} style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }} />
                              <select value={nuevaPres.estado} onChange={(e) => setNuevaPres({...nuevaPres, estado: e.target.value})} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }}>
                                {ESTADOS_PRESENTACION.map(e => <option key={e} value={e}>{e}</option>)}
                              </select>
                              <button onClick={() => handleAddPres(p.id)} style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                              <button onClick={() => setShowPresForm(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {presentaciones[p.id]?.map(pres => (
                              <div key={pres.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {necesitaActualizacion(pres.created_at) && <span title="Más de 8 días sin actualizar" style={{ cursor: 'help' }}>⚠️</span>}
                                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pres.nombre}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                  <select value={pres.estado} onChange={(e) => handleUpdatePresEstado(p.id, pres.id, e.target.value, pres.nombre)} style={{ padding: '0.3rem', borderRadius: 6, fontSize: '0.85rem' }}>
                                    {ESTADOS_PRESENTACION.map(e => <option key={e} value={e}>{e}</option>)}
                                  </select>
                                  <button onClick={() => handleDeletePres(p.id, pres.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>🗑️</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
