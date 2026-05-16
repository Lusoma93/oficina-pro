"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/app/page.module.css";

export default function DashboardOverview() {
  const [stats, setStats] = useState({
    proyectosActivos: 0,
    ingresosMes: 0,
    pendientesFirma: 0,
    gastosMes: 0
  });
  const [loading, setLoading] = useState(true);
  const [recientes, setRecientes] = useState([]);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    
    // 1. Proyectos Activos
    const { count: proyCount } = await supabase
      .from('proyectos')
      .select('*', { count: 'exact', head: true })
      .neq('estado', 'Finalizado');

    // 2. Pendientes de Firma
    const { count: firmaCount } = await supabase
      .from('proyectos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'Pendiente Firma');

    // 3. Ingresos y Gastos (Mes actual simplificado)
    const { data: transData } = await supabase
      .from('transacciones')
      .select('monto, tipo');
    
    const ingresos = transaccionesTotal(transData, 'Ingreso');
    const gastos = transaccionesTotal(transData, 'Gasto');

    // 4. Proyectos Recientes
    const { data: proyRecientes } = await supabase
      .from('proyectos')
      .select('*, clientes(nombre)')
      .order('created_at', { ascending: false })
      .limit(3);

    setStats({
      proyectosActivos: proyCount || 0,
      ingresosMes: ingresos,
      pendientesFirma: firmaCount || 0,
      gastosMes: gastos
    });
    setRecientes(proyRecientes || []);
    setLoading(false);
  }

  function transaccionesTotal(data, tipo) {
    if (!data) return 0;
    return data.filter(t => t.tipo === tipo).reduce((acc, t) => acc + Number(t.monto), 0);
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Hola, Walter 👋</h1>
          <p style={{ color: 'var(--text-muted)' }}>Esto es lo que está pasando en la oficina hoy.</p>
        </div>
      </header>

      {/* Stats Grid */}
      <section className={styles.statsGrid}>
        <div className={`${styles.statCard} glass`}>
          <span className={styles.statLabel}>Proyectos Activos</span>
          <span className={styles.statValue}>{stats.proyectosActivos}</span>
        </div>
        <div className={`${styles.statCard} glass`}>
          <span className={styles.statLabel}>Ingresos Totales</span>
          <span className={styles.statValue}>₡{stats.ingresosMes.toLocaleString()}</span>
        </div>
        <div className={`${styles.statCard} glass`}>
          <span className={styles.statLabel}>Pendientes de Firma</span>
          <span className={styles.statValue}>{stats.pendientesFirma}</span>
        </div>
        <div className={`${styles.statCard} glass`}>
          <span className={styles.statLabel}>Gastos Totales</span>
          <span className={styles.statValue}>₡{stats.gastosMes.toLocaleString()}</span>
        </div>
      </section>

      {/* Content Section */}
      <div className={styles.contentGrid}>
        <section className={`${styles.card} glass`}>
          <h2 className={styles.cardTitle}>Proyectos Recientes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {recientes.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay proyectos recientes.</p>
            ) : recientes.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{p.clientes?.nombre || 'Sin cliente'}</div>
                </div>
                <span style={{ 
                  padding: '0.25rem 0.75rem', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600, 
                  background: p.estado === 'Finalizado' ? 'var(--success)' : (p.estado === 'Pendiente Firma' ? 'var(--warning)' : 'var(--primary)'), 
                  color: 'white' 
                }}>
                  {p.estado}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.card} glass`}>
          <h2 className={styles.cardTitle}>Próximos Vencimientos</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No hay vencimientos críticos detectados.</p>
          </div>
        </section>
      </div>
    </>
  );
}
