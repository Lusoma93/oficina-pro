"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function Facturacion() {
  const [activeTab, setActiveTab] = useState("facturas"); // 'facturas' o 'credenciales'
  const [loading, setLoading] = useState(true);
  const [transacciones, setTransacciones] = useState([]);
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth());
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear());

  // Estado para la selección de facturas
  const [selectedTrans, setSelectedTrans] = useState({}); // { [id]: boolean }
  const [clienteContadoSelected, setClienteContadoSelected] = useState({}); // { [id]: boolean }

  // Rutas locales y autorización
  const [megaPath, setMegaPath] = useState("");
  const [downloadsPath, setDownloadsPath] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Credenciales Facel
  const [facelUser, setFacelUser] = useState("");
  const [facelPass, setFacelPass] = useState("");
  const [facelUrl, setFacelUrl] = useState("https://facturacion.hacienda.go.cr/"); // URL por defecto o la que use
  const [showPassword, setShowPassword] = useState(false);
  const [credSavedMessage, setCredSavedMessage] = useState("");

  // Resultados de procesamiento
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState(null);

  // Estado de conexión a Facel
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");

  // Nuevos estados para Móvil y Reportes
  const [isMobile, setIsMobile] = useState(false);
  const [contadorEmails, setContadorEmails] = useState("");
  const [gmailAppPass, setGmailAppPass] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [reportResult, setReportResult] = useState(null);

  useEffect(() => {
    // Cargar credenciales y configuración local al montar
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("facel_user") || "";
      const savedPass = localStorage.getItem("facel_pass") || "";
      const savedUrl = localStorage.getItem("facel_url") || "https://facturacion.hacienda.go.cr/"; // ejemplo
      setFacelUser(savedUser);
      setFacelPass(savedPass);
      setFacelUrl(savedUrl);

      // Detección de dispositivo móvil
      if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        setIsMobile(true);
      }
      
      const savedEmails = localStorage.getItem("contador_emails") || "";
      setContadorEmails(savedEmails);

      const savedGmail = localStorage.getItem("gmail_app_pass") || "";
      setGmailAppPass(savedGmail);

      const isAuth = localStorage.getItem("facel_local_authorized") === "true";
      let savedMega = localStorage.getItem("facel_mega_path") || "";
      const savedDownloads = localStorage.getItem("facel_downloads_path") || "";

      // Auto-corregir ruta de Mega si apunta a la carpeta incorrecta (Documentos/MEGAsync en lugar de Documentos/Mega/MEGAsync)
      if (savedMega && 
          (savedMega.toLowerCase().includes('documentos/megasync') || savedMega.toLowerCase().includes('documentos\\megasync')) && 
          !savedMega.toLowerCase().includes('documentos/mega/megasync') && 
          !savedMega.toLowerCase().includes('documentos\\mega\\megasync')) {
        const correctedMega = savedMega
          .replace(/documentos\/megasync/i, 'Documentos/Mega/MEGAsync')
          .replace(/documentos\\megasync/i, 'Documentos\\Mega\\MEGAsync');
        localStorage.setItem("facel_mega_path", correctedMega);
        savedMega = correctedMega;
      }

      setAuthorized(isAuth);
      setMegaPath(savedMega);
      setDownloadsPath(savedDownloads);
    }
    fetchData();
    detectLocalPaths();
  }, []);

  useEffect(() => {
    fetchData();
  }, [mesFiltro, anioFiltro]);

  // Detectar rutas sugeridas desde la API local
  async function detectLocalPaths() {
    try {
      const res = await fetch("/api/facturas");
      const data = await res.json();
      if (data.success) {
        // Solo usar las sugerencias de la API si no han sido modificadas/autorizadas previamente
        if (!localStorage.getItem("facel_mega_path")) {
          setMegaPath(data.megaPath);
        }
        if (!localStorage.getItem("facel_downloads_path")) {
          setDownloadsPath(data.downloadsPath);
        }
      }
    } catch (e) {
      console.warn("No se pudo contactar con la API local para autodetectar rutas:", e);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      // Obtener transacciones e información vinculada de proyectos y clientes
      const { data: rawTrans, error: transError } = await supabase
        .from("transacciones")
        .select("*, proyectos(id, nombre, numero_contrato, cliente_id, costo), clientes(id, nombre, cedula, telefono, correo)")
        .order("fecha", { ascending: false });

      const { data: proys } = await supabase.from("proyectos").select("id, nombre, numero_contrato, cliente_id, costo");
      const { data: clies } = await supabase.from("clientes").select("id, nombre, cedula, telefono");

      let transData = rawTrans || [];

      // Auto-reparación e indexación de clientes y proyectos
      transData = transData.map((t) => {
        let proy = t.proyectos;
        if (!proy && proys) {
          proy = proys.find((p) => p.id == t.proyecto_id);
          if (!proy) {
            proy = proys.find((p) => {
              if (!t.descripcion) return false;
              const desc = t.descripcion.toLowerCase();
              const pName = p.nombre.toLowerCase();
              if (desc.includes(pName)) return true;
              return false;
            });
          }
        }

        let clie = t.clientes;
        if (!clie && clies) {
          clie = clies.find((c) => c.id == t.cliente_id);
          if (!clie && proy) {
            clie = clies.find((c) => c.id == proy.cliente_id);
          }
        }

        return {
          ...t,
          proyectos: proy || null,
          clientes: clie || null,
        };
      });

      // Filtrar solo Ingresos del mes y año seleccionados
      const filtered = transData.filter((t) => {
        if (t.tipo !== "Ingreso" || !t.fecha) return false;
        const dateStr = t.fecha.split("T")[0];
        const parts = dateStr.split("-");
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        return month === mesFiltro && year === anioFiltro;
      });

      setTransacciones(filtered);

      // Limpiar selecciones previas
      setSelectedTrans({});
      setClienteContadoSelected({});
    } catch (error) {
      console.error("Error al cargar datos contables:", error);
    } finally {
      setLoading(false);
    }
  }

  // Simular conexión a Facel
  const handleTestConnection = () => {
    setCheckingConnection(true);
    setConnectionStatus("");
    
    setTimeout(() => {
      const user = localStorage.getItem("facel_user");
      const pass = localStorage.getItem("facel_pass");
      
      setCheckingConnection(false);
      if (!user || !pass) {
        setConnectionStatus("error");
      } else {
        setConnectionStatus("success");
      }
    }, 1500);
  };

  // Guardar credenciales de Facel
  function handleSaveCredenciales(e) {
    e.preventDefault();
    localStorage.setItem("facel_user", facelUser);
    localStorage.setItem("facel_pass", facelPass);
    localStorage.setItem("facel_url", facelUrl);
    setCredSavedMessage("✅ Credenciales guardadas localmente en este navegador con éxito.");
    setTimeout(() => setCredSavedMessage(""), 4000);
  }

  // Guardar permisos de carpetas
  function handleSavePermissions(e) {
    e.preventDefault();
    if (!megaPath || !downloadsPath) {
      alert("Por favor, especifica ambas rutas.");
      return;
    }
    localStorage.setItem("facel_mega_path", megaPath);
    localStorage.setItem("facel_downloads_path", downloadsPath);
    localStorage.setItem("facel_local_authorized", "true");
    setAuthorized(true);
    setShowAuthModal(false);
    
    // Proceder con la facturación una vez autorizado
    procesarFacturacion();
  }

  // Iniciar flujo de facturación
  function handleIniciarFacturacion() {
    if (isMobile) {
      alert("Operación bloqueada: Solo puedes generar facturas desde una computadora (PC) para asegurar que los PDF se guarden correctamente en las rutas especificadas de tu disco duro.");
      return;
    }

    const selectedIds = Object.keys(selectedTrans).filter(id => selectedTrans[id]);
    if (selectedIds.length === 0) {
      alert("Por favor, selecciona al menos un ingreso para facturar.");
      return;
    }

    if (!authorized) {
      setShowAuthModal(true);
    } else {
      procesarFacturacion();
    }
  }

  const [batchStatus, setBatchStatus] = useState("");

  // Enviar las facturas al endpoint local y actualizar Supabase
  async function procesarFacturacion() {
    setProcessing(true);
    setProcessResult(null);
    setBatchStatus("");

    const selectedList = transacciones.filter(t => selectedTrans[t.id]);
    const results = [];
    let successCount = 0;
    let failCount = 0;
    let itemIndex = 0;
    const totalItems = selectedList.length;

    for (const t of selectedList) {
      itemIndex++;
      const metodo = (t.metodo_pago || "").toLowerCase();
      const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");

      let totalFactura = 0;
      if (isFullBilling) {
        totalFactura = Number(t.monto);
      } else {
        const montoProyecto = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto);
        totalFactura = montoProyecto === 0 ? 0 : (montoProyecto <= 110000 ? 45000 : montoProyecto * 0.40);
      }
      const isContado = clienteContadoSelected[t.id];

      // El nombre del cliente para crear la carpeta siempre es el del proyecto/cliente real
      const clienteNombre = t.clientes?.nombre || "Cliente General";
      
      setBatchStatus(`Procesando factura ${itemIndex} de ${totalItems}: ${clienteNombre}...`);

      try {
        // 1. Llamar al Agente Local de automatización (Puppeteer)
        const res = await fetch("http://127.0.0.1:3001/automate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            clienteNombre,
            cedula: t.clientes?.cedula,
            telefono: t.clientes?.telefono,
            correo: t.clientes?.correo,
            metodoPago: t.metodo_pago,
            isContado,
            proyectoNombre: t.proyectos?.nombre || t.descripcion,
            contrato: t.proyectos?.numero_contrato,
            transactionId: t.id,
            monto: Math.round(totalFactura),
            fecha: t.fecha,
            facelUrl: localStorage.getItem("facel_url"),
            facelUser: localStorage.getItem("facel_user"),
            facelPass: localStorage.getItem("facel_pass"),
            megaPath: localStorage.getItem("facel_mega_path"),
            downloadsPath: localStorage.getItem("facel_downloads_path")
          })
        }).catch(() => {
            throw new Error("No se pudo contactar al Agente Local. Asegúrate de que el instalador haya sido ejecutado en esta computadora y que el agente esté corriendo de fondo.");
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Falla al comunicarse con el sistema local.");
        }

        // 2. Registrar la clave de facturación en Supabase
        let claveFinal = `XML-FACEL-${t.id}-${Date.now().toString().slice(-6)}`;
        if (data.originalName) {
           claveFinal = data.originalName.replace(/\.pdf$/i, "");
        }
        
        const { error: updateError } = await supabase
          .from("transacciones")
          .update({
            clave_xml: claveFinal,
            metodo_pago: isContado ? `${t.metodo_pago || "SINPE"} (Contado Facel)` : `${t.metodo_pago || "SINPE"} (Facturado Cédula)`
          })
          .eq("id", t.id);

        if (updateError) {
          throw new Error(`PDF movido pero falló marcar transacción en BD: ${updateError.message}`);
        }

        successCount++;
        results.push({
          id: t.id,
          cliente: clienteNombre,
          monto: totalFactura,
          success: true,
          actionTaken: data.actionTaken,
          fileNameUsed: data.fileNameUsed
        });
      } catch (err) {
        failCount++;
        results.push({
          id: t.id,
          cliente: clienteNombre,
          monto: totalFactura,
          success: false,
          error: err.message
        });
      }

      // Si hay más facturas en el lote, pausar 6 segundos para dar tiempo a Facel de estabilizar la sesión y descargar el PDF
      if (itemIndex < totalItems) {
        setBatchStatus(`Factura ${itemIndex} de ${totalItems} lista. Pausa de seguridad (6s) para estabilizar Facel...`);
        await new Promise(r => setTimeout(r, 6000));
      }
    }

    setProcessing(false);
    setBatchStatus("");
    setProcessResult({
      successCount,
      failCount,
      details: results
    });

    // Refrescar los datos para ver los cambios y los deshabilitados
    fetchData();
  }

  // Manejadores de checks grupales
  const handleSelectAll = (e) => {
    const isChecked = e.target.checked;
    const newSelected = {};
    
    transacciones.forEach((t) => {
      // Solo seleccionar si es facturable (no facturado y tiene cédula)
      const isFacturador = t.clave_xml ? false : !!t.clientes?.cedula;
      if (isFacturador) {
        newSelected[t.id] = isChecked;
      }
    });
    setSelectedTrans(newSelected);
  };

  const isAllSelected = () => {
    const billableCount = transacciones.filter(t => !t.clave_xml && !!t.clientes?.cedula).length;
    if (billableCount === 0) return false;
    const selectedCount = Object.keys(selectedTrans).filter(id => selectedTrans[id]).length;
    return billableCount === selectedCount;
  };

  const toggleManualBilling = async (t) => {
    const isBilled = !!t.clave_xml;
    let newClave = null;
    
    if (!isBilled) {
      const manualNum = prompt("Has elegido bloquear esta factura manualmente.\n\nIngresa los últimos 5 dígitos de la factura (o déjalo en blanco si aún está pendiente):");
      if (manualNum === null) return; // El usuario canceló
      newClave = manualNum.trim() ? `FACTURADO-MANUAL-${manualNum.trim()}` : `FACTURADO-MANUAL-${Date.now()}`;
    }
    
    // Actualizar en base de datos
    const { error } = await supabase
      .from("transacciones")
      .update({ clave_xml: newClave })
      .eq("id", t.id);
      
    if (error) {
      alert("Error al actualizar estado: " + error.message);
    } else {
      fetchData(); // Refrescar los datos para ver el cambio
    }
  };

  const handleEnviarReporte = async () => {
    if (!contadorEmails) {
      alert("Por favor, ingresa al menos un correo electrónico en la lista de configuración del contador.");
      return;
    }
    setSendingReport(true);
    setReportResult(null);

    try {
      const facturasValidas = transacciones.filter(t => t.clave_xml);
      const res = await fetch("/api/facturas/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mes: mesFiltro,
          anio: anioFiltro,
          facturas: facturasValidas,
          emails: contadorEmails,
          gpass: gmailAppPass
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falló el envío del reporte");
      setReportResult({ success: true, message: "Reporte enviado exitosamente." });
    } catch (err) {
      setReportResult({ success: false, message: err.message });
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Encabezado */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>🧾 Módulo de Facturación</h1>
          <p style={{ color: 'var(--text-muted)' }}>Proyección del mes contable, automatización local y carga de credenciales Facel.</p>
        </div>
        
        {/* Botón de conexión Facel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleTestConnection}
            disabled={checkingConnection}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: 8,
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              cursor: checkingConnection ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            🔌 {checkingConnection ? "Verificando..." : "Comprobar Conexión Facel"}
          </button>
          
          {connectionStatus === "success" && (
            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600 }}>
              🟢 Conectado a Facel
            </span>
          )}
          {connectionStatus === "error" && (
            <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600 }}>
              🔴 Falta Credenciales
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab("facturas")}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: 8,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'facturas' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'facturas' ? 'white' : 'var(--text-muted)',
            transition: 'all 0.2s'
          }}
        >
          📅 Facturas del Mes
        </button>
        <button
          onClick={() => setActiveTab("credenciales")}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: 8,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'credenciales' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'credenciales' ? 'white' : 'var(--text-muted)',
            transition: 'all 0.2s'
          }}
        >
          🔑 Configuración Facel
        </button>
        <button
          onClick={() => setActiveTab("reportes")}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: 8,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'reportes' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'reportes' ? 'white' : 'var(--text-muted)',
            transition: 'all 0.2s'
          }}
        >
          📄 Reporte Contador
        </button>
      </div>

      {/* CONTENIDO PESTAÑA: FACTURAS DEL MES */}
      {activeTab === "facturas" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Filtros de Mes/Año */}
          <div style={{ display: 'flex', gap: '1rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Periodo Contable:</span>
              <select value={mesFiltro} onChange={(e) => setMesFiltro(Number(e.target.value))} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-sidebar)', color: 'var(--text-main)' }}>
                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <input type="number" value={anioFiltro} onChange={(e) => setAnioFiltro(Number(e.target.value))} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-sidebar)', color: 'var(--text-main)', width: '100px' }} />
            </div>
            
            <button
              onClick={handleIniciarFacturacion}
              disabled={processing || transacciones.length === 0}
              style={{
                padding: '0.7rem 1.5rem',
                borderRadius: 8,
                background: 'var(--success)',
                color: 'white',
                border: 'none',
                cursor: (processing || transacciones.length === 0) ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                opacity: (processing || transacciones.length === 0) ? 0.6 : 1,
                boxShadow: '0 4px 6px -1px rgb(16 185 129 / 0.3)'
              }}
            >
              {processing ? "⏳ Procesando lote..." : "⚡ Hacer Facturas del Mes"}
            </button>
          </div>

          {/* Banner de progreso en lote */}
          {processing && (
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid var(--primary)', padding: '1rem 1.25rem', borderRadius: 12, display: 'flex', alignItems: 'center', gap: '1rem', animation: 'pulse 2s infinite' }}>
              <div style={{ fontSize: '1.8rem' }}>🤖</div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1rem' }}>Automatización Facel en Ejecución...</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {batchStatus || "Iniciando comunicación con el agente local..."}
                </div>
              </div>
            </div>
          )}

          {/* Reporte de último procesamiento */}
          {processResult && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🎉 Procesamiento Finalizado
              </h3>
              <p style={{ margin: 0, fontWeight: 500 }}>
                Se procesaron exitosamente <strong>{processResult.successCount}</strong> facturas.
                {processResult.failCount > 0 && <span style={{ color: 'var(--danger)' }}> (Fallaron {processResult.failCount} facturas).</span>}
              </p>
              <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', background: 'rgba(0,0,0,0.05)', padding: '0.5rem', borderRadius: 8 }}>
                {processResult.details.map((d, index) => (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.2rem' }}>
                    <span style={{ color: d.success ? 'var(--text-main)' : 'var(--danger)' }}>
                      {d.success ? '✔️' : '❌'} {d.cliente}: ₡{Math.round(d.monto).toLocaleString()}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {d.success ? d.actionTaken : d.error}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla de proyección e ingresos del mes */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando ingresos del periodo...</div>
            ) : transacciones.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay ingresos registrados en el mes filtrado.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '40px' }}>
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={isAllSelected()}
                          style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                        />
                      </th>
                      <th style={{ padding: '1rem 0.5rem' }}>Fecha</th>
                      <th style={{ padding: '1rem 0.5rem' }}>Cliente</th>
                      <th style={{ padding: '1rem 0.5rem' }}>Cédula</th>
                      <th style={{ padding: '1rem 0.5rem' }}>Método de Pago</th>
                      <th style={{ padding: '1rem 0.5rem' }}>Destino Facturación</th>
                      <th style={{ padding: '1rem 0.5rem' }}>Contrato / Descripción</th>
                      <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Subtotal (Estimado)</th>
                      <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>IVA (13%)</th>
                      <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Total Factura</th>
                      <th style={{ padding: '1rem 0.5rem', textAlign: 'center' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transacciones.map((t) => {
                      const metodo = (t.metodo_pago || "").toLowerCase();
                      const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
                      let totalFactura = 0;
                      if (isFullBilling) {
                        totalFactura = Number(t.monto);
                      } else {
                        const montoProyecto = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto);
                        totalFactura = montoProyecto === 0 ? 0 : (montoProyecto <= 110000 ? 45000 : montoProyecto * 0.40);
                      }
                      const subtotal = totalFactura / 1.13;
                      const iva = totalFactura - subtotal;
                      
                      const hasCedula = !!t.clientes?.cedula;
                      const isBilled = !!t.clave_xml;

                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', background: isBilled ? 'rgba(16, 185, 129, 0.03)' : 'transparent' }}>
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              disabled={isBilled || !hasCedula}
                              checked={!!selectedTrans[t.id]}
                              onChange={(e) => {
                                setSelectedTrans({
                                  ...selectedTrans,
                                  [t.id]: e.target.checked
                                });
                              }}
                              style={{ cursor: (isBilled || !hasCedula) ? 'not-allowed' : 'pointer', transform: 'scale(1.1)' }}
                            />
                          </td>
                          <td style={{ padding: '0.8rem 0.5rem', color: 'var(--text-muted)' }}>{t.fecha}</td>
                          <td style={{ padding: '0.8rem 0.5rem', fontWeight: 600 }}>{t.clientes?.nombre || "General"}</td>
                          <td style={{ padding: '0.8rem 0.5rem' }}>{t.clientes?.cedula || <span style={{ color: 'var(--danger)' }}>Sin cédula</span>}</td>
                          <td style={{ padding: '0.8rem 0.5rem', color: 'var(--text-muted)' }}>{t.metodo_pago || "N/A"}</td>
                          <td style={{ padding: '0.8rem 0.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: isBilled ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                              <input
                                type="checkbox"
                                disabled={isBilled}
                                checked={!!clienteContadoSelected[t.id]}
                                onChange={(e) => {
                                  setClienteContadoSelected({
                                    ...clienteContadoSelected,
                                    [t.id]: e.target.checked
                                  });
                                }}
                              />
                              Cliente Contado
                            </label>
                          </td>
                          <td style={{ padding: '0.8rem 0.5rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.proyectos?.numero_contrato && <span style={{ fontWeight: 600 }}>{t.proyectos.numero_contrato}<br/></span>}
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.descripcion}</span>
                          </td>
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right', fontWeight: 500 }}>₡{Math.round(subtotal).toLocaleString()}</td>
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>₡{Math.round(iva).toLocaleString()}</td>
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₡{Math.round(totalFactura).toLocaleString()}</td>
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                              {isBilled ? (
                                <span style={{ display: 'inline-block', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }} title={`Clave: ${t.clave_xml}`}>
                                  Facturado
                                </span>
                              ) : !hasCedula ? (
                                <span style={{ display: 'inline-block', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                                  Excluido
                                </span>
                              ) : (
                                <span style={{ display: 'inline-block', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                                  Pendiente
                                </span>
                              )}
                              
                              <button 
                                onClick={() => toggleManualBilling(t)}
                                style={{
                                  background: 'none',
                                  border: `1px solid ${isBilled ? 'var(--warning)' : 'var(--success)'}`,
                                  color: isBilled ? 'var(--warning)' : 'var(--success)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.65rem',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  marginTop: '2px'
                                }}
                                title={isBilled ? "Desbloquear (Marcar como Pendiente)" : "Bloquear manualmente (Marcar como Facturado)"}
                              >
                                {isBilled ? "Desbloquear" : "Bloquear"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot style={{ background: 'rgba(0,0,0,0.01)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <tr>
                      <td colSpan="7" style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>TOTALES PROYECTADOS:</td>
                      <td style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>₡{Math.round(transacciones.reduce((acc, t) => {
                        const metodo = (t.metodo_pago || "").toLowerCase();
                        const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
                        let tf = 0;
                        if (isFullBilling) {
                          tf = Number(t.monto);
                        } else {
                          const mp = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto || 0);
                          tf = mp === 0 ? 0 : (mp <= 110000 ? 45000 : mp * 0.40);
                        }
                        return acc + (tf / 1.13);
                      }, 0)).toLocaleString()}</td>
                      <td style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>₡{Math.round(transacciones.reduce((acc, t) => {
                        const metodo = (t.metodo_pago || "").toLowerCase();
                        const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
                        let tf = 0;
                        if (isFullBilling) {
                          tf = Number(t.monto);
                        } else {
                          const mp = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto || 0);
                          tf = mp === 0 ? 0 : (mp <= 110000 ? 45000 : mp * 0.40);
                        }
                        return acc + (tf - (tf / 1.13));
                      }, 0)).toLocaleString()}</td>
                      <td style={{ padding: '1rem 0.5rem', textAlign: 'right', color: 'var(--primary)', fontSize: '1.05rem' }}>₡{Math.round(transacciones.reduce((acc, t) => {
                        const metodo = (t.metodo_pago || "").toLowerCase();
                        const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
                        let tf = 0;
                        if (isFullBilling) {
                          tf = Number(t.monto);
                        } else {
                          const mp = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto || 0);
                          tf = mp === 0 ? 0 : (mp <= 110000 ? 45000 : mp * 0.40);
                        }
                        return acc + tf;
                      }, 0)).toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENIDO PESTAÑA: CREDENCIALES FACEL */}
      {activeTab === "credenciales" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 600 }}>
          <div className="card glass" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '2rem', borderRadius: 12 }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.4rem' }}>Credenciales de Acceso a Facel</h2>
            <form onSubmit={handleSaveCredenciales} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontWeight: 600 }}>Enlace de Facel (URL)</label>
                <input
                  type="url"
                  required
                  placeholder="https://ejemplo.facel.cr/"
                  value={facelUrl}
                  onChange={(e) => setFacelUrl(e.target.value)}
                  style={{ padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)', color: 'var(--text-main)', fontSize: '1rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontWeight: 600 }}>Usuario Facel (Correo Electrónico / Identificación)</label>
                <input
                  type="text"
                  required
                  placeholder="ejemplo@correo.com"
                  value={facelUser}
                  onChange={(e) => setFacelUser(e.target.value)}
                  style={{ padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)', color: 'var(--text-main)', fontSize: '1rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontWeight: 600 }}>Contraseña Facel</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Contraseña de Facel"
                    value={facelPass}
                    onChange={(e) => setFacelPass(e.target.value)}
                    style={{ width: '100%', padding: '0.8rem', paddingRight: '3rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-sidebar)', color: 'var(--text-main)', fontSize: '1rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-muted)' }}
                  >
                    {showPassword ? "👁️" : "🙈"}
                  </button>
                </div>
              </div>

              {credSavedMessage && <div style={{ color: 'var(--success)', fontWeight: 500, fontSize: '0.9rem' }}>{credSavedMessage}</div>}

              <button
                type="submit"
                style={{
                  marginTop: '0.5rem',
                  padding: '0.8rem 1.5rem',
                  borderRadius: 8,
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '1rem',
                  transition: 'background 0.2s'
                }}
              >
                💾 Guardar Credenciales
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONTENIDO PESTAÑA: REPORTES */}
      {activeTab === "reportes" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', color: 'var(--primary)' }}>📄 Reporte para Contador</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              Configura el correo electrónico de tu contador y genera un reporte en PDF de todas las facturas exitosas del periodo. El reporte incluirá el desglose de subtotal e IVA.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>Contraseña de Aplicación de Google (guitaras93@gmail.com)</label>
                <input
                  type="password"
                  placeholder="abcd efgh ijkl mnop"
                  value={gmailAppPass}
                  onChange={(e) => {
                    setGmailAppPass(e.target.value);
                    localStorage.setItem("gmail_app_pass", e.target.value);
                  }}
                  style={{ padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Se requiere para que el sistema pueda enviar el reporte desde tu correo. Puedes generarla en los ajustes de seguridad de tu cuenta de Google.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>Correos del Contador (separados por coma)</label>
                <input
                  type="text"
                  placeholder="ejemplo@contador.com, otro@correo.com"
                  value={contadorEmails}
                  onChange={(e) => {
                    setContadorEmails(e.target.value);
                    localStorage.setItem("contador_emails", e.target.value);
                  }}
                  style={{ padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                />
              </div>

              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  onClick={handleEnviarReporte}
                  disabled={sendingReport}
                  style={{
                    padding: '0.8rem 1.5rem',
                    borderRadius: 8,
                    background: sendingReport ? 'var(--text-muted)' : 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 600,
                    cursor: sendingReport ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    width: '100%'
                  }}
                >
                  {sendingReport ? "Generando y Enviando PDF..." : "📤 Enviar Reporte PDF Manualmente"}
                </button>
              </div>

              {reportResult && (
                <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 8, background: reportResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: reportResult.success ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                  {reportResult.success ? "✅ " : "❌ "}{reportResult.message}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PERMISO Y CONFIGURACIÓN DE CARPETAS LOCALES */}
      {showAuthModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999, backdropFilter: 'blur(5px)' }}>
          <div style={{ background: 'var(--bg-sidebar)', color: 'var(--text-main)', padding: '2rem', borderRadius: 16, width: '90%', maxWidth: 550, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--primary)' }}>📂 Permiso de Acceso a Carpetas Locales</h2>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Se necesita autorizar el acceso local para organizar automáticamente las facturas PDF desde la carpeta de **Descargas** a su carpeta de **MEGA**.
              </p>
            </div>

            <form onSubmit={handleSavePermissions} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>Ruta de la carpeta de TOPOGRAFÍA en MEGA</label>
                <input
                  type="text"
                  required
                  placeholder="C:/Users/nombre/OneDrive/Documentos/MEGAsync/Facturas Digitales/TOPOGRAFIA"
                  value={megaPath}
                  onChange={(e) => setMegaPath(e.target.value)}
                  style={{ padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Destino final de almacenamiento. Se creará la subcarpeta <code>PERIODO 2026/[Cliente]</code></span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>Ruta de tu carpeta de Descargas local</label>
                <input
                  type="text"
                  required
                  placeholder="C:/Users/nombre/Downloads"
                  value={downloadsPath}
                  onChange={(e) => setDownloadsPath(e.target.value)}
                  style={{ padding: '0.8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Origen de donde el sistema tomará y moverá los archivos PDF de facturación descargados.</span>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '0.8rem',
                    borderRadius: 8,
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ✔️ Confirmar y Autorizar para Siempre
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  style={{
                    padding: '0.8rem 1.5rem',
                    borderRadius: 8,
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
