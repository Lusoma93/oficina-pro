"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function Login() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLoggedIn = sessionStorage.getItem("isLoggedIn");
      if (isLoggedIn === "true") router.push('/');
    }
  }, [router]);

  async function handleAuth(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    
    // Consultar tabla usuarios en Supabase
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('usuario', usuario)
      .eq('password', password)
      .single();

    if (data && !error) {
      sessionStorage.setItem("isLoggedIn", "true");
      sessionStorage.setItem("userRole", data.rol);
      sessionStorage.setItem("userName", data.nombre);
      router.push('/');
    } else {
      setErrorMsg("Credenciales incorrectas o usuario no encontrado.");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', width: '100vw', position: 'fixed', top: 0, left: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '1rem', zIndex: 9999 }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '2.5rem', borderRadius: '24px', background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ width: 56, height: 56, background: '#3b82f6', borderRadius: 16, margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', color: 'white', fontWeight: 800, boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.5)' }}>S</div>
          <h1 style={{ color: 'white', fontSize: '1.75rem', margin: 0, fontWeight: 700, letterSpacing: '-0.025em' }}>SGIN PRO</h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.875rem', marginTop: '0.5rem' }}>Acceso Autorizado Únicamente</p>
        </div>

        {errorMsg && <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.5)' }}>{errorMsg}</div>}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>Usuario</label>
            <input 
              type="text" 
              required 
              value={usuario} 
              onChange={e => setUsuario(e.target.value)} 
              placeholder="Número de Cédula o Usuario"
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.15)', background: 'rgba(0, 0, 0, 0.2)', color: 'white', outline: 'none', transition: 'border-color 0.2s' }} 
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>Contraseña Segura</label>
            <input 
              type="password" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="••••••••"
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.15)', background: 'rgba(0, 0, 0, 0.2)', color: 'white', outline: 'none', transition: 'border-color 0.2s' }} 
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
            />
          </div>
          
          <button type="submit" disabled={loading} style={{ marginTop: '0.5rem', width: '100%', padding: '1rem', borderRadius: '12px', background: '#3b82f6', color: 'white', border: 'none', fontWeight: 600, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)' }}>
            {loading ? 'Cargando...' : 'Ingresar al Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}
