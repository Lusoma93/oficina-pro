import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Obtener el directorio de inicio del usuario
const getHomeDir = () => {
  return os.homedir() || process.env.USERPROFILE || 'C:\\Users\\default';
};

// Buscar carpetas candidatas de MEGA
const findMegaCandidates = (homedir) => {
  const candidates = [
    path.join(homedir, 'OneDrive', 'Documentos', 'Mega', 'MEGAsync', 'Facturas Digitales', 'TOPOGRAFIA'),
    path.join(homedir, 'OneDrive', 'Documentos', 'MEGAsync', 'Facturas Digitales', 'TOPOGRAFIA'),
    path.join(homedir, 'OneDrive', 'Documentos', 'Cloud Drive', 'MEGAsync', 'Facturas Digitales', 'TOPOGRAFIA'),
    path.join(homedir, 'Documents', 'MEGA', 'Mega', 'MEGAsync', 'Facturas Digitales', 'TOPOGRAFIA'),
    path.join(homedir, 'MEGAsync', 'Facturas Digitales', 'TOPOGRAFIA'),
    path.join(homedir, 'MEGA', 'megasync', 'facturas digitales', 'topografia')
  ];

  // Devolver las rutas que realmente existen
  const existing = candidates.filter(c => fs.existsSync(c));
  if (existing.length > 0) {
    return existing[0];
  }
  
  // Si ninguna existe, sugerir la primera como predeterminada
  return candidates[0];
};

// Buscar carpeta de descargas
const getDownloadsDir = (homedir) => {
  const candidates = [
    path.join(homedir, 'Downloads'),
    path.join(homedir, 'OneDrive', 'Downloads'),
    path.join(homedir, 'OneDrive', 'Descargas')
  ];
  const existing = candidates.filter(c => fs.existsSync(c));
  if (existing.length > 0) {
    return existing[0];
  }
  return candidates[0];
};

export async function GET() {
  try {
    const homedir = getHomeDir();
    const megaPath = findMegaCandidates(homedir);
    const downloadsPath = getDownloadsDir(homedir);

    return NextResponse.json({
      success: true,
      megaPath: megaPath.replace(/\\/g, '/'),
      downloadsPath: downloadsPath.replace(/\\/g, '/')
    });
  } catch (error) {
    console.error('Error al detectar rutas locales:', error);
    return NextResponse.json({ error: 'Error al detectar rutas locales' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { clienteNombre, proyectoNombre, transactionId, monto, fecha, megaPath, downloadsPath } = await request.json();

    if (!clienteNombre || !megaPath || !downloadsPath) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos.' }, { status: 400 });
    }

    // Normalizar rutas
    const normalizedMega = path.normalize(megaPath);
    const normalizedDownloads = path.normalize(downloadsPath);

    // Ruta de destino: .../TOPOGRAFIA/PERIODO 2026/Nombre_Cliente
    // Reemplazamos caracteres inválidos en carpetas
    const safeCliente = clienteNombre.trim().replace(/[/\\?%*:|"<>]/g, '-');
    const targetFolder = path.join(normalizedMega, 'PERIODO 2026', safeCliente);

    // Crear la carpeta recursivamente si no existe
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    // Buscar archivos PDF en la carpeta de descargas
    if (!fs.existsSync(normalizedDownloads)) {
      return NextResponse.json({ error: `La carpeta de descargas no existe en la ruta: ${normalizedDownloads}` }, { status: 400 });
    }

    const files = fs.readdirSync(normalizedDownloads);
    const pdfFiles = files
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => {
        const filePath = path.join(normalizedDownloads, f);
        const stats = fs.statSync(filePath);
        return { name: f, path: filePath, mtime: stats.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime); // De más reciente a más antiguo

    let actionTaken = '';
    let fileNameUsed = '';

    if (pdfFiles.length > 0) {
      // Tomamos el PDF más reciente
      const mostRecentPdf = pdfFiles[0];
      
      // Formato del nombre final
      const cleanFecha = fecha ? fecha.replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
      const newName = `Factura_${safeCliente}_${monto || '0'}_${cleanFecha}.pdf`;
      const destPath = path.join(targetFolder, newName);

      // Mover el archivo
      fs.copyFileSync(mostRecentPdf.path, destPath);
      fs.unlinkSync(mostRecentPdf.path);

      actionTaken = 'PDF de factura detectado en Descargas y ordenado en MEGA.';
      fileNameUsed = newName;
    } else {
      // Si no hay PDF en descargas, creamos un archivo simulado para que puedan probar y ver la estructura
      const cleanFecha = fecha ? fecha.replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
      const mockFileName = `Factura_${safeCliente}_${monto || '0'}_${cleanFecha}_SIMULADA.txt`;
      const mockDestPath = path.join(targetFolder, mockFileName);

      const content = `================================================
SIMULACIÓN DE FACTURACIÓN ELECTRÓNICA - SGIN PRO
================================================
Este archivo simula la descarga y traslado del PDF de Facel.

Detalles de la Factura:
- Cliente: ${clienteNombre}
- Proyecto: ${proyectoNombre || 'N/A'}
- Transacción ID: ${transactionId}
- Monto Total: ₡${Number(monto).toLocaleString()}
- Fecha del Ingreso: ${fecha}
- Fecha de Generación: ${new Date().toLocaleString()}

Estado: Pendiente automatización web con Facel.
Aviso: No se encontró ningún PDF en la carpeta de Descargas al momento de procesar.
================================================`;

      fs.writeFileSync(mockDestPath, content, 'utf8');
      actionTaken = 'No se encontró PDF en Descargas. Se generó un archivo de simulación en MEGA para pruebas.';
      fileNameUsed = mockFileName;
    }

    return NextResponse.json({
      success: true,
      message: 'Operación local completada con éxito.',
      actionTaken,
      fileNameUsed,
      targetFolder: targetFolder.replace(/\\/g, '/')
    });

  } catch (error) {
    console.error('Error al procesar archivo local:', error);
    return NextResponse.json({ error: `Error al procesar archivo local: ${error.message}` }, { status: 500 });
  }
}
