"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./page.module.css";
import DashboardOverview from "@/components/DashboardOverview";
import Proyectos from "@/components/Proyectos";
import Contabilidad from "@/components/Contabilidad";
import Facturacion from "@/components/Facturacion";
import Clientes from "@/components/Clientes";
import Calendario from "@/components/Calendario";
import Activos from "@/components/Activos";
import Usuarios from "@/components/Usuarios";
import Protocolos from "@/components/Protocolos";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [userRole, setUserRole] = useState("normal");
  const [theme, setTheme] = useState("light");
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLoggedIn = sessionStorage.getItem("isLoggedIn");
      if (isLoggedIn !== "true") {
        router.push('/login');
      } else {
        setUserRole(sessionStorage.getItem("userRole") || "normal");
        setIsChecking(false);
      }

      const savedTheme = localStorage.getItem("theme") || "light";
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  }, [router]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  async function handleLogout() {
    sessionStorage.clear();
    router.push('/login');
  }

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardOverview />;
      case "proyectos":
        return <Proyectos />;
      case "contabilidad":
        return <Contabilidad />;
      case "facturacion":
        return <Facturacion />;
      case "clientes":
        return <Clientes />;
      case "calendario":
        return <Calendario />;
      case "activos":
        return <Activos />;
      case "usuarios":
        return <Usuarios />;
      case "protocolos":
        return <Protocolos />;
      default:
        return <DashboardOverview />;
    }
  };

  if (isChecking) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 600 }}>Verificando credenciales de seguridad...</div>;
  }

  return (
    <div className={styles.dashboard}>
      {/* Mobile Header */}
      <div className={styles.mobileHeader}>
        <div className={styles.logo}>
          <div style={{ width: 24, height: 24, background: 'var(--primary)', borderRadius: 6 }}></div>
          <span style={{ fontSize: '1.2rem' }}>SGIN PRO</span>
        </div>
        <button className={styles.hamburger} onClick={() => setIsSidebarOpen(true)}>
          ☰
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <div 
        className={`${styles.sidebarOverlay} ${isSidebarOpen ? styles.sidebarOverlayOpen : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      {/* Sidebar Navigation */}
      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: 8 }}></div>
          <span>SGIN PRO</span>
        </div>
        
        <nav className={styles.nav}>
          <div 
            className={`${styles.navLink} ${activeTab === 'dashboard' ? styles.active : ''}`}
            onClick={() => handleTabClick('dashboard')}
          >
            📊 Dashboard
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'calendario' ? styles.active : ''}`}
            onClick={() => handleTabClick('calendario')}
          >
            📅 Calendario
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'clientes' ? styles.active : ''}`}
            onClick={() => handleTabClick('clientes')}
          >
            👥 Clientes
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'proyectos' ? styles.active : ''}`}
            onClick={() => handleTabClick('proyectos')}
          >
            🏗️ Proyectos
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'activos' ? styles.active : ''}`}
            onClick={() => handleTabClick('activos')}
          >
            🚜 Activos
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'contabilidad' ? styles.active : ''}`}
            onClick={() => handleTabClick('contabilidad')}
          >
            💰 Contabilidad
          </div>
          <div 
            className={`${styles.navLink} ${activeTab === 'facturacion' ? styles.active : ''}`}
            onClick={() => handleTabClick('facturacion')}
          >
            🧾 Facturación
          </div>
          
          {userRole === 'admin' && (
            <>
              <div 
                className={`${styles.navLink} ${activeTab === 'protocolos' ? styles.active : ''}`}
                onClick={() => handleTabClick('protocolos')}
              >
                📜 Protocolos
              </div>
              <div 
                className={`${styles.navLink} ${activeTab === 'usuarios' ? styles.active : ''}`}
                onClick={() => handleTabClick('usuarios')}
              >
                🔐 Usuarios
              </div>
            </>
          )}
        </nav>
        
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div className={styles.navLink} onClick={toggleTheme} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
            <span>{theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}</span>
          </div>
          <div className={styles.navLink} onClick={handleLogout} style={{ color: 'var(--danger)', cursor: 'pointer', fontWeight: 600 }}>
            🚪 Cerrar Sesión
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={styles.main}>
        {renderContent()}
      </main>
    </div>
  );
}
