"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

export default function Contabilidad() {
  const [activeTab, setActiveTab] = useState('resumen'); // resumen, ingresos, egresos, recurrentes
  const [transacciones, setTransacciones] = useState([]);
  const [activos, setActivos] = useState([]);
  const [gastosFijos, setGastosFijos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State para Transacciones
  const [showModal, setShowModal] = useState(false);
  const [tipoTransaccion, setTipoTransaccion] = useState('Ingreso');
  const [nuevaTransaccion, setNuevaTransaccion] = useState({
    descripcion: '', monto: '', categoria: '', fecha: new Date().toISOString().split('T')[0],
    metodo_pago: 'Transferencia Bancaria', clave_xml: '', iva_tarifa: 0.13, retencion: 0,
    es_deducible: true, aceptado_hacienda: true, estado_pago: 'Cobrado'
  });

  // Modal State para Gastos Fijos
  const [showFijoModal, setShowFijoModal] = useState(false);
  const [nuevoFijo, setNuevoFijo] = useState({ nombre: '', monto: '', dia_cobro: 1, estado: 'Activo' });
  
  // State para Reporte de Impresión
  const [showPrintReport, setShowPrintReport] = useState(false);
  const [showFacturasPrint, setShowFacturasPrint] = useState(false);

  // Filtros para reportes
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth());
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear());

  const [megaPath, setMegaPath] = useState('');
  const [downloadsPath, setDownloadsPath] = useState('');

  useEffect(() => { 
    fetchData(); 
    setMegaPath(localStorage.getItem("facel_mega_path") || "");
    setDownloadsPath(localStorage.getItem("facel_downloads_path") || "");
  }, []);

  async function handleSelectFolder(type) {
    try {
      const res = await fetch("http://127.0.0.1:3001/select-folder", { method: 'POST' });
      const data = await res.json();
      if (data.path) {
        if (type === 'mega') {
          setMegaPath(data.path);
          localStorage.setItem("facel_mega_path", data.path);
        } else {
          setDownloadsPath(data.path);
          localStorage.setItem("facel_downloads_path", data.path);
        }
      }
    } catch(e) {
      alert("Error: Asegúrate de que el Agente Local esté corriendo para poder abrir el explorador de Windows.");
    }
  }

  async function fetchData() {
    setLoading(true);
    let transData = [];
    const { data: rawTrans, error: transError } = await supabase
      .from('transacciones')
      .select('*, proyectos(nombre, numero_contrato, cliente_id, costo), clientes(nombre, cedula, telefono)')
      .order('fecha', { ascending: false });

    const { data: proys } = await supabase.from('proyectos').select('id, nombre, numero_contrato, cliente_id, costo');
    const { data: clies } = await supabase.from('clientes').select('id, nombre, cedula, telefono');

    if (transError) {
      console.warn("Falla en consulta unificada. Intentando consulta robusta...", transError);
      const { data: simpleTrans } = await supabase.from('transacciones').select('*').order('fecha', { ascending: false });
      transData = simpleTrans || [];
    } else {
      transData = rawTrans || [];
    }

    // Auto-reparar transacciones sin proyecto (huérfanas)
    transData = transData.map(t => {
      let proy = t.proyectos;
      if (!proy && proys) {
        proy = proys.find(p => p.id == t.proyecto_id);
        if (!proy) {
          proy = proys.find(p => {
            if (!t.descripcion) return false;
            const desc = t.descripcion.toLowerCase();
            const pName = p.nombre.toLowerCase();
            if (desc.includes(pName)) return true;
            
            let term = desc;
            if (desc.startsWith('adelanto inicial: ')) {
              term = desc.replace('adelanto inicial: ', '').trim();
            } else if (desc.startsWith('abono de proyecto: ')) {
              term = desc.replace('abono de proyecto: ', '').trim();
            }
            if (term.length > 2 && pName.includes(term)) return true;
            return false;
          });
        }
      }
      
      let clie = t.clientes;
      if (!clie && clies) {
        clie = clies.find(c => c.id == t.cliente_id);
        if (!clie && proy) {
          clie = clies.find(c => c.id == proy.cliente_id);
        }
      }

      return {
        ...t,
        proyectos: proy || null,
        clientes: clie || null
      };
    });

    const { data: activosData } = await supabase.from('activos').select('*');
    const { data: fijosData } = await supabase.from('gastos_fijos').select('*').order('dia_cobro', { ascending: true });
    
    setTransacciones(transData);
    setActivos(activosData || []);
    setGastosFijos(fijosData || []);
    setLoading(false);
  }

  // --- CÁLCULOS TRIBUTARIOS (COSTA RICA) ---
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const transMesActual = transacciones.filter(t => {
    if (!t.fecha) return false;
    const dateStr = t.fecha.split('T')[0];
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    return month === mesFiltro && year === anioFiltro;
  });

  const transAnioActual = transacciones.filter(t => {
    if (!t.fecha) return false;
    const dateStr = t.fecha.split('T')[0];
    const year = parseInt(dateStr.split('-')[0], 10);
    return year === currentYear;
  });

  // 1. Control Mensual de IVA (Mes Actual)
  const ivaDevengado = transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => acc + Number(t.iva || 0), 0);
  const ivaSoportado = transMesActual.filter(t => t.tipo === 'Gasto' && t.es_deducible).reduce((acc, t) => acc + Number(t.iva || 0), 0);
  const ivaNeto = ivaDevengado - ivaSoportado;

  // 3. Balance Mensual de Caja (Flujo de Efectivo Real - Sincronizado con Dashboard)
  const ingresosMensualesReales = transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => acc + Number(t.monto || 0), 0);
  const gastosFijosMensualesReales = gastosFijos.filter(g => g.estado === 'Activo').reduce((acc, g) => acc + Number(g.monto || 0), 0);
  const gastosVariablesMensualesReales = transMesActual.filter(t => t.tipo === 'Gasto').reduce((acc, t) => acc + Number(t.monto || 0), 0);
  const utilidadMensualReal = ingresosMensualesReales - gastosFijosMensualesReales - gastosVariablesMensualesReales;

  // 2. Proyección Anual de Impuesto sobre la Renta
  const ingresosBrutosAnual = transAnioActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => acc + Number(t.subtotal || t.monto), 0);
  const gastosOperativosAnual = transAnioActual.filter(t => t.tipo === 'Gasto' && t.es_deducible).reduce((acc, t) => acc + Number(t.subtotal || t.monto), 0);
  
  // Gastos Fijos (Escudo Fiscal Operativo Automático)
  const gastosFijosActivos = gastosFijos.filter(g => g.estado === 'Activo').reduce((acc, g) => acc + Number(g.monto), 0);
  const totalGastosFijosAnual = gastosFijosActivos * 12;

  // Depreciación anualizada (Escudo Fiscal)
  const gastoDepreciacionAnual = activos.reduce((acc, a) => {
    const depMensual = Number(a.valor) / Number(a.vida_util || 60);
    return acc + (depMensual * 12);
  }, 0);

  const utilidadNeta = ingresosBrutosAnual - gastosOperativosAnual - gastoDepreciacionAnual - totalGastosFijosAnual;
  
  // Estimación Renta (Tramos progresivos Costa Rica - Servicios Profesionales de Arquitectura e Ingeniería 2026)
  let estimacionRenta = 0;
  if (utilidadNeta > 0) {
    let base = utilidadNeta;
    
    // Tramos progresivos oficiales Persona Física con Actividad Lucrativa:
    // Tramo 1: Hasta ₡4,224,000 -> Exento (0%)
    // Tramo 2: Sobre el exceso de ₡4,224,000 y hasta ₡6,307,000 -> 10%
    // Tramo 3: Sobre el exceso de ₡6,307,000 y hasta ₡10,520,000 -> 15%
    // Tramo 4: Sobre el exceso de ₡10,520,000 y hasta ₡21,102,000 -> 20%
    // Tramo 5: Sobre el exceso de ₡21,102,000 -> 25%
    
    const T1 = 4224000;
    const T2 = 6307000;
    const T3 = 10520000;
    const T4 = 21102000;
    
    if (base <= T1) {
      estimacionRenta = 0;
    } else if (base <= T2) {
      estimacionRenta = (base - T1) * 0.10;
    } else if (base <= T3) {
      estimacionRenta = ((T2 - T1) * 0.10) + ((base - T2) * 0.15);
    } else if (base <= T4) {
      estimacionRenta = ((T2 - T1) * 0.10) + ((T3 - T2) * 0.15) + ((base - T3) * 0.20);
    } else {
      estimacionRenta = ((T2 - T1) * 0.10) + ((T3 - T2) * 0.15) + ((T4 - T3) * 0.20) + ((base - T4) * 0.25);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const montoNum = Number(nuevaTransaccion.monto);
    const subtotalNum = montoNum / (1 + Number(nuevaTransaccion.iva_tarifa));
    const ivaNum = montoNum - subtotalNum;

    await supabase.from('transacciones').insert([{
      ...nuevaTransaccion,
      monto: montoNum,
      subtotal: subtotalNum,
      iva: ivaNum,
      tipo: tipoTransaccion
    }]);

    setShowModal(false);
    setNuevaTransaccion({
      descripcion: '', monto: '', categoria: tipoTransaccion === 'Ingreso' ? 'Ingeniería' : 'Servicios Públicos / Oficina', fecha: new Date().toISOString().split('T')[0],
      metodo_pago: 'Transferencia Bancaria', clave_xml: '', iva_tarifa: 0.13, retencion: 0,
      es_deducible: true, aceptado_hacienda: true, estado_pago: 'Cobrado'
    });
    fetchData();
  }

  async function handleDelete(id) {
    if (confirm("¿Seguro que desea eliminar este registro contable? Afectará los balances tributarios.")) {
      await supabase.from('transacciones').delete().eq('id', id);
      fetchData();
    }
  }

  // Gastos Fijos Handlers
  async function handleSubmitFijo(e) {
    e.preventDefault();
    await supabase.from('gastos_fijos').insert([nuevoFijo]);
    setShowFijoModal(false);
    setNuevoFijo({ nombre: '', monto: '', dia_cobro: 1, estado: 'Activo' });
    fetchData();
  }

  async function handleDeleteFijo(id) {
    if (confirm("¿Eliminar este gasto fijo recurrente?")) {
      await supabase.from('gastos_fijos').delete().eq('id', id);
      fetchData();
    }
  }

  async function toggleEstadoFijo(id, estadoActual) {
    const nuevoEstado = estadoActual === 'Activo' ? 'Inactivo' : 'Activo';
    await supabase.from('gastos_fijos').update({ estado: nuevoEstado }).eq('id', id);
    fetchData();
  }

  const listaIngresos = transMesActual.filter(t => t.tipo === 'Ingreso');
  const listaEgresos = transMesActual.filter(t => t.tipo === 'Gasto');

  return (
    <div className="animate-fade">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Matriz de Control Contable</h1>
          <p style={{ color: 'var(--text-muted)' }}>Módulo Fiscal, CXC y CXP (Costa Rica).</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => { setTipoTransaccion('Ingreso'); setNuevaTransaccion(prev => ({ ...prev, categoria: 'Ingeniería' })); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--success)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            + Ingreso
          </button>
          <button onClick={() => { setTipoTransaccion('Gasto'); setNuevaTransaccion(prev => ({ ...prev, categoria: 'Servicios Públicos / Oficina' })); setShowModal(true); }} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            + Gasto
          </button>
        </div>
      </header>

      {/* Filtros Globales y Acciones de Reportes */}
      <div style={{ display: 'flex', gap: '1rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Mes / Año de Consulta:</span>
          <select value={mesFiltro} onChange={(e) => setMesFiltro(Number(e.target.value))} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
            {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <input type="number" value={anioFiltro} onChange={(e) => setAnioFiltro(Number(e.target.value))} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-sidebar)', width: '100px' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowFacturasPrint(true)} style={{ padding: '0.6rem 1rem', borderRadius: 8, background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            📊 Proyectar Facturación
          </button>
          <button onClick={() => setShowPrintReport(true)} style={{ padding: '0.6rem 1rem', borderRadius: 8, background: 'white', color: 'black', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            🖨️ Imprimir Resumen
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('resumen')} style={{ padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', background: activeTab === 'resumen' ? 'var(--primary)' : 'var(--bg-card)', color: activeTab === 'resumen' ? 'white' : 'var(--text-main)', transition: 'all 0.2s' }}>📊 Resumen Tributario</button>
        <button onClick={() => setActiveTab('ingresos')} style={{ padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', background: activeTab === 'ingresos' ? 'var(--primary)' : 'var(--bg-card)', color: activeTab === 'ingresos' ? 'white' : 'var(--text-main)', transition: 'all 0.2s' }}>📈 Cuentas por Cobrar</button>
        <button onClick={() => setActiveTab('egresos')} style={{ padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', background: activeTab === 'egresos' ? 'var(--primary)' : 'var(--bg-card)', color: activeTab === 'egresos' ? 'white' : 'var(--text-main)', transition: 'all 0.2s' }}>📉 Cuentas por Pagar</button>
        <button onClick={() => setActiveTab('recurrentes')} style={{ padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', background: activeTab === 'recurrentes' ? 'var(--primary)' : 'var(--bg-card)', color: activeTab === 'recurrentes' ? 'white' : 'var(--text-main)', transition: 'all 0.2s' }}>📅 Gastos Fijos</button>
        <button onClick={() => setActiveTab('agente')} style={{ padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', background: activeTab === 'agente' ? 'var(--primary)' : 'var(--bg-card)', color: activeTab === 'agente' ? 'white' : 'var(--text-main)', transition: 'all 0.2s' }}>🤖 Agente Local</button>
      </div>

      {/* AGENTE LOCAL TAB */}
      {activeTab === 'agente' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className={`${styles.card} glass`} style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🤖 Configuración del Agente Local (Facturador Silencioso)
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
              El Agente Local es un pequeño programa invisible que se instala en tu computadora. Permite que la web (Vercel) ordene a tu computadora abrir Chrome de forma invisible y guardar las facturas PDF directamente en tus carpetas locales (como MEGA), sin que tengas que descargar nada manualmente.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              <div style={{ background: 'var(--bg-sidebar)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--primary)' }}>1. Descargar Instalador</h3>
                <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>Si es la primera vez que usas esta computadora para facturar, descarga el instalador y dale doble clic.</p>
                <a href="/agente_local.zip?v=10" download="AgenteLocalFacel.zip" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: '8px', background: 'var(--accent)', color: 'white', textDecoration: 'none', fontWeight: 600, width: '100%', textAlign: 'center' }}>
                  📥 Descargar Agente Local (.zip)
                </a>
              </div>

              <div style={{ background: 'var(--bg-sidebar)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--success)' }}>2. Probar Conexión</h3>
                <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>Verifica si tu computadora actual tiene el agente corriendo y está lista para facturar.</p>
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch("http://127.0.0.1:3001/automate", { method: 'POST', body: '{}' });
                      // El agente dará error 400 por faltar credenciales, pero significa que sí está vivo.
                      alert("✅ ¡Conexión exitosa! El agente local está corriendo en tu computadora y está listo para recibir órdenes de facturación.");
                    } catch(e) {
                      alert("❌ Error de conexión. El agente no está corriendo en esta computadora o no lo has instalado.");
                    }
                  }} 
                  style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', background: 'var(--success)', color: 'white', border: 'none', fontWeight: 600, width: '100%', cursor: 'pointer' }}>
                  🔌 Probar Conexión Local
                </button>
              </div>
            </div>

            <div style={{ marginTop: '2rem', background: 'var(--bg-sidebar)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
               <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Rutas de Guardado (Se envían al Agente en cada factura)</h3>
               <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
                 Aunque el agente tiene sus propias rutas guardadas al instalarse, si quieres cambiarlas rápido sin reinstalar, puedes definirlas aquí. Estas rutas se guardan en el navegador de tu computadora actual.
               </p>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Ruta de Descargas (Downloads)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        value={downloadsPath}
                        readOnly
                        placeholder="Usa el botón Examinar..." 
                        style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)' }}
                      />
                      <button onClick={() => handleSelectFolder('downloads')} style={{ padding: '0 1.5rem', borderRadius: '8px', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                        Examinar...
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Ruta de MEGA (Facturas)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        value={megaPath}
                        readOnly
                        placeholder="Usa el botón Examinar..." 
                        style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)' }}
                      />
                      <button onClick={() => handleSelectFolder('mega')} style={{ padding: '0 1.5rem', borderRadius: '8px', background: 'var(--primary)', color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                        Examinar...
                      </button>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* RESUMEN TRIBUTARIO TAB */}
      {activeTab === 'resumen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* SECCIÓN DE GRÁFICOS ANALÍTICOS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '0.5rem' }}>
            
            {/* Gráfico 1: Balance de Caja Mensual */}
            <div className={`${styles.card} glass`} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>📊 Flujo de Caja (Caja del Mes)</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Comparación real de ingresos contra egresos.</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '160px', padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
                {/* Ingresos */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '60px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)' }}>₡{Math.round(ingresosMensualesReales/1000).toLocaleString()}k</div>
                  <div style={{ 
                    width: '32px', 
                    height: `${ingresosMensualesReales > 0 ? Math.max(8, Math.min(120, (ingresosMensualesReales / Math.max(ingresosMensualesReales, gastosFijosMensualesReales + gastosVariablesMensualesReales, 1)) * 120)) : 4}px`, 
                    background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)', 
                    borderRadius: '6px 6px 0 0',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                    transition: 'all 0.3s ease'
                  }}></div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Ingresos</span>
                </div>

                {/* Gastos Fijos */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '60px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--warning)' }}>₡{Math.round(gastosFijosMensualesReales/1000).toLocaleString()}k</div>
                  <div style={{ 
                    width: '32px', 
                    height: `${gastosFijosMensualesReales > 0 ? Math.max(8, Math.min(120, (gastosFijosMensualesReales / Math.max(ingresosMensualesReales, gastosFijosMensualesReales + gastosVariablesMensualesReales, 1)) * 120)) : 4}px`, 
                    background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)', 
                    borderRadius: '6px 6px 0 0',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                    transition: 'all 0.3s ease'
                  }}></div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>G. Fijos</span>
                </div>

                {/* Gastos Variables */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '60px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--danger)' }}>₡{Math.round(gastosVariablesMensualesReales/1000).toLocaleString()}k</div>
                  <div style={{ 
                    width: '32px', 
                    height: `${gastosVariablesMensualesReales > 0 ? Math.max(8, Math.min(120, (gastosVariablesMensualesReales / Math.max(ingresosMensualesReales, gastosFijosMensualesReales + gastosVariablesMensualesReales, 1)) * 120)) : 4}px`, 
                    background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)', 
                    borderRadius: '6px 6px 0 0',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
                    transition: 'all 0.3s ease'
                  }}></div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>G. Var</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '0.25rem 0' }}>
                <span style={{ fontWeight: 600 }}>Balance Neto Real:</span>
                <span style={{ fontWeight: 800, color: utilidadMensualReal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  ₡{Math.round(utilidadMensualReal).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Gráfico 2: Distribución de Gastos */}
            <div className={`${styles.card} glass`} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🚜 Distribución de Gastos</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desglose proporcional del mes seleccionado.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '160px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {(() => {
                  const gastosPorCategoria = transMesActual.filter(t => t.tipo === 'Gasto').reduce((acc, t) => {
                    const cat = t.categoria || 'Otros / Operativo';
                    acc[cat] = (acc[cat] || 0) + Number(t.monto);
                    return acc;
                  }, {});
                  if (gastosFijosMensualesReales > 0) {
                    gastosPorCategoria['Gastos Fijos Recurrentes'] = gastosFijosMensualesReales;
                  }

                  const totalGastos = Object.values(gastosPorCategoria).reduce((a, b) => a + b, 0) || 1;
                  const categoriesList = Object.entries(gastosPorCategoria).sort((a, b) => b[1] - a[1]);

                  if (categoriesList.length === 0) {
                    return <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2rem 0' }}>Sin egresos en este mes.</div>;
                  }

                  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

                  return categoriesList.map(([cat, val], idx) => {
                    const pct = (val / totalGastos) * 100;
                    const color = colors[idx % colors.length];
                    return (
                      <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '170px' }}>{cat}</span>
                          <span>₡{Math.round(val).toLocaleString()} ({Math.round(pct)}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'all 0.3s ease' }}></div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Gráfico 3: Presión Fiscal y Escalas de Renta */}
            <div className={`${styles.card} glass`} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>⚖️ Presión Fiscal (Renta Anual)</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Proyección en escalas de Servicios Profesionales.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
                {/* Indicador visual de tramos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700 }}>
                    <span>Utilidad Imponible:</span>
                    <span style={{ color: utilidadNeta > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>₡{Math.round(utilidadNeta).toLocaleString()}</span>
                  </div>
                  
                  {/* Barra de progreso de escala fiscal */}
                  <div style={{ width: '100%', height: '16px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', overflow: 'hidden', display: 'flex', border: '1px solid var(--border)' }}>
                    {(() => {
                      const limiteMax = 21102000;
                      const utilidad = Math.max(0, utilidadNeta);
                      const pctTotal = Math.min(100, (utilidad / limiteMax) * 100);
                      
                      // Calculate segment percentages relative to limiteMax:
                      const pctT1 = (4224000 / limiteMax) * 100;
                      const pctT2 = ((6307000 - 4224000) / limiteMax) * 100;
                      const pctT3 = ((10520000 - 6307000) / limiteMax) * 100;
                      const pctT4 = ((21102000 - 10520000) / limiteMax) * 100;
                      
                      return (
                        <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex' }}>
                          {/* Segment colors matching brackets */}
                          <div style={{ width: `${pctT1}%`, height: '100%', background: 'rgba(16, 185, 129, 0.15)', borderRight: '1px dashed var(--border)' }} title="0% Exento"></div>
                          <div style={{ width: `${pctT2}%`, height: '100%', background: 'rgba(245, 158, 11, 0.15)', borderRight: '1px dashed var(--border)' }} title="10%"></div>
                          <div style={{ width: `${pctT3}%`, height: '100%', background: 'rgba(239, 68, 68, 0.15)', borderRight: '1px dashed var(--border)' }} title="15%"></div>
                          <div style={{ width: `${pctT4}%`, height: '100%', background: 'rgba(224, 30, 90, 0.15)' }} title="20%"></div>
                          
                          {/* Marker showing actual profit */}
                          <div style={{ 
                            position: 'absolute', 
                            left: `${pctTotal}%`, 
                            top: 0, 
                            width: '4px', 
                            height: '100%', 
                            background: 'var(--primary)',
                            boxShadow: '0 0 8px var(--primary)',
                            transition: 'left 0.5s ease',
                            zIndex: 10
                          }}></div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Leyenda de Tramos */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'rgba(16, 185, 129, 0.4)', borderRadius: '2px' }}></span>
                    <span>&lt; ₡4.2M (Exento 0%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'rgba(245, 158, 11, 0.4)', borderRadius: '2px' }}></span>
                    <span>&lt; ₡6.3M (10%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'rgba(239, 68, 68, 0.4)', borderRadius: '2px' }}></span>
                    <span>&lt; ₡10.5M (15%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'rgba(224, 30, 90, 0.4)', borderRadius: '2px' }}></span>
                    <span>&gt; ₡10.5M (20-25%)</span>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>Renta Anual Estimada:</span>
                <span style={{ fontWeight: 800, color: 'var(--success)' }}>
                  ₡{Math.round(estimacionRenta).toLocaleString()}
                </span>
              </div>
            </div>

          </div>

          <div className={`${styles.card} glass`}>
            <h2 className={styles.cardTitle}>1. Control Mensual de IVA y Balance (Mes Seleccionado)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Proyección del mes filtrado y liquidación neta.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>(+) IVA Devengado (De Ingresos Facturados)</span>
                <span style={{ fontWeight: 700, color: 'var(--success)' }}>₡{Math.round(ivaDevengado).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>(-) IVA Soportado Acreditable (De Compras Deducibles)</span>
                <span style={{ fontWeight: 700, color: 'var(--danger)' }}>₡{Math.round(ivaSoportado).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: ivaNeto > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: `1px solid ${ivaNeto > 0 ? 'var(--danger)' : 'var(--success)'}`, borderRadius: 8 }}>
                <span style={{ fontWeight: 700 }}>(=) Saldo {ivaNeto > 0 ? 'Neto a Pagar' : 'a Favor'} (IVA)</span>
                <span style={{ fontWeight: 800, color: ivaNeto > 0 ? 'var(--danger)' : 'var(--success)' }}>₡{Math.abs(Math.round(ivaNeto)).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className={`${styles.card} glass`}>
            <h2 className={styles.cardTitle}>2. Proyección de Renta (Servicios Profesionales de Arquitectura e Ingeniería)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Cálculo progresivo por tramos de Hacienda Costa Rica para personas físicas con actividad lucrativa.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>(+) Ingresos Brutos Gravables</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>₡{Math.round(ingresosBrutosAnual).toLocaleString()}</div>
              </div>
              <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>(-) Gastos Operativos Deducibles</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>₡{Math.round(gastosOperativosAnual).toLocaleString()}</div>
              </div>
              <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>(-) Escudo Fiscal (Depreciación)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>₡{Math.round(gastoDepreciacionAnual).toLocaleString()}</div>
              </div>
              <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>(-) Gastos Fijos (Auto)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning)' }}>₡{Math.round(totalGastosFijosAnual).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 8, border: '1px solid var(--warning)' }}>
                <span style={{ fontWeight: 700 }}>(=) Utilidad Neta (Base Imponible)</span>
                <span style={{ fontWeight: 800, color: 'var(--warning)' }}>₡{Math.round(utilidadNeta).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, border: '1px solid var(--success)' }}>
                <span style={{ fontWeight: 700 }}>Estimación de Renta Progresiva</span>
                <span style={{ fontWeight: 800, color: 'var(--success)' }}>₡{Math.round(estimacionRenta).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className={`${styles.card} glass`}>
            <h2 className={styles.cardTitle}>3. Balance Mensual de Caja (Flujo Real de Efectivo)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Control real de caja del mes seleccionado (Ingresos del mes menos Gastos Fijos y Variables del mes).</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1.5rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: 12, border: '1px solid var(--success)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>(+) Ingresos del Mes</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>₡{Math.round(ingresosMensualesReales).toLocaleString()}</div>
              </div>
              <div style={{ padding: '1.5rem', background: 'rgba(245, 158, 11, 0.05)', borderRadius: 12, border: '1px solid var(--warning)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>(-) Gastos Fijos del Mes</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning)' }}>₡{Math.round(gastosFijosMensualesReales).toLocaleString()}</div>
              </div>
              <div style={{ padding: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 12, border: '1px solid var(--danger)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>(-) Gastos Variables del Mes</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>₡{Math.round(gastosVariablesMensualesReales).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', background: utilidadMensualReal >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: 8, border: `1px solid ${utilidadMensualReal >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
                <span style={{ fontWeight: 700 }}>(=) Balance Neto de Caja (Utilidad Real del Mes)</span>
                <span style={{ fontWeight: 800, color: utilidadMensualReal >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1.2rem' }}>
                  ₡{Math.round(utilidadMensualReal).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* INGRESOS TAB */}
      {activeTab === 'ingresos' && (
        <div className={`${styles.card} glass`} style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '1rem' }}>Fecha</th>
                <th style={{ padding: '1rem' }}>Descripción / Referencia</th>
                <th style={{ padding: '1rem' }}>Proyecto/Cliente</th>
                <th style={{ padding: '1rem' }}>Subtotal</th>
                <th style={{ padding: '1rem' }}>IVA</th>
                <th style={{ padding: '1rem' }}>Total Ingreso</th>
                <th style={{ padding: '1rem' }}>Estado</th>
                <th style={{ padding: '1rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listaIngresos.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{t.fecha}</td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600 }}>{t.descripcion}</div>
                    {t.clave_xml && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>XML: {t.clave_xml.substring(0,20)}...</div>}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {t.proyectos?.nombre || 'General'}<br/>
                    {t.clientes?.nombre || ''}
                  </td>
                  <td style={{ padding: '1rem' }}>₡{Math.round(t.subtotal).toLocaleString()}</td>
                  <td style={{ padding: '1rem', color: 'var(--warning)' }}>₡{Math.round(t.iva).toLocaleString()}</td>
                  <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--success)' }}>₡{Math.round(t.monto).toLocaleString()}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.7rem', background: t.estado_pago === 'Cobrado' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: t.estado_pago === 'Cobrado' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                      {t.estado_pago}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                  </td>
                </tr>
              ))}
              {listaIngresos.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay ingresos registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* EGRESOS TAB */}
      {activeTab === 'egresos' && (
        <div className={`${styles.card} glass`} style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th style={{ padding: '1rem' }}>Fecha</th>
                <th style={{ padding: '1rem' }}>Descripción de Gasto</th>
                <th style={{ padding: '1rem' }}>Categoría</th>
                <th style={{ padding: '1rem' }}>Subtotal</th>
                <th style={{ padding: '1rem' }}>IVA Soportado</th>
                <th style={{ padding: '1rem' }}>Total Gasto</th>
                <th style={{ padding: '1rem' }}>Tributación</th>
                <th style={{ padding: '1rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listaEgresos.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{t.fecha}</td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600 }}>{t.descripcion}</div>
                    {t.clave_xml && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>XML: {t.clave_xml.substring(0,20)}...</div>}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem' }}>{t.categoria || 'Operativo'}</td>
                  <td style={{ padding: '1rem' }}>₡{Math.round(t.subtotal).toLocaleString()}</td>
                  <td style={{ padding: '1rem', color: 'var(--warning)' }}>₡{Math.round(t.iva).toLocaleString()}</td>
                  <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--danger)' }}>₡{Math.round(t.monto).toLocaleString()}</td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.3rem', flexDirection: 'column' }}>
                      <span style={{ color: t.es_deducible ? 'var(--success)' : 'var(--danger)' }}>{t.es_deducible ? '✅ Deducible' : '❌ No Deducible'}</span>
                      <span style={{ color: t.aceptado_hacienda ? 'var(--success)' : 'var(--danger)' }}>{t.aceptado_hacienda ? '✅ XML Aceptado' : '⚠️ XML Pendiente'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                  </td>
                </tr>
              ))}
              {listaEgresos.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay gastos registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* RECURRENTES (GASTOS FIJOS) TAB */}
      {activeTab === 'recurrentes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => setShowFijoModal(true)} style={{ padding: '0.75rem 1.5rem', borderRadius: 12, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              + Nuevo Gasto Fijo
            </button>
          </div>
          <div className={`${styles.card} glass`} style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '1rem' }}>Descripción</th>
                  <th style={{ padding: '1rem' }}>Monto (₡)</th>
                  <th style={{ padding: '1rem' }}>Día de Cobro</th>
                  <th style={{ padding: '1rem' }}>Estado</th>
                  <th style={{ padding: '1rem' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gastosFijos.map(g => (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{g.nombre}</td>
                    <td style={{ padding: '1rem', color: 'var(--danger)', fontWeight: 600 }}>₡{Number(g.monto).toLocaleString()}</td>
                    <td style={{ padding: '1rem' }}>Los días {g.dia_cobro} de cada mes</td>
                    <td style={{ padding: '1rem' }}>
                      <button 
                        onClick={() => toggleEstadoFijo(g.id, g.estado)}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: 'none', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', background: g.estado === 'Activo' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: g.estado === 'Activo' ? 'var(--success)' : 'var(--danger)' }}
                      >
                        {g.estado}
                      </button>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <button onClick={() => handleDeleteFijo(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                    </td>
                  </tr>
                ))}
                {gastosFijos.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay gastos fijos registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR TRANSACCION (INGRESOS/EGRESOS) */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 500, background: 'var(--bg-sidebar)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem', color: tipoTransaccion === 'Ingreso' ? 'var(--success)' : 'var(--danger)' }}>Registrar {tipoTransaccion}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fecha</label>
                  <input type="date" required value={nuevaTransaccion.fecha} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, fecha: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monto Total (₡)</label>
                  <input type="number" required placeholder="0" value={nuevaTransaccion.monto} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, monto: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                </div>
              </div>
              
              <input placeholder="Descripción / Referencia" required value={nuevaTransaccion.descripcion} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, descripcion: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <input placeholder="Clave Numérica XML (Opcional, 50 dígitos)" maxLength="50" value={nuevaTransaccion.clave_xml} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, clave_xml: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', fontFamily: 'monospace', fontSize: '0.8rem' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Categoría</label>
                  {tipoTransaccion === 'Ingreso' ? (
                    <select value={nuevaTransaccion.categoria || 'Ingeniería'} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, categoria: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                      <option value="Ingeniería">Ingeniería</option>
                      <option value="Arquitectura">Arquitectura</option>
                      <option value="Consultoría">Consultoría</option>
                      <option value="Otros">Otros</option>
                    </select>
                  ) : (
                    <select value={nuevaTransaccion.categoria || 'Servicios Públicos / Oficina'} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, categoria: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                      <option value="Servicios Públicos / Oficina">Servicios Públicos / Oficina</option>
                      <option value="Gastos de Campo / Viáticos">Gastos de Campo / Viáticos</option>
                      <option value="Combustible / Transporte">Combustible / Transporte</option>
                      <option value="Herramientas / Equipamiento">Herramientas / Equipamiento</option>
                      <option value="Impuestos / Visados">Impuestos / Visados</option>
                      <option value="Otros">Otros</option>
                    </select>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Método de Pago</label>
                  <select value={nuevaTransaccion.metodo_pago} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, metodo_pago: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                    <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                    <option value="SINPE">SINPE</option>
                    <option value="Depósito">Depósito</option>
                    <option value="Efectivo">Efectivo</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Impuesto de Venta (IVA)</label>
                <select value={nuevaTransaccion.iva_tarifa} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, iva_tarifa: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)' }}>
                  <option value="0.13">Tarifa IVA 13%</option>
                  <option value="0.04">Tarifa IVA 4%</option>
                  <option value="0.02">Tarifa IVA 2%</option>
                  <option value="0">Exento 0%</option>
                </select>
              </div>

              {tipoTransaccion === 'Gasto' && (
                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={nuevaTransaccion.es_deducible} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, es_deducible: e.target.checked})} style={{ width: 16, height: 16 }} />
                    Es Deducible del Impuesto sobre la Renta
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={nuevaTransaccion.aceptado_hacienda} onChange={(e) => setNuevaTransaccion({...nuevaTransaccion, aceptado_hacienda: e.target.checked})} style={{ width: 16, height: 16 }} />
                    XML Aceptado por Ministerio de Hacienda
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Guardar {tipoTransaccion}</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REPORTE DE IMPRESIÓN */}
      {showPrintReport && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'white', color: 'black', zIndex: 99999, overflowY: 'auto', padding: '2rem' }}>
          <style>{`
            @media print {
              .no-print { display: none !important; }
            }
          `}</style>
          <div className="no-print" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button onClick={() => window.print()} style={{ padding: '0.8rem 1.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}>🖨️ Imprimir Documento</button>
            <button onClick={() => setShowPrintReport(false)} style={{ padding: '0.8rem 1.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}>Cerrar</button>
          </div>

          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem', fontFamily: 'sans-serif' }}>
              <h2 style={{ margin: 0, fontSize: '1.8rem' }}>SGIN PRO</h2>
              <p style={{ margin: '0.2rem 0', color: '#555' }}>Sistema de Gestión Integral</p>
              <p style={{ margin: 0, color: '#555' }}>Reporte Oficial de Contabilidad</p>
            </div>
            <h1 style={{ fontSize: '1.5rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '2rem', fontFamily: 'sans-serif' }}>
              Reporte de Facturación a Emitir - Mes de {new Date(anioFiltro, mesFiltro).toLocaleString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()}
            </h1>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem', fontFamily: 'sans-serif' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid black' }}>
                  <th style={{ padding: '0.5rem' }}>Fecha</th>
                  <th style={{ padding: '0.5rem' }}>Cliente</th>
                  <th style={{ padding: '0.5rem' }}>Cédula</th>
                  <th style={{ padding: '0.5rem' }}>Contrato / Descripción</th>
                  <th style={{ padding: '0.5rem' }}>Método de Pago</th>
                  <th style={{ padding: '0.5rem' }}>Subtotal</th>
                  <th style={{ padding: '0.5rem' }}>IVA</th>
                  <th style={{ padding: '0.5rem' }}>Total Cobrado</th>
                </tr>
              </thead>
              <tbody>
                {transMesActual.filter(t => t.tipo === 'Ingreso').map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #ccc' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{t.fecha}</td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>{t.clientes?.nombre || 'General'}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{t.clientes?.cedula || 'N/A'}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {t.proyectos?.numero_contrato ? <span style={{fontWeight: 'bold'}}>Contrato: {t.proyectos.numero_contrato}<br/></span> : ''}
                      <span style={{ fontSize: '0.8rem', color: '#555' }}>{t.descripcion}</span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{t.metodo_pago || 'N/A'}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>₡{Math.round(t.subtotal).toLocaleString()}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>₡{Math.round(t.iva).toLocaleString()}</td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>₡{Math.round(t.monto).toLocaleString()}</td>
                  </tr>
                ))}
                {transMesActual.filter(t => t.tipo === 'Ingreso').length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No hay ingresos registrados en el mes actual.</td></tr>
                )}
              </tbody>
              <tfoot style={{ borderTop: '2px solid black', fontWeight: 'bold' }}>
                <tr>
                  <td colSpan="5" style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>TOTALES DEL MES:</td>
                  <td style={{ padding: '1rem 0.5rem' }}>₡{Math.round(transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => acc + Number(t.subtotal || 0), 0)).toLocaleString()}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>₡{Math.round(transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => acc + Number(t.iva || 0), 0)).toLocaleString()}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>₡{Math.round(transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => acc + Number(t.monto || 0), 0)).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* MODAL REPORTE FACTURACIÓN ESTIMADA */}
      {showFacturasPrint && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'white', color: 'black', zIndex: 99999, overflowY: 'auto', padding: '2rem' }}>
          <style>{`
            @media print {
              .no-print { display: none !important; }
            }
          `}</style>
          <div className="no-print" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button onClick={() => window.print()} style={{ padding: '0.8rem 1.5rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}>🖨️ Imprimir Facturación Estimada</button>
            <button onClick={() => setShowFacturasPrint(false)} style={{ padding: '0.8rem 1.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}>Cerrar</button>
          </div>

          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem', fontFamily: 'sans-serif' }}>
              <h2 style={{ margin: 0, fontSize: '1.8rem' }}>SGIN PRO</h2>
              <p style={{ margin: '0.2rem 0', color: '#555' }}>Sistema de Gestión Integral</p>
              <p style={{ margin: 0, color: '#555' }}>Proyección de Facturación a Emitir (Cálculo Ajustado)</p>
            </div>
            <h1 style={{ fontSize: '1.5rem', borderBottom: '2px solid black', paddingBottom: '0.5rem', marginBottom: '2rem', fontFamily: 'sans-serif' }}>
              Mes de {new Date(anioFiltro, mesFiltro).toLocaleString('es-CR', { month: 'long', year: 'numeric' }).toUpperCase()}
            </h1>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem', fontFamily: 'sans-serif' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid black' }}>
                  <th style={{ padding: '0.5rem' }}>Fecha</th>
                  <th style={{ padding: '0.5rem' }}>Cliente</th>
                  <th style={{ padding: '0.5rem' }}>Cédula</th>
                  <th style={{ padding: '0.5rem' }}>Contrato / Descripción</th>
                  <th style={{ padding: '0.5rem' }}>Método de Pago</th>
                  <th style={{ padding: '0.5rem' }}>Monto Real</th>
                  <th style={{ padding: '0.5rem' }}>Monto Facturable (Subtotal)</th>
                  <th style={{ padding: '0.5rem' }}>IVA a Declarar</th>
                  <th style={{ padding: '0.5rem' }}>Total Factura</th>
                </tr>
              </thead>
              <tbody>
                {transMesActual.filter(t => t.tipo === 'Ingreso').map(t => {
                  const metodo = (t.metodo_pago || "").toLowerCase();
                  const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
                  
                  const montoReal = Number(t.monto);
                  let totalFactura = 0;
                  if (isFullBilling) {
                    totalFactura = montoReal;
                  } else {
                    const montoProyecto = t.proyectos?.costo ? Number(t.proyectos.costo) : montoReal;
                    totalFactura = montoProyecto === 0 ? 0 : (montoProyecto <= 110000 ? 45000 : montoProyecto * 0.40);
                  }
                  
                  const montoFacturable = totalFactura / 1.13; // Subtotal
                  const ivaDeclarar = totalFactura - montoFacturable; // IVA
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #ccc' }}>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{t.fecha}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>{t.clientes?.nombre || 'General'}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{t.clientes?.cedula || 'N/A'}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        {t.proyectos?.numero_contrato ? <span style={{fontWeight: 'bold'}}>Contrato: {t.proyectos.numero_contrato}<br/></span> : ''}
                        <span style={{ fontSize: '0.8rem', color: '#555' }}>{t.descripcion}</span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{t.metodo_pago || 'N/A'}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>₡{Math.round(montoReal).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>₡{Math.round(montoFacturable).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>₡{Math.round(ivaDeclarar).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>₡{Math.round(totalFactura).toLocaleString()}</td>
                    </tr>
                  )
                })}
                {transMesActual.filter(t => t.tipo === 'Ingreso').length === 0 && (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>No hay ingresos registrados en el mes filtrado.</td></tr>
                )}
              </tbody>
              <tfoot style={{ borderTop: '2px solid black', fontWeight: 'bold' }}>
                <tr>
                  <td colSpan="5" style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>TOTALES DEL MES:</td>
                  <td style={{ padding: '1rem 0.5rem' }}>₡{Math.round(transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => acc + Number(t.monto || 0), 0)).toLocaleString()}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>₡{Math.round(transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => {
                    const metodo = (t.metodo_pago || "").toLowerCase();
                    const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
                    let tf = 0;
                    if (isFullBilling) {
                      tf = Number(t.monto || 0);
                    } else {
                      const mp = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto || 0);
                      tf = mp === 0 ? 0 : (mp <= 110000 ? 45000 : mp * 0.40);
                    }
                    return acc + (tf / 1.13);
                  }, 0)).toLocaleString()}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>₡{Math.round(transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => {
                    const metodo = (t.metodo_pago || "").toLowerCase();
                    const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
                    let tf = 0;
                    if (isFullBilling) {
                      tf = Number(t.monto || 0);
                    } else {
                      const mp = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto || 0);
                      tf = mp === 0 ? 0 : (mp <= 110000 ? 45000 : mp * 0.40);
                    }
                    return acc + (tf - (tf / 1.13));
                  }, 0)).toLocaleString()}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>₡{Math.round(transMesActual.filter(t => t.tipo === 'Ingreso').reduce((acc, t) => {
                    const metodo = (t.metodo_pago || "").toLowerCase();
                    const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
                    let tf = 0;
                    if (isFullBilling) {
                      tf = Number(t.monto || 0);
                    } else {
                      const mp = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto || 0);
                      tf = mp === 0 ? 0 : (mp <= 110000 ? 45000 : mp * 0.40);
                    }
                    return acc + tf;
                  }, 0)).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR GASTO FIJO */}
      {showFijoModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: 20, width: '100%', maxWidth: 400, background: 'var(--bg-sidebar)' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Nuevo Gasto Fijo</h2>
            <form onSubmit={handleSubmitFijo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="text" required placeholder="Descripción (Ej. Alquiler Oficina)" value={nuevoFijo.nombre} onChange={(e) => setNuevoFijo({...nuevoFijo, nombre: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <input type="number" required placeholder="Monto (₡)" value={nuevoFijo.monto} onChange={(e) => setNuevoFijo({...nuevoFijo, monto: e.target.value})} style={{ padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Día de cobro en el mes</label>
                <input type="number" required min="1" max="31" value={nuevoFijo.dia_cobro} onChange={(e) => setNuevoFijo({...nuevoFijo, dia_cobro: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Guardar</button>
                <button type="button" onClick={() => setShowFijoModal(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
