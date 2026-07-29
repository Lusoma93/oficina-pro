"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

const ESTADOS_PROYECTO = ["Catastro", "Disponibilidad de Agua", "Trámites Adicionales", "Municipalidad", "Apelación", "Mantenimiento de Mapa", "Catastro Final", "Finalizado", "Cancelación", "Desestimada"];
const ESTADOS_INACTIVOS = ["Finalizado", "Cancelación", "Desestimada"];

export default function DashboardOverview() {
  const [stats, setStats] = useState({
    proyectosActivos: 0,
    ingresosMes: 0,
    pendientesFirma: 0,
    gastosMes: 0
  });
  const [loading, setLoading] = useState(true);
  const [recientes, setRecientes] = useState([]);
  const [sinFirmar, setSinFirmar] = useState([]);
  const [activeTomo, setActiveTomo] = useState(null);
  const [ultimoFolio, setUltimoFolio] = useState(null);
  const [protocolos, setProtocolos] = useState([]);
  const [estancados, setEstancados] = useState([]);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    
    const now = new Date();
    // YYYY-MM-01 format (current month)
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    
    // 1. Proyectos Activos y Estancados
    const { data: allProys } = await supabase
      .from('proyectos')
      .select('id, nombre, created_at, estado, clientes(nombre)');

    const activeProys = (allProys || []).filter(p => !ESTADOS_INACTIVOS.includes(p.estado));
    const proyCount = activeProys.length;

    const { data: allPres } = await supabase.from('presentaciones').select('proyecto_id, created_at');
    
    const stalled = [];
    const nowTs = Date.now();
    (activeProys || []).forEach(p => {
      const pPres = (allPres || []).filter(pr => pr.proyecto_id === p.id);
      let latestTs = new Date(p.created_at).getTime();
      pPres.forEach(pr => {
        const ts = new Date(pr.created_at).getTime();
        if (ts > latestTs) latestTs = ts;
      });
      
      const diffDays = Math.floor((nowTs - latestTs) / (1000 * 60 * 60 * 24));
      if (diffDays >= 8) {
        stalled.push({ ...p, diasEstancado: diffDays });
      }
    });
    stalled.sort((a,b) => b.diasEstancado - a.diasEstancado);
    setEstancados(stalled);

    // 2. Pendientes de Firma (usando el nuevo campo 'firmado')
    const { count: firmaCount, data: dataSinFirmar } = await supabase
      .from('proyectos')
      .select('id, nombre, numero_contrato, clientes(nombre)', { count: 'exact' })
      .eq('firmado', false);

    // 3. Ingresos y Gastos (Mes actual estrictamente)
    const { data: transData } = await supabase
      .from('transacciones')
      .select('monto, tipo, fecha')
      .gte('fecha', firstDay);
    
    const { data: fijosData } = await supabase
      .from('gastos_fijos')
      .select('monto')
      .eq('estado', 'Activo');
    const totalFijos = (fijosData || []).reduce((acc, g) => acc + Number(g.monto), 0);
    
    const ingresos = transaccionesTotal(transData, 'Ingreso');
    const gastos = transaccionesTotal(transData, 'Gasto') + totalFijos;

    // 4. Proyectos Recientes
    const { data: proyRecientes } = await supabase
      .from('proyectos')
      .select('*, clientes(nombre)')
      .order('created_at', { ascending: false })
      .limit(6);

    // 5. Tomos y Folios
    const { data: todosProtocolos } = await supabase
      .from('protocolos')
      .select('*')
      .order('nombre', { ascending: true });

    setProtocolos(todosProtocolos || []);

    const activeTomoData = (todosProtocolos || []).filter(p => p.activo);

    if (activeTomoData && activeTomoData.length > 0) {
      const tomo = activeTomoData[0];
      setActiveTomo(tomo);

      const { data: lastFolioData } = await supabase
        .from('proyectos')
        .select('folio, nombre')
        .eq('protocolo_id', tomo.id)
        .not('folio', 'is', null);

      if (lastFolioData && lastFolioData.length > 0) {
        const validFolios = lastFolioData
          .map(p => ({ ...p, numericFolio: parseInt(p.folio, 10) }))
          .filter(p => !isNaN(p.numericFolio) && p.numericFolio >= 0);

        if (validFolios.length > 0) {
          validFolios.sort((a, b) => b.numericFolio - a.numericFolio);
          setUltimoFolio(validFolios[0]);
        } else {
          setUltimoFolio(null);
        }
      } else {
        setUltimoFolio(null);
      }
    } else {
      setActiveTomo(null);
      setUltimoFolio(null);
    }

    setStats({
      proyectosActivos: proyCount || 0,
      ingresosMes: ingresos,
      pendientesFirma: firmaCount || 0,
      gastosMes: gastos
    });
    setRecientes(proyRecientes || []);
    setSinFirmar(dataSinFirmar || []);
    setLoading(false);
  }

  function transaccionesTotal(data, tipo) {
    if (!data) return 0;
    return data.filter(t => t.tipo === tipo).reduce((acc, t) => acc + Number(t.monto), 0);
  }

  async function handleUpdateEstado(id, nuevoEstado) {
    await supabase.from('proyectos').update({ estado: nuevoEstado }).eq('id', id);
    fetchStats();
  }

  async function handleCambiarTomoActivo(nuevoTomoId) {
    setLoading(true);
    // Poner todos en inactivo
    await supabase.from('protocolos').update({ activo: false }).neq('id', 0);
    // Poner el seleccionado en activo
    if (nuevoTomoId) {
      await supabase.from('protocolos').update({ activo: true }).eq('id', nuevoTomoId);
    }
    fetchStats();
  }

  return (
    <div className="animate-fade">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Hola, Walter 👋</h1>
          <p style={{ color: 'var(--text-muted)' }}>Resumen del mes y estado de proyectos.</p>
        </div>
      </header>

      {/* Banner de Protocolo Activo */}
      <section style={{ display: 'flex', gap: '1rem', background: 'var(--bg-sidebar)', padding: '1.25rem', borderRadius: 16, border: '1px solid var(--border)', marginBottom: '1.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '2.5rem' }}>📜</div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.2rem' }}>PROTOCOLO ACTIVO ACTUAL</div>
            <select 
              value={activeTomo ? activeTomo.id : ""} 
              onChange={(e) => handleCambiarTomoActivo(e.target.value)}
              style={{ fontSize: '1.1rem', fontWeight: 700, padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--primary)', background: 'rgba(59, 130, 246, 0.05)', color: 'var(--primary)', cursor: 'pointer', outline: 'none' }}
            >
              <option value="">(Ninguno)</option>
              {protocolos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            {activeTomo?.descripcion && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                {activeTomo.descripcion}
              </div>
            )}
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', padding: '0.75rem 1.25rem', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '180px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Último Folio Utilizado</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)', marginTop: '0.1rem' }}>
            {ultimoFolio ? `Folio ${ultimoFolio.folio.toString().padStart(3, '0')}` : "---"}
          </span>
          {ultimoFolio && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem', maxWidth: '200px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              En: {ultimoFolio.nombre}
            </span>
          )}
        </div>
      </section>

      {/* Stats Grid */}
      <section className={styles.statsGrid}>
        <div className={`${styles.statCard} glass`}>
          <span className={styles.statLabel}>Proyectos Activos</span>
          <span className={styles.statValue}>{stats.proyectosActivos}</span>
        </div>
        <div className={`${styles.statCard} glass`}>
          <span className={styles.statLabel}>Ingresos (Mes Actual)</span>
          <span className={styles.statValue} style={{ color: 'var(--success)' }}>₡{stats.ingresosMes.toLocaleString()}</span>
        </div>
        <div className={`${styles.statCard} glass`}>
          <span className={styles.statLabel}>Contratos Sin Firmar</span>
          <span className={styles.statValue} style={{ color: stats.pendientesFirma > 0 ? 'var(--warning)' : 'inherit' }}>{stats.pendientesFirma}</span>
        </div>
        <div className={`${styles.statCard} glass`}>
          <span className={styles.statLabel}>Gastos (Mes Actual)</span>
          <span className={styles.statValue} style={{ color: 'var(--danger)' }}>₡{stats.gastosMes.toLocaleString()}</span>
        </div>
      </section>

      {/* Alertas de Proyectos Estancados */}
      {estancados.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 12, padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              🚨 Alertas de Tramitología (Estancados {'>'} 8 días)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {estancados.slice(0, 5).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '0.75rem 1rem', borderRadius: 8, borderLeft: '4px solid var(--danger)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.nombre}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.clientes?.nombre} • Estado actual: {p.estado}</div>
                  </div>
                  <div style={{ background: 'var(--danger)', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>
                    {p.diasEstancado} días sin avance
                  </div>
                </div>
              ))}
              {estancados.length > 5 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--danger)', fontWeight: 600, textAlign: 'center', marginTop: '0.5rem' }}>
                  + {estancados.length - 5} proyectos más requieren atención
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Content Section */}
      <div className={styles.contentGrid}>
        <section className={`${styles.card} glass`} style={{ overflowX: 'auto' }}>
          <h2 className={styles.cardTitle}>Proyectos Recientes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '400px' }}>
            {recientes.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay proyectos recientes.</p>
            ) : recientes.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 12 }}>
                <div style={{ flex: 1, paddingRight: '1rem' }}>
                  <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.clientes?.nombre || 'Sin cliente'} • {p.tipo}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <select 
                    value={p.estado} 
                    onChange={(e) => handleUpdateEstado(p.id, e.target.value)}
                    style={{ 
                      padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--border)',
                      background: ESTADOS_INACTIVOS.includes(p.estado) ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-sidebar)', 
                      color: ESTADOS_INACTIVOS.includes(p.estado) ? 'var(--success)' : 'inherit',
                      cursor: 'pointer'
                    }}
                  >
                    {ESTADOS_PROYECTO.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.card} glass`} style={{ overflowX: 'auto' }}>
          <h2 className={styles.cardTitle}>⚠️ Pendientes de Firma</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '250px' }}>
            {sinFirmar.length === 0 ? (
              <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>
                ¡Excelente! Todos los contratos han sido firmados.
              </div>
            ) : sinFirmar.map((p) => (
              <div key={p.id} style={{ padding: '1rem', borderLeft: '4px solid var(--warning)', background: 'rgba(245, 158, 11, 0.05)', borderRadius: '0 8px 8px 0' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.clientes?.nombre || 'Cliente Desconocido'}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{p.nombre} ({p.numero_contrato || 'S/N'})</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
