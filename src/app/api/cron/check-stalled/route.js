import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    // 1. Validate Cron Secret if configured in Vercel (optional security)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Conectar a Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Obtener Proyectos Activos y Presentaciones
    const { data: allProys, error: proyError } = await supabase
      .from('proyectos')
      .select('id, nombre, created_at, estado, clientes(nombre)');

    if (proyError) throw new Error(proyError.message);

    const ESTADOS_INACTIVOS = ["Finalizado", "Cancelación", "Desestimada"];
    const activeProys = (allProys || []).filter(p => !ESTADOS_INACTIVOS.includes(p.estado));

    const { data: allPres, error: presError } = await supabase
      .from('presentaciones')
      .select('proyecto_id, estado, created_at');

    if (presError) throw new Error(presError.message);

    // 4. Calcular Estancamiento
    const stalled = [];
    const nowTs = Date.now();
    (activeProys || []).forEach(p => {
      const pPres = (allPres || []).filter(pr => pr.proyecto_id === p.id);
      const activePres = pPres.filter(pr => !ESTADOS_INACTIVOS.includes(pr.estado));

      // Si el proyecto tiene trámites y todos sus trámites están en estado inactivo, omitir el proyecto
      if (pPres.length > 0 && activePres.length === 0) {
        return;
      }

      let latestTs = new Date(p.created_at).getTime();
      activePres.forEach(pr => {
        const ts = new Date(pr.created_at).getTime();
        if (ts > latestTs) latestTs = ts;
      });
      
      const diffDays = Math.floor((nowTs - latestTs) / (1000 * 60 * 60 * 24));
      if (diffDays >= 8) {
        stalled.push({ ...p, diasEstancado: diffDays });
      }
    });

    if (stalled.length === 0) {
      return NextResponse.json({ message: 'No hay proyectos estancados. Todo al día.' });
    }

    stalled.sort((a,b) => b.diasEstancado - a.diasEstancado);

    // 5. Enviar Correo de Alerta
    const gpass = process.env.GMAIL_PASS;
    if (!gpass) {
      console.warn("No hay GMAIL_PASS en las variables de entorno. No se enviará el correo.");
      return NextResponse.json({ 
        message: 'Se encontraron proyectos estancados, pero no se pudo enviar el correo por falta de GMAIL_PASS.',
        stalledCount: stalled.length 
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'guitaras93@gmail.com',
        pass: gpass
      }
    });

    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #EF4444;">🚨 Alerta: Proyectos Estancados</h2>
        <p>Hola Walter,</p>
        <p>El sistema ha detectado <strong>${stalled.length} proyecto(s)</strong> que no han tenido avances en su tramitología en los últimos 8 días.</p>
        <p>Es un buen momento para revisarlos y evitar que se queden olvidados:</p>
        <ul style="list-style: none; padding: 0;">
    `;

    stalled.forEach(p => {
      htmlContent += `
          <li style="margin-bottom: 15px; padding: 15px; border-left: 4px solid #EF4444; background-color: #FEF2F2; border-radius: 4px;">
            <div style="font-weight: bold; font-size: 16px;">${p.nombre}</div>
            <div style="font-size: 14px; color: #666;">Cliente: ${p.clientes?.nombre || 'Desconocido'}</div>
            <div style="font-size: 14px; color: #666;">Estado Actual: ${p.estado}</div>
            <div style="font-weight: bold; color: #EF4444; margin-top: 5px;">⏳ ${p.diasEstancado} días sin avances</div>
          </li>
      `;
    });

    htmlContent += `
        </ul>
        <p style="margin-top: 30px; font-size: 12px; color: #999; text-align: center;">
          Este es un mensaje automático de SGIN PRO - Gestor Catastror.
        </p>
      </div>
    `;

    const mailOptions = {
      from: 'SGIN PRO Alertas <guitaras93@gmail.com>',
      to: 'guitaras93@gmail.com',
      subject: `🚨 Tienes ${stalled.length} proyectos atrasados en tramitología`,
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ 
      message: 'Notificación de proyectos estancados enviada por correo exitosamente.',
      stalledCount: stalled.length 
    });

  } catch (error) {
    console.error('Error en cronjob de proyectos estancados:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
