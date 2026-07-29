"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

const SERVICIOS_INGENIERIA = ["Segregación (Venta/Donación)", "Reunión de Fincas", "Segregación y Reunión", "Finca Completa", "Información Posesoria", "Rectificación de Medida", "Levantamiento Topográfico (Relieve/Curvas)", "Deslinde y Amojonamiento", "Georreferenciación (Puntos Control)", "Urbanización / Condominio", "Catastro Municipal", "Trámite de Visado", "Nivelación de Precisión"];
const SERVICIOS_VALUACION = ["Avalúo Inmueble (Casa/Lote)", "Avalúo de Finca / Agrícola", "Avalúo de Maquinaria y Equipo", "Peritaje Judicial", "Avalúo Bancario (Garantía)", "Valoración de Activos"];
const ESTADOS_PRESENTACION = ["Catastro", "Disponibilidad de Agua", "Trámites Adicionales", "Municipalidad", "Apelación", "Mantenimiento de Mapa", "Catastro Final", "Finalizado", "Cancelación", "Desestimada"];

export default function Proyectos() {
  const [proyectos, setProyectos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [protocolosActivos, setProtocolosActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedProy, setExpandedProy] = useState(null);
  const [presentaciones, setPresentaciones] = useState({});
  const [showPresForm, setShowPresForm] = useState(false);
  const [editingPresId, setEditingPresId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modal de Abono
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [abonoData, setAbonoData] = useState({ proyecto_id: null, cliente_id: null, monto: '', metodo_pago: 'Transferencia Bancaria' });

  // Presentacion (Trámite) form
  const [nuevaPres, setNuevaPres] = useState({ anio: new Date().getFullYear().toString(), codigo: '', estado: 'Catastro', area: '' });
  
  // Gastos de campo del proyecto (Opción 5)
  const [gastosProyecto, setGastosProyecto] = useState({});
  const [showGastoForm, setShowGastoForm] = useState(false);
  const [nuevoGasto, setNuevoGasto] = useState({
    descripcion: '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    metodo_pago: 'Transferencia',
    tiene_iva: false
  });
  
  // Proyecto Form
  const [nuevoProyecto, setNuevoProyecto] = useState({
    nombre: '', cliente_id: '', firmado: false, tipo: 'Segregación (Venta/Donación)',
    costo: '', adelanto: '', numero_contrato: '',
    fecha_contrato: new Date().toISOString().split('T')[0], tiene_iva: false,
    protocolo_id: '', folio: '', metodo_pago: 'Transferencia Bancaria'
  });

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data: proyData } = await supabase.from('proyectos').select('*, clientes(nombre, telefono), protocolos(nombre)').order('created_at', { ascending: false });
    const { data: clieData } = await supabase.from('clientes').select('id, nombre').order('nombre', { ascending: true });
    const { data: protData } = await supabase.from('protocolos').select('id, nombre').eq('activo', true).order('nombre', { ascending: true });
    setProyectos(proyData || []);
    setClientes(clieData || []);
    setProtocolosActivos(protData || []);
    setLoading(false);
  }

  async function fetchPresentaciones(proyId) {
    const { data } = await supabase.from('presentaciones').select('*').eq('proyecto_id', proyId).order('created_at', { ascending: true });
    setPresentaciones(prev => ({ ...prev, [proyId]: data || [] }));
  }

  async function fetchGastosProyecto(proyId) {
    const { data } = await supabase.from('transacciones').select('*').eq('proyecto_id', proyId).order('fecha', { ascending: false });
    setGastosProyecto(prev => ({ ...prev, [proyId]: data || [] }));
  }

  async function handleAddGasto(proyId, clienteId) {
    if (!nuevoGasto.monto || !nuevoGasto.descripcion) return;
    const monto = Number(nuevoGasto.monto);
    const subtotal = nuevoGasto.tiene_iva ? monto / 1.13 : monto;
    const iva = nuevoGasto.tiene_iva ? monto - subtotal : 0;

    const { error } = await supabase.from('transacciones').insert([{
      descripcion: nuevoGasto.descripcion,
      monto: monto,
      subtotal: subtotal,
      iva: iva,
      tipo: 'Gasto',
      categoria: 'Gastos de Campo',
      fecha: nuevoGasto.fecha,
      metodo_pago: nuevoGasto.metodo_pago,
      proyecto_id: proyId,
      cliente_id: clienteId || null,
      es_deducible: true,
      aceptado_hacienda: true,
      iva_tarifa: nuevoGasto.tiene_iva ? 0.13 : 0,
      estado_pago: 'Pagado'
    }]);

    if (error) {
      alert("Error registrando gasto: " + error.message);
    } else {
      setNuevoGasto({
        descripcion: '',
        monto: '',
        fecha: new Date().toISOString().split('T')[0],
        metodo_pago: 'Transferencia',
        tiene_iva: false
      });
      setShowGastoForm(false);
      fetchGastosProyecto(proyId);
    }
  }

  async function handleDeleteGasto(proyId, gastoId) {
    if (confirm("¿Seguro que desea eliminar este gasto de campo del proyecto?")) {
      await supabase.from('transacciones').delete().eq('id', gastoId);
      fetchGastosProyecto(proyId);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Validación: No permitir registrar nuevos contratos con fechas anteriores al mes en curso
    if (!editingId && nuevoProyecto.fecha_contrato) {
      const today = new Date();
      const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const [year, month, day] = nuevoProyecto.fecha_contrato.split('-');
      const contractDate = new Date(year, month - 1, day);
      
      if (contractDate < firstDayCurrentMonth) {
        alert("Error: No se permite registrar nuevos contratos con fechas anteriores al mes en curso.");
        return;
      }
    }

    // Validacion de folio
    if (nuevoProyecto.protocolo_id && nuevoProyecto.folio) {
      const duplicado = proyectos.find(p => 
        p.protocolo_id == nuevoProyecto.protocolo_id && 
        p.folio == nuevoProyecto.folio && 
        p.id !== editingId
      );
      if (duplicado) {
        if (!confirm(`¡ADVERTENCIA!\nEl folio ${nuevoProyecto.folio} ya está asignado al proyecto "${duplicado.nombre}" en este protocolo.\n¿Estás seguro que deseas continuar y asignar este folio duplicado?`)) {
          return;
        }
      }
    }

    const payload = {
      nombre: nuevoProyecto.nombre,
      cliente_id: nuevoProyecto.cliente_id,
      firmado: nuevoProyecto.firmado,
      tipo: nuevoProyecto.tipo,
      costo: nuevoProyecto.costo || 0,
      numero_contrato: nuevoProyecto.numero_contrato,
      fecha_contrato: nuevoProyecto.fecha_contrato,
      tiene_iva: nuevoProyecto.tiene_iva,
      protocolo_id: nuevoProyecto.protocolo_id || null,
      folio: nuevoProyecto.folio || null
    };

    if (editingId) {
      const { error } = await supabase.from('proyectos').update(payload).eq('id', editingId);
      if (error) alert(error.message);
    } else {
      const { data, error } = await supabase.from('proyectos').insert([{
        ...payload, adelanto: nuevoProyecto.adelanto || 0
      }]).select();
      
      // SINCRONIZACIÓN CONTABLE AUTOMÁTICA
      if (!error && data && data.length > 0 && Number(nuevoProyecto.adelanto) > 0) {
        const proyId = data[0].id;
        const monto = Number(nuevoProyecto.adelanto);
        const subtotal = nuevoProyecto.tiene_iva ? monto / 1.13 : monto;
        const iva = nuevoProyecto.tiene_iva ? monto - subtotal : 0;
        
        await supabase.from('transacciones').insert([{
          descripcion: `Adelanto Inicial: ${nuevoProyecto.nombre}`,
          monto: monto,
          tipo: 'Ingreso',
          categoria: 'Ingeniería',
          subtotal: subtotal,
          iva: iva,
          fecha: nuevoProyecto.fecha_contrato,
          metodo_pago: nuevoProyecto.metodo_pago || 'Transferencia Bancaria',
          proyecto_id: proyId,
          cliente_id: nuevoProyecto.cliente_id,
          estado_pago: 'Cobrado'
        }]);
      }
      if (error) alert(error.message);
    }
    setShowModal(false);
    setEditingId(null);
    resetForm();
    fetchData();
  }

  async function handleRegistrarAbono(e) {
    e.preventDefault();
    if (!abonoData.proyecto_id || Number(abonoData.monto) <= 0) return;
    
    const proy = proyectos.find(p => p.id === abonoData.proyecto_id);
    const monto = Number(abonoData.monto);
    const subtotal = proy?.tiene_iva ? monto / 1.13 : monto;
    const iva = proy?.tiene_iva ? monto - subtotal : 0;

    // 1. Registrar el ingreso en Contabilidad
    const { error } = await supabase.from('transacciones').insert([{
      descripcion: `Abono de Proyecto: ${proy?.nombre}`,
      monto: monto,
      tipo: 'Ingreso',
      categoria: 'Ingeniería',
      subtotal: subtotal,
      iva: iva,
      fecha: new Date().toISOString().split('T')[0],
      metodo_pago: abonoData.metodo_pago,
      proyecto_id: abonoData.proyecto_id,
      cliente_id: abonoData.cliente_id,
      estado_pago: 'Cobrado'
    }]);

    if (!error) {
      // 2. Actualizar el total pagado (adelanto) en el proyecto
      const nuevoAdelanto = Number(proy.adelanto) + monto;
      await supabase.from('proyectos').update({ adelanto: nuevoAdelanto }).eq('id', abonoData.proyecto_id);
      
      setShowAbonoModal(false);
      fetchData();
      alert("Abono registrado en contabilidad y actualizado en el proyecto exitosamente.");
    } else {
      alert("Error al registrar abono: " + error.message);
    }
  }

  async function handleDelete(id) {
    if (confirm("¿Seguro que desea eliminar este proyecto? Los ingresos asociados podrían quedar sin referencia.")) {
      await supabase.from('proyectos').delete().eq('id', id);
      fetchData();
    }
  }

  async function handleAddPres(proyId) {
    if (!nuevaPres.codigo) return;
    const nombreTramite = `${nuevaPres.anio}-${nuevaPres.codigo}`;
    const areaVal = nuevaPres.area ? Number(nuevaPres.area) : null;

    if (editingPresId) {
      await supabase.from('presentaciones').update({ nombre: nombreTramite, estado: nuevaPres.estado, area: areaVal }).eq('id', editingPresId);
    } else {
      await supabase.from('presentaciones').insert([{ nombre: nombreTramite, estado: nuevaPres.estado, proyecto_id: proyId, area: areaVal }]);
    }
    
    setNuevaPres({ anio: new Date().getFullYear().toString(), codigo: '', estado: 'Catastro', area: '' });
    setShowPresForm(false);
    setEditingPresId(null);
    fetchPresentaciones(proyId);
  }

  async function handleDeletePres(proyId, presId) {
    if (confirm("¿Eliminar este trámite?")) {
      await supabase.from('presentaciones').delete().eq('id', presId);
      fetchPresentaciones(proyId);
    }
  }

  async function handleUpdatePresEstado(proyId, presId, nuevoEstado) {
    await supabase.from('presentaciones').update({ estado: nuevoEstado, created_at: new Date().toISOString() }).eq('id', presId);
    fetchPresentaciones(proyId);
  }

  function resetForm() {
    setNuevoProyecto({
      nombre: '', cliente_id: '', firmado: false, tipo: 'Segregación (Venta/Donación)',
      costo: '', adelanto: '', numero_contrato: '',
      fecha_contrato: new Date().toISOString().split('T')[0], tiene_iva: false,
      protocolo_id: '', folio: '', metodo_pago: 'Transferencia Bancaria'
    });
  }

  const calcularTotalConIVA = (costo, tieneIva) => tieneIva ? Number(costo) * 1.13 : Number(costo);
  
  const necesitaActualizacion = (fecha, estado) => {
    if (["Finalizado", "Cancelación", "Desestimada"].includes(estado)) return false;
    const dias = (new Date() - new Date(fecha)) / (1000 * 60 * 60 * 24);
    return dias > 8;
  };

  const proyectosFiltrados = proyectos.filter(p => {
    if (!searchTerm) return true;
    const clieName = p.clientes?.nombre?.toLowerCase() || "";
    const proyName = p.nombre.toLowerCase();
    return clieName.includes(searchTerm.toLowerCase()) || proyName.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="animate-fade">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Gestión de Proyectos</h1>
          <p style={{ color: 'var(--text-muted)' }}>Mantenimiento técnico e integración contable automática.</p>
        </div>
        <button onClick={() => { setEditingId(null); resetForm(); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Nuevo Proyecto
        </button>
      </header>

      <div style={{ marginBottom: '1.5rem' }}>
        <input 
          type="text" 
          placeholder="🔍 Buscar por proyecto o cliente..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '0.75rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)', width: '100%', maxWidth: '400px', boxShadow: 'var(--shadow-sm)' }}
        />
      </div>

      {/* MODAL NUEVO/EDITAR PROYECTO */}
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: nuevoProyecto.firmado ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: nuevoProyecto.firmado ? 'var(--success)' : 'var(--warning)', padding: '0.75rem', borderRadius: 8, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={nuevoProyecto.firmado} onChange={(e) => setNuevoProyecto({...nuevoProyecto, firmado: e.target.checked})} style={{ width: 16, height: 16 }} /> 
                  {nuevoProyecto.firmado ? 'Contrato Firmado' : 'Pendiente de Firma'}
                </label>
                <select value={nuevoProyecto.tipo} onChange={(e) => setNuevoProyecto({...nuevoProyecto, tipo: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                  <optgroup label="Topografía">{SERVICIOS_INGENIERIA.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>
                  <optgroup label="Valuación">{SERVICIOS_VALUACION.map(s => <option key={s} value={s}>{s}</option>)}</optgroup>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <select 
                  value={nuevoProyecto.protocolo_id} 
                  onChange={(e) => {
                    const protoId = e.target.value;
                    let nextFolio = nuevoProyecto.folio;
                    if (protoId && !editingId) {
                      const usedInTomo = proyectos
                        .filter(p => p.protocolo_id == protoId && p.folio)
                        .map(p => parseInt(p.folio, 10))
                        .filter(n => !isNaN(n) && n >= 0);
                      const maxUsed = usedInTomo.length > 0 ? Math.max(...usedInTomo) : 0;
                      if (maxUsed >= 0 && maxUsed < 186) {
                        nextFolio = (maxUsed + 2).toString();
                      }
                    }
                    setNuevoProyecto({ ...nuevoProyecto, protocolo_id: protoId, folio: nextFolio });
                  }} 
                  style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}
                >
                  <option value="">(Sin Protocolo Asignado)</option>
                  {protocolosActivos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <select value={nuevoProyecto.folio} onChange={(e) => setNuevoProyecto({...nuevoProyecto, folio: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                  <option value="">(Sin Folio Asignado)</option>
                  {Array.from({ length: 93 }, (_, i) => (i + 1) * 2).map(f => <option key={f} value={f}>Folio {f.toString().padStart(3, '0')}</option>)}
                </select>
              </div>
              
              <div style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.03)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 700, fontSize: '1.1rem' }}>Finanzas del Proyecto</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer', background: 'white', padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={nuevoProyecto.tiene_iva} onChange={(e) => setNuevoProyecto({...nuevoProyecto, tiene_iva: e.target.checked})} /> Aplicar IVA 13%
                  </label>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Costo Base Honorarios (₡)</label>
                    <input type="number" required placeholder="0" value={nuevoProyecto.costo} onChange={(e) => setNuevoProyecto({...nuevoProyecto, costo: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'white' }} />
                  </div>
                  {!editingId && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Dinero Adelantado (₡)</label>
                        <input type="number" placeholder="0" value={nuevoProyecto.adelanto} onChange={(e) => setNuevoProyecto({...nuevoProyecto, adelanto: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'white' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Método de Pago Adelanto</label>
                        <select value={nuevoProyecto.metodo_pago || 'Transferencia Bancaria'} onChange={(e) => setNuevoProyecto({...nuevoProyecto, metodo_pago: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'white' }}>
                          <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                          <option value="SINPE">SINPE</option>
                          <option value="Depósito">Depósito</option>
                          <option value="Efectivo">Efectivo</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'white', borderRadius: 8, boxShadow: 'var(--shadow-sm)' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Final (Con IVA)</div>
                    <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>₡{calcularTotalConIVA(nuevoProyecto.costo || 0, nuevoProyecto.tiene_iva).toLocaleString()}</div>
                  </div>
                  {!editingId && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Saldo Pendiente</div>
                      <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--danger)' }}>
                        ₡{Math.max(0, calcularTotalConIVA(nuevoProyecto.costo || 0, nuevoProyecto.tiene_iva) - Number(nuevoProyecto.adelanto || 0)).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
                {!editingId && Number(nuevoProyecto.adelanto) > 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    ✅ El adelanto se guardará automáticamente en Contabilidad.
                  </p>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>{editingId ? 'Guardar Cambios' : 'Crear Proyecto'}</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR ABONO */}
      {showAbonoModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 400, background: 'var(--bg-sidebar)' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Registrar Abono</h2>
            <form onSubmit={handleRegistrarAbono} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Monto del Pago (₡)</label>
              <input type="number" required placeholder="Ej. 150000" value={abonoData.monto} onChange={(e) => setAbonoData({...abonoData, monto: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              
              <label style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.5rem' }}>Método de Pago</label>
              <select value={abonoData.metodo_pago} onChange={(e) => setAbonoData({...abonoData, metodo_pago: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                <option value="SINPE">SINPE</option>
                <option value="Depósito">Depósito</option>
                <option value="Efectivo">Efectivo</option>
              </select>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none', background: 'var(--success)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Registrar Ingreso</button>
                <button type="button" onClick={() => setShowAbonoModal(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`${styles.card} glass`} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>Proyecto</th>
              <th style={{ padding: '1rem' }}>Cliente</th>
              <th style={{ padding: '1rem' }}>Costo / Saldo</th>
              <th style={{ padding: '1rem' }}>Firma</th>
              <th style={{ padding: '1rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {proyectosFiltrados.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron proyectos.</td></tr>
            ) : proyectosFiltrados.map((p) => {
              const total = calcularTotalConIVA(p.costo || 0, p.tiene_iva);
              const saldo = Math.max(0, total - Number(p.adelanto || 0));
              const isExpanded = expandedProy === p.id;
              
              return (
                <React.Fragment key={p.id}>
                  <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 700 }}>{p.nombre}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contrato: {p.numero_contrato || 'N/A'} • {p.tipo}</div>
                      {p.protocolos && p.folio && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, marginTop: '0.2rem' }}>
                          📜 {p.protocolos.nombre} • Folio {p.folio.toString().padStart(3, '0')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {p.clientes?.nombre}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.clientes?.telefono || 'Sin teléfono'}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600 }}>Costo: ₡{total.toLocaleString()}</div>
                      <div style={{ fontSize: '0.8rem', color: saldo > 0 ? 'var(--danger)' : 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                        Saldo: ₡{saldo.toLocaleString()}
                        {saldo > 0 && (
                          <button onClick={() => { setAbonoData({ proyecto_id: p.id, cliente_id: p.cliente_id, monto: '', metodo_pago: 'Transferencia' }); setShowAbonoModal(true); }} style={{ padding: '0.1rem 0.4rem', borderRadius: 4, border: 'none', background: 'var(--success)', color: 'white', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}>+ Abono</button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, background: p.firmado ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: p.firmado ? 'var(--success)' : 'var(--warning)' }}>
                        {p.firmado ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => { setEditingId(p.id); setNuevoProyecto(p); setShowModal(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✏️</button>
                        <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button>
                        <button onClick={() => { if (expandedProy === p.id) setExpandedProy(null); else { setExpandedProy(p.id); fetchPresentaciones(p.id); fetchGastosProyecto(p.id); } }} style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--primary)', background: isExpanded ? 'var(--primary)' : 'transparent', color: isExpanded ? 'white' : 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>{isExpanded ? 'Cerrar' : 'Detalles'}</button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                      <td colSpan="5" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                          
                          {/* Columna 1: Seguimiento de Trámites */}
                          <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>📋 Seguimiento de Trámites</h4>
                              {!showPresForm && <button onClick={() => { setEditingPresId(null); setNuevaPres({ anio: new Date().getFullYear().toString(), codigo: '', estado: 'Catastro' }); setShowPresForm(true); }} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>+ Agregar Trámite</button>}
                            </div>
                            
                            {showPresForm && (
                              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flex: 1, minWidth: '220px' }}>
                                  <select value={nuevaPres.anio} onChange={(e) => setNuevaPres({...nuevaPres, anio: e.target.value})} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'white' }}>
                                    {Array.from({ length: 91 }, (_, i) => 2010 + i).map(year => (
                                      <option key={year} value={year.toString()}>{year}</option>
                                    ))}
                                  </select>
                                  <span>-</span>
                                  <input placeholder="Consecutivo (Ej: 123456-C)" value={nuevaPres.codigo} onChange={(e) => setNuevaPres({...nuevaPres, codigo: e.target.value})} style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }} />
                                </div>
                                <input placeholder="Área (m²)" type="number" step="any" value={nuevaPres.area || ''} onChange={(e) => setNuevaPres({...nuevaPres, area: e.target.value})} style={{ width: '110px', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }} />
                                <select value={nuevaPres.estado} onChange={(e) => setNuevaPres({...nuevaPres, estado: e.target.value})} style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)', minWidth: '150px', background: 'white' }}>
                                  {ESTADOS_PRESENTACION.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                                <button onClick={() => handleAddPres(p.id)} style={{ padding: '0.5rem 1rem', background: 'var(--success)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                                <button onClick={() => { setShowPresForm(false); setEditingPresId(null); }} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
                              </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {presentaciones[p.id]?.map(pres => (
                                <div key={pres.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {necesitaActualizacion(pres.created_at, pres.estado) && <span title="Más de 8 días sin actualizar" style={{ cursor: 'help' }}>⚠️</span>}
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{pres.nombre}</span>
                                    {pres.area && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.04)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>📐 {Number(pres.area).toLocaleString()} m²</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <select value={pres.estado} onChange={(e) => handleUpdatePresEstado(p.id, pres.id, e.target.value)} style={{ padding: '0.3rem', borderRadius: 6, fontSize: '0.85rem' }}>
                                      {ESTADOS_PRESENTACION.map(e => <option key={e} value={e}>{e}</option>)}
                                    </select>
                                    <button onClick={() => {
                                      const parts = pres.nombre.split('-');
                                      const anio = parts[0];
                                      const cod = parts.slice(1).join('-');
                                      setNuevaPres({ anio: anio, codigo: cod, estado: pres.estado, area: pres.area || '' });
                                      setEditingPresId(pres.id);
                                      setShowPresForm(true);
                                    }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✏️</button>
                                    <button onClick={() => handleDeletePres(p.id, pres.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>🗑️</button>
                                  </div>
                                </div>
                              ))}
                              {(!presentaciones[p.id] || presentaciones[p.id].length === 0) && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>No hay trámites registrados.</div>
                              )}
                            </div>
                          </div>

                          {/* Columna 2: Finanzas y Gastos de Campo (Opción 5) */}
                          <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>🚜 Gastos y Viáticos de Campo</h4>
                              {!showGastoForm && (
                                <button 
                                  onClick={() => setShowGastoForm(true)} 
                                  style={{ padding: '0.35rem 0.7rem', borderRadius: 6, background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                                >
                                  + Gasto de Campo
                                </button>
                              )}
                            </div>

                            {showGastoForm && (
                              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.03)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                  <input 
                                    placeholder="Monto Gasto (₡)" 
                                    type="number"
                                    value={nuevoGasto.monto} 
                                    onChange={(e) => setNuevoGasto({...nuevoGasto, monto: e.target.value})} 
                                    style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }} 
                                  />
                                  <input 
                                    type="date"
                                    value={nuevoGasto.fecha} 
                                    onChange={(e) => setNuevoGasto({...nuevoGasto, fecha: e.target.value})} 
                                    style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }} 
                                  />
                                </div>
                                <input 
                                  placeholder="Ej: Gasolina, Peón de campo, Estacas..." 
                                  value={nuevoGasto.descripcion} 
                                  onChange={(e) => setNuevoGasto({...nuevoGasto, descripcion: e.target.value})} 
                                  style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }} 
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input 
                                      type="checkbox" 
                                      checked={nuevoGasto.tiene_iva} 
                                      onChange={(e) => setNuevoGasto({...nuevoGasto, tiene_iva: e.target.checked})} 
                                    /> 
                                    Incluye IVA 13%
                                  </label>
                                  <select 
                                    value={nuevoGasto.metodo_pago} 
                                    onChange={(e) => setNuevoGasto({...nuevoGasto, metodo_pago: e.target.value})} 
                                    style={{ padding: '0.3rem', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.8rem' }}
                                  >
                                    <option value="Transferencia">Transferencia</option>
                                    <option value="SINPE">SINPE</option>
                                    <option value="Efectivo">Efectivo</option>
                                  </select>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                  <button type="button" onClick={() => handleAddGasto(p.id, p.cliente_id)} style={{ flex: 1, padding: '0.4rem', background: 'var(--success)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>Guardar</button>
                                  <button type="button" onClick={() => setShowGastoForm(false)} style={{ flex: 1, padding: '0.4rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
                                </div>
                              </div>
                            )}

                            {/* Lista de gastos del proyecto */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                              {gastosProyecto[p.id]?.map(g => (
                                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', border: '1px solid var(--border)', borderRadius: 8, background: 'rgba(239, 68, 68, 0.02)' }}>
                                  <div>
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{g.descripcion}</span>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{g.fecha} • {g.metodo_pago}</div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--danger)' }}>-₡{Math.round(g.monto).toLocaleString()}</span>
                                    <button onClick={() => handleDeleteGasto(p.id, g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
                                  </div>
                                </div>
                              ))}
                              {(!gastosProyecto[p.id] || gastosProyecto[p.id].length === 0) && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>No hay gastos de campo registrados.</div>
                              )}
                            </div>

                            {/* Resumen de Utilidad Real de este Proyecto */}
                            <div style={{ borderTop: '2px solid var(--border)', paddingTop: '1rem', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span>Costo Base Honorarios (Con IVA):</span>
                                <span style={{ fontWeight: 600 }}>₡{total.toLocaleString()}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span>Abonos / Adelantos Recibidos:</span>
                                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                                  ₡{Number(p.adelanto || 0).toLocaleString()}
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span>Gastos de Campo y Viáticos:</span>
                                <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
                                  -₡{Math.round(gastosProyecto[p.id]?.reduce((acc, g) => acc + Number(g.monto), 0) || 0).toLocaleString()}
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.5rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 6, border: '1px solid var(--success)', marginTop: '0.25rem' }}>
                                <span style={{ fontWeight: 700 }}>Utilidad Real del Proyecto:</span>
                                <span style={{ fontWeight: 800, color: 'var(--success)' }}>
                                  ₡{(Number(p.adelanto || 0) - (gastosProyecto[p.id]?.reduce((acc, g) => acc + Number(g.monto), 0) || 0)).toLocaleString()}
                                </span>
                              </div>
                            </div>
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
    </div>
  );
}
