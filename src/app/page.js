"use client";
import { useState } from "react";
import styles from "./page.module.css";
import DashboardOverview from "@/components/DashboardOverview";
import Proyectos from "@/components/Proyectos";
import Contabilidad from "@/components/Contabilidad";
import Clientes from "@/components/Clientes";
import Calendario from "@/components/Calendario";
import Activos from "@/components/Activos";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardOverview />;
      case "proyectos":
        return <Proyectos />;
      case "contabilidad":
        return <Contabilidad />;
      case "clientes":
        return <Clientes />;
      case "calendario":
        return <Calendario />;
      case "activos":
        return <Activos />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className={styles.dashboard}>
      {/* Sidebar Navigation */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: 8 }}></div>
          <span>SGIN PRO</span>
        </div>
        
        <nav className={styles.nav}>
          <div 
            className={`${styles.navLink} ${activeTab === 'dashboard' ? styles.active : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'calendario' ? styles.active : ''}`}
            onClick={() => setActiveTab('calendario')}
          >
            📅 Calendario
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'clientes' ? styles.active : ''}`}
            onClick={() => setActiveTab('clientes')}
          >
            👥 Clientes
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'proyectos' ? styles.active : ''}`}
            onClick={() => setActiveTab('proyectos')}
          >
            🏗️ Proyectos
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'activos' ? styles.active : ''}`}
            onClick={() => setActiveTab('activos')}
          >
            🚜 Activos
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'contabilidad' ? styles.active : ''}`}
            onClick={() => setActiveTab('contabilidad')}
          >
            💰 Contabilidad
          </div>
        </nav>
        
        <div style={{ marginTop: 'auto' }}>
          <div className={styles.navLink}>⚙️ Configuración</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={styles.main}>
        {renderContent()}
      </main>
    </div>
  );
}
