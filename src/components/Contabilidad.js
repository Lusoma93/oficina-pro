"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

export default function Contabilidad() {
  const [activeTab, setActiveTab] = useState("Transacciones");
  
  // Estados para Transacciones
  const [transacciones, setTransacciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tipoModal, setTipoModal] = useState("Ingreso");
  const [editingId, setEditingId] = useState(null);

  const [nuevaTrans, setNuevaTrans] = useState({
    descripcion: '', monto: 0, tipo: 'Ingreso', categoria: 'Ingeniería',
    fecha: new Date().toISOString().split('T')[0], subtotal: 0, iva: 0,
    metodo_pago: 'Transferencia'
  });

  // Estados para Gastos Fijos
  const [gastosFijos, setGastosFijos] = useState([]);
  const [showModalFijo, setShowModalFijo] = useState(false);
  const [editingFijoId, setEditingFijoId] = useState(null);
  const [nuevoGastoFijo, setNuevoGastoFijo] = useState({
    nombre: '', monto: 0, dia_cobro: 1, estado: 'Activo'
  });

  useEffect(() => { 
    if (activeTab === "Transacciones") fetchTransacciones(); 
    else fetchGastosFijos();
  }, [activeTab]);

  async function fetchTransacciones() {
    setLoading(true);
    const { data } = await supabase.from('transacciones').select('*').order('fecha', { ascending: false });
    setTransacciones(data || []);
    setLoading(false);
  }

  async function fetchGastosFijos() {
    setLoading(true);
    const { data } = await supabase.from('gastos_fijos').select('*').order('dia_cobro', { ascending: true });
    setGastosFijos(data || []);
    setLoading(false);
  }

  // --------- LOGICA TRANSACCIONES ---------
  async function handleSubmitTrans(e) {
    e.preventDefault();
    let subtotal = Number(nuevaTrans.monto);
    let iva = 0;
    if (tipoModal === 'Ingreso') {
      subtotal = Number(nuevaTrans.monto) / 1.13;
      iva = Number(nuevaTrans.monto) - subtotal;
    }
    const transData = { ...nuevaTrans, tipo: tipoModal, subtotal, iva };
    
    if (editingId) {
      await supabase.from('transacciones').update(transData).eq('id', editingId);
    } else {
      await supabase.from('transacciones').insert([transData]);
    }
    
    setShowModal(false);
    setEditingId(null);
    setNuevaTrans({ descripcion: '', monto: 0, tipo: 'Ingreso', categoria: 'Ingeniería', fecha: new Date().toISOString().split('T')[0], metodo_pago: 'Transferencia' });
    fetchTransacciones();
  }

  async function handleDeleteTrans(id) {
    if (confirm("¿Eliminar esta transacción?")) {
      await supabase.from('transacciones').delete().eq('id', id);
      fetchTransacciones();
    }
  }

  // --------- LOGICA GASTOS FIJOS ---------
  async function handleSubmitFijo(e) {
    e.preventDefault();
    if (editingFijoId) {
      await supabase.from('gastos_fijos').update(nuevoGastoFijo).eq('id', editingFijoId);
    } else {
      await supabase.from('gastos_fijos').insert([nuevoGastoFijo]);
    }
    
    setShowModalFijo(false);
    setEditingFijoId(null);
    setNuevoGastoFijo({ nombre: '', monto: 0, dia_cobro: 1, estado: 'Activo' });
    fetchGastosFijos();
  }

  async function handleDeleteFijo(id) {
    if (confirm("¿Eliminar este gasto fijo permanentemente?")) {
      await supabase.from('gastos_fijos').delete().eq('id', id);
      fetchGastosFijos();
    }
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Finanzas</h1>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button onClick={() => setActiveTab('Transacciones')} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: activeTab === 'Transacciones' ? 'var(--primary)' : 'rgba(0,0,0,0.05)', color: activeTab === 'Transacciones' ? 'white' : 'inherit', fontWeight: 600, cursor: 'pointer' }}>Flujo de Caja</button>
            <button onClick={() => setActiveTab('Gastos Fijos')} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: activeTab === 'Gastos Fijos' ? 'var(--primary)' : 'rgba(0,0,0,0.05)', color: activeTab === 'Gastos Fijos' ? 'white' : 'inherit', fontWeight: 600, cursor: 'pointer' }}>Gastos Fijos</button>
          </div>
        </div>
        
        {activeTab === 'Transacciones' ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => { setTipoModal("Ingreso"); setEditingId(null); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--success)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Ingreso</button>
            <button onClick={() => { setTipoModal("Gasto"); setEditingId(null); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Gasto</button>
          </div>
        ) : (
          <button onClick={() => { setEditingFijoId(null); setNuevoGastoFijo({ nombre: '', monto: 0, dia_cobro: 1, estado: 'Activo' }); setShowModalFijo(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            + Gasto Fijo
          </button>
        )}
      </header>

      {/* MODAL TRANSACCIONES */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 400, background: 'var(--bg-sidebar)' }}>
            <h2>{editingId ? 'Editar' : 'Nueva'} {tipoModal}</h2>
            <form onSubmit={handleSubmitTrans} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <input placeholder="Descripción" required value={nuevaTrans.descripcion} onChange={(e) => setNuevaTrans({...nuevaTrans, descripcion: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <input type="number" placeholder="Monto Total" required value={nuevaTrans.monto} onChange={(e) => setNuevaTrans({...nuevaTrans, monto: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <select value={nuevaTrans.metodo_pago} onChange={(e) => setNuevaTrans({...nuevaTrans, metodo_pago: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                <option value="Transferencia">Transferencia Bancaria</option>
                <option value="SINPE">SINPE Móvil</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta de Crédito/Débito</option>
                <option value="Otro">Otro</option>
              </select>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <select value={nuevaTrans.categoria} onChange={(e) => setNuevaTrans({...nuevaTrans, categoria: e.target.value})} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                  <option value="Ingeniería">Ingeniería</option><option value="Valuación">Valuación</option><option value="Fijo">Fijo</option><option value="Operativo">Operativo</option>
                </select>
                <input type="date" value={nuevaTrans.fecha} onChange={(e) => setNuevaTrans({...nuevaTrans, fecha: e.target.value})} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Guardar</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL GASTOS FIJOS */}
      {showModalFijo && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 400, background: 'var(--bg-sidebar)' }}>
            <h2>{editingFijoId ? 'Editar Gasto Fijo' : 'Nuevo Gasto Fijo'}</h2>
            <form onSubmit={handleSubmitFijo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <input placeholder="Nombre (Ej: Alquiler, Internet, CCSS)" required value={nuevoGastoFijo.nombre} onChange={(e) => setNuevoGastoFijo({...nuevoGastoFijo, nombre: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <input type="number" placeholder="Monto Mensual Estimado" required value={nuevoGastoFijo.monto} onChange={(e) => setNuevoGastoFijo({...nuevoGastoFijo, monto: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Día de cobro:</label>
                <input type="number" min="1" max="31" placeholder="Día" required value={nuevoGastoFijo.dia_cobro} onChange={(e) => setNuevoGastoFijo({...nuevoGastoFijo, dia_cobro: e.target.value})} style={{ width: '80px', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <select value={nuevoGastoFijo.estado} onChange={(e) => setNuevoGastoFijo({...nuevoGastoFijo, estado: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo / Cancelado</option>
              </select>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Guardar</button>
                <button type="button" onClick={() => setShowModalFijo(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`${styles.card} glass`}>
        {activeTab === 'Transacciones' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '1rem' }}>Descripción / Fecha</th>
                <th style={{ padding: '1rem' }}>Monto y Método</th>
                <th style={{ padding: '1rem' }}>Desglose (IVA)</th>
                <th style={{ padding: '1rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transacciones.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600 }}>{t.descripcion}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.fecha} • {t.categoria}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 700, color: t.tipo === 'Ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                      {t.tipo === 'Ingreso' ? '+' : '-'}₡{Number(t.monto).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      💳 {t.metodo_pago || 'No especificado'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                    {t.tipo === 'Ingreso' ? `Base: ₡${Math.round(t.subtotal).toLocaleString()} | IVA: ₡${Math.round(t.iva).toLocaleString()}` : '---'}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button onClick={() => { setEditingId(t.id); setNuevaTrans(t); setTipoModal(t.tipo); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✏️</button>
                      <button onClick={() => handleDeleteTrans(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '1rem' }}>Gasto Recurrente</th>
                <th style={{ padding: '1rem' }}>Monto Estimado</th>
                <th style={{ padding: '1rem' }}>Día de Cobro</th>
                <th style={{ padding: '1rem' }}>Estado</th>
                <th style={{ padding: '1rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastosFijos.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay gastos fijos registrados.</td></tr>
              ) : gastosFijos.map((g) => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)', opacity: g.estado === 'Activo' ? 1 : 0.6 }}>
                  <td style={{ padding: '1rem', fontWeight: 600 }}>{g.nombre}</td>
                  <td style={{ padding: '1rem', fontWeight: 700 }}>₡{Number(g.monto).toLocaleString()}</td>
                  <td style={{ padding: '1rem' }}>Día {g.dia_cobro} de cada mes</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: g.estado === 'Activo' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)', color: g.estado === 'Activo' ? 'var(--success)' : 'var(--text-muted)' }}>{g.estado}</span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button onClick={() => { setEditingFijoId(g.id); setNuevoGastoFijo(g); setShowModalFijo(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✏️</button>
                      <button onClick={() => handleDeleteFijo(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'rgba(0,0,0,0.02)', fontWeight: 700 }}>
                <td style={{ padding: '1rem', textAlign: 'right' }}>Total Fijos Mensuales:</td>
                <td style={{ padding: '1rem', color: 'var(--danger)' }}>
                  ₡{gastosFijos.filter(g => g.estado === 'Activo').reduce((acc, g) => acc + Number(g.monto), 0).toLocaleString()}
                </td>
                <td colSpan="3"></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
