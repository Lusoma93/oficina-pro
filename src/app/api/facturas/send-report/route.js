import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import path from 'path';

export async function POST(request) {
  let browser = null;
  try {
    const data = await request.json();
    const { mes, anio, facturas, emails, gpass } = data;

    if (!emails || !gpass) {
      return NextResponse.json({ error: "Faltan correos o la contraseña de aplicación de Gmail." }, { status: 400 });
    }

    if (!facturas || facturas.length === 0) {
      return NextResponse.json({ error: "No hay facturas para enviar." }, { status: 400 });
    }

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const nombreMes = meses[mes];

    let sumSubtotal = 0;
    let sumIva = 0;
    let sumTotal = 0;

    let tableRows = '';
    facturas.forEach(t => {
      const metodo = (t.metodo_pago || "").toLowerCase();
      const isFullBilling = metodo.includes("transferencia") || metodo.includes("sinpe");
      let total = 0;
      if (isFullBilling) {
        total = Number(t.monto);
      } else {
        const montoProyecto = t.proyectos?.costo ? Number(t.proyectos.costo) : Number(t.monto);
        total = montoProyecto === 0 ? 0 : (montoProyecto <= 110000 ? 45000 : montoProyecto * 0.40);
      }
      const subtotal = total / 1.13;
      const iva = total - subtotal;

      sumSubtotal += subtotal;
      sumIva += iva;
      sumTotal += total;

      let numFactura = "N/A";
      if (t.clave_xml && t.clave_xml.startsWith("FACTURADO-MANUAL-")) {
        const val = t.clave_xml.split("-")[2];
        if (val && val.length < 10) {
          numFactura = val;
        } else {
          numFactura = "Pendiente (Manual)";
        }
      } else if (t.clave_xml && t.clave_xml.startsWith("XML-FACEL-")) {
        numFactura = "Pendiente (Manual)";
      } else if (t.clave_xml) {
        const justDigits = t.clave_xml.replace(/\D/g, '');
        if (justDigits.length >= 50 && justDigits.startsWith("506")) {
          // Clave de 50 dígitos de Costa Rica.
          // El consecutivo (20 dígitos) está en las posiciones 22 a 41 (índices 21 a 40).
          // Los últimos 5 dígitos del consecutivo están en los índices 36 a 40.
          numFactura = justDigits.substring(36, 41);
        } else if (justDigits.length === 20) {
          // Si es solo el consecutivo de 20 dígitos
          numFactura = justDigits.slice(-5);
        } else {
          // Formato desconocido, extraer los últimos 5
          numFactura = justDigits.length >= 5 ? justDigits.slice(-5) : (justDigits || t.clave_xml);
        }
      }
      tableRows += `
        <tr>
          <td style="font-size: 11px; color: #6b7280; word-break: break-all; max-width: 150px;">${numFactura}</td>
          <td>${t.clientes?.nombre || "Cliente General"}</td>
          <td>${t.clientes?.cedula || "N/A"}</td>
          <td style="text-align: right;">₡${Math.round(subtotal).toLocaleString()}</td>
          <td style="text-align: right;">₡${Math.round(iva).toLocaleString()}</td>
          <td style="text-align: right;">₡${Math.round(total).toLocaleString()}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #333; }
            h1 { color: #1e3a8a; font-size: 24px; margin-bottom: 5px; }
            h2 { color: #4b5563; font-size: 16px; margin-top: 0; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f3f4f6; color: #374151; font-weight: bold; text-align: left; padding: 12px; border-bottom: 2px solid #d1d5db; }
            td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
            .totals { font-weight: bold; background-color: #f9fafb; }
            .totals td { border-top: 2px solid #9ca3af; border-bottom: none; }
          </style>
        </head>
        <body>
          <h1>Reporte de Facturación</h1>
          <h2>Periodo Contable: ${nombreMes} ${anio}</h2>
          
          <table>
            <thead>
              <tr>
                <th>N° Factura (Clave Facel)</th>
                <th>Nombre del Cliente</th>
                <th>Cédula</th>
                <th style="text-align: right;">Subtotal</th>
                <th style="text-align: right;">IVA (13%)</th>
                <th style="text-align: right;">Total Combinado</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
              <tr class="totals">
                <td colspan="3" style="text-align: right; font-size: 16px;">TOTALES:</td>
                <td style="text-align: right; font-size: 16px;">₡${Math.round(sumSubtotal).toLocaleString()}</td>
                <td style="text-align: right; font-size: 16px;">₡${Math.round(sumIva).toLocaleString()}</td>
                <td style="text-align: right; font-size: 16px; color: #1e3a8a;">₡${Math.round(sumTotal).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top: 40px; font-size: 12px; color: #6b7280; text-align: center;">Generado automáticamente por SGIN PRO - Gestor Catastror</p>
        </body>
      </html>
    `;

    // Initialize Puppeteer
    let executablePath = null;
    if (process.platform === 'win32') {
      executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    }
    browser = await puppeteer.launch({
      executablePath: executablePath,
      headless: true
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });

    await browser.close();
    browser = null;

    // Send email using Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'guitaras93@gmail.com', // Fixed to user's specified email
        pass: gpass
      }
    });

    const mailOptions = {
      from: 'SGIN PRO <guitaras93@gmail.com>',
      to: emails, // comma separated list
      subject: `Reporte de Facturación - ${nombreMes} ${anio}`,
      text: `Adjunto encontrará el reporte de facturación correspondiente al mes de ${nombreMes} ${anio}.`,
      attachments: [
        {
          filename: `Reporte_${nombreMes}_${anio}.pdf`,
          content: Buffer.from(pdfBuffer),
          contentType: 'application/pdf'
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, message: 'Correo enviado con éxito' });

  } catch (error) {
    console.error('Error al enviar el reporte:', error);
    if (browser) await browser.close();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
