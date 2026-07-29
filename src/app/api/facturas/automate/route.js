import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Helper local para mover y renombrar el PDF desde descargas a MEGA
function fileLog(msg) {
  try {
    const logPath = path.join(process.cwd(), 'bot_debug.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    console.log(msg);
  } catch(e) {}
}

async function movePdfToMega(downloadsPath, megaPath, clienteNombre, monto, fecha) {
  const normalizedMega = path.normalize(megaPath);
  const normalizedDownloads = path.normalize(downloadsPath);

  const safeCliente = clienteNombre.trim().replace(/[/\\?%*:|"<>]/g, '-');
  const periodoFolder = path.join(normalizedMega, 'PERIODO 2026');
  
  if (!fs.existsSync(periodoFolder)) {
    fs.mkdirSync(periodoFolder, { recursive: true });
  }

  // Buscar si ya existe una carpeta similar
  const existingFolders = fs.readdirSync(periodoFolder, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
    
  // Normalizar para comparar (quitar espacios, todo minúsculas)
  const normalizeForMatch = (str) => str.toLowerCase().replace(/\s+/g, '');
  const targetMatch = normalizeForMatch(safeCliente);
  
  let finalFolderName = safeCliente;
  for (const folder of existingFolders) {
    if (normalizeForMatch(folder) === targetMatch) {
      finalFolderName = folder; // Usar la existente!
      console.log(`Reutilizando carpeta existente en MEGA: ${finalFolderName}`);
      break;
    }
  }

  const targetFolder = path.join(periodoFolder, finalFolderName);

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Esperar a que el PDF aparezca en la carpeta de descargas (polling de hasta 30 segundos)
  console.log(`Buscando el PDF descargado en: ${normalizedDownloads}...`);
  let mostRecentPdf = null;
  const startTime = Date.now();
  
  while (Date.now() - startTime < 30000) {
    const files = fs.readdirSync(normalizedDownloads);
    const pdfFiles = files
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => {
        const filePath = path.join(normalizedDownloads, f);
        const stats = fs.statSync(filePath);
        return { name: f, path: filePath, mtime: stats.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
      
    if (pdfFiles.length > 0) {
      const candidate = pdfFiles[0];
      // Si el archivo fue modificado recientemente (Ãºltimos 3 minutos)
      if (Date.now() - candidate.mtime < 180000) {
        mostRecentPdf = candidate;
        break;
      }
    }
    // Esperar 1 segundo antes de volver a listar
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (mostRecentPdf) {
    const cleanFecha = fecha ? fecha.replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
    const newName = `Factura_${safeCliente}_${monto || '0'}_${cleanFecha}.pdf`;
    const destPath = path.join(targetFolder, newName);

    try {
      fs.copyFileSync(mostRecentPdf.path, destPath);
    } catch(e) {
      console.log("Error al copiar PDF:", e.message);
    }
    try {
      fs.unlinkSync(mostRecentPdf.path);
    } catch(e) {
      console.log("Advertencia (EBUSY u otro): No se pudo borrar el original:", e.message);
    }
    return {
      actionTaken: `PDF descargado exitosamente y guardado como ${newName}`,
      originalName: mostRecentPdf.name
    };
  }

  throw new Error(`El PDF de la factura no se encontrÃ³ en la carpeta de descargas (${normalizedDownloads}).`);
}

export async function POST(request) {
  let browser = null;
  let page = null;
  try {
    const data = await request.json();
    const { 
      clienteNombre, 
      cedula, 
      telefono, 
      correo,
      metodoPago, 
      isContado,
      proyectoNombre,
      monto, 
      fecha, 
      contrato,
      facelUrl, 
      facelUser, 
      facelPass, 
      megaPath, 
      downloadsPath 
    } = data;

    if (!facelUrl || !facelUser || !facelPass) {
      return NextResponse.json({ error: 'Faltan credenciales o URL de Facel.' }, { status: 400 });
    }

    // ConfiguraciÃ³n de Puppeteer
    browser = await puppeteer.launch({
      headless: false, // false para que puedas ver lo que hace el robot y corregir cualquier error visualmente
      slowMo: 100,     // AÃ±adido para ralentizar las acciones y que funcione como un video en vivo
      defaultViewport: null,
      protocolTimeout: 180000, // Prevenir el error Network.enable timed out
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      ignoreHTTPSErrors: true
    });


    page = await browser.newPage();
    // Interceptar y aceptar CUALQUIER tipo de diÃ¡logo automÃ¡ticamente (alert, confirm, prompt)
    // Si la pÃ¡gina muestra un alert/confirm mientras Puppeteer intenta tomar una foto, se congela
    page.on('dialog', async dialog => {
      const msg = dialog.message();
      console.log(`DiÃ¡logo interceptado [${dialog.type()}]: ${msg}`);
      try {
        if (dialog.type() === 'prompt') {
          await dialog.accept('');
        } else {
          await dialog.accept();
        }
      } catch (e) {
        console.log('Error aceptando diÃ¡logo:', e.message);
      }
    });
    
    // Configurar directorio de descargas al predeterminado del sistema (DownloadsPath)
    const client = await page.target().createCDPSession();
    try {
      await client.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.normalize(downloadsPath),
        eventsEnabled: true
      });
    } catch (e) {
      await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.normalize(downloadsPath)
      });
    }

    console.log(`Navegando a ${facelUrl}...`);
    try {
      await page.goto(facelUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch(e) {
      console.log('Timeout al cargar URL inicial, continuando si el DOM existe:', e.message);
    }

    // PASO 1: LOGIN (Selectores genÃ©ricos, es posible que requieran ajuste)
    console.log('Esperando a que la pÃ¡gina de login termine de renderizar...');
    let loginReady = false;
    for (let i = 0; i < 40; i++) {
      const inputs = await page.$$('input[type="password"]');
      if (inputs.length > 0) {
        loginReady = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    
    if (!loginReady) {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_login_timeout.png') });
      throw new Error("Timeout: El formulario de login nunca apareciÃ³. Â¿Facel estÃ¡ caÃ­do?");
    }

    // Intentaremos buscar inputs genÃ©ricos de usuario y contraseÃ±a
    try {
      const userInputs = await page.$$('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"], input[id*="user"], input[placeholder*="Correo"]');
      if (userInputs.length > 0) {
        await userInputs[userInputs.length - 1].click({ clickCount: 3 });
        await userInputs[userInputs.length - 1].press('Backspace');
        await userInputs[userInputs.length - 1].type(facelUser, { delay: 50 });
      } else {
        const anyInput = await page.$$('input');
        if (anyInput.length > 0) await anyInput[0].type(facelUser);
      }

      const passInputs = await page.$$('input[type="password"]');
      if (passInputs.length > 0) {
        await passInputs[0].click({ clickCount: 3 });
        await passInputs[0].press('Backspace');
        await passInputs[0].type(facelPass, { delay: 50 });
      }

      const btnHandle = await page.evaluateHandle(() => {
        const els = Array.from(document.querySelectorAll('*'));
        let btn = els.find(b => {
          if (b.offsetWidth === 0 || b.offsetHeight === 0) return false;
          // Queremos elementos pequeÃ±os que contengan el texto, no contenedores gigantes
          const text = (b.innerText || b.value || '').trim().toLowerCase();
          if (text === 'acceder al sistema' || text === 'ingresar' || text === 'iniciar sesiÃ³n' || text === 'acceder') {
            return true;
          }
          return false;
        });
        
        if (!btn) {
          btn = els.find(b => {
            if (b.offsetWidth === 0 || b.offsetHeight === 0) return false;
            if (b.children.length > 2) return false; // Evitar divs gigantes
            const text = (b.innerText || b.value || '').toLowerCase();
            return text.includes('acceder') || text.includes('ingresar');
          });
        }
        
        if (btn && btn.disabled) btn.removeAttribute('disabled');
        return btn;
      });

      const isElement = await page.evaluate(el => el instanceof HTMLElement, btnHandle);
      
      if (!isElement) {
        await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_login.png') });
        throw new Error("No se encontrÃ³ un botÃ³n visible de inicio de sesiÃ³n. Revisar debug_login.png");
      }
      
      await btnHandle.click();
      
      // Intentar tambiÃ©n con la tecla Enter por si el clic no se registrÃ³
      if (passInputs.length > 0) {
        await passInputs[0].press('Enter');
      }
      
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.log('Error en login:', e.message);
      throw e;
    }

    // DespuÃ©s del login, Facel hace un reload completo de la pÃ¡gina.
    // Esperar a que la URL cambie y la pÃ¡gina se estabilice.
    await new Promise(r => setTimeout(r, 5000)); // Dar tiempo generoso al reload

    // DespuÃ©s del reload, verificar si seguimos con una pÃ¡gina vÃ¡lida
    // Si la pÃ¡gina se recargÃ³, necesitamos esperar a que el DOM estÃ© listo
    let currentUrl = '';
    try {
      currentUrl = await page.evaluate(() => window.location.href);
      console.log('URL tras login:', currentUrl);
    } catch (e) {
      // La pÃ¡gina se recargÃ³ y perdimos la referencia - esperar un poco mÃ¡s
      console.log('PÃ¡gina perdida tras login, esperando reconexiÃ³n...');
      await new Promise(r => setTimeout(r, 5000));
      try {
        currentUrl = await page.evaluate(() => window.location.href);
      } catch (e2) {
        throw new Error('La pÃ¡gina se perdiÃ³ completamente tras el login');
      }
    }

    // Esperar a que el sidebar con el menÃº aparezca (seÃ±al de que el dashboard cargÃ³)
    let menuEncontrado = false;
    for (let intento = 0; intento < 15; intento++) { // Aumentado a 15 intentos (45 segs)
      try {
        const hayMenu = await page.evaluate(() => {
          return !!document.querySelector('a[title="Facturas"]') ||
            Array.from(document.querySelectorAll('.sidemenu-label')).some(s => s.innerText && s.innerText.trim() === 'Facturas');
        });
        if (hayMenu) {
          menuEncontrado = true;
          break;
        }
      } catch (e) {
        console.log(`Intento ${intento + 1}: pÃ¡gina no lista aÃºn`);
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!menuEncontrado) {
      console.log('El dashboard no cargÃ³ (posible spinner infinito). Forzando recarga de pÃ¡gina...');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('Error recargando:', e.message));
      await new Promise(r => setTimeout(r, 8000));
      
      for (let intento = 0; intento < 5; intento++) {
        try {
          const hayMenu = await page.evaluate(() => {
            return !!document.querySelector('a[title="Facturas"]') ||
              Array.from(document.querySelectorAll('.sidemenu-label')).some(s => s.innerText && s.innerText.trim() === 'Facturas');
          });
          if (hayMenu) {
            menuEncontrado = true;
            break;
          }
        } catch (e) { }
        await new Promise(r => setTimeout(r, 3000));
      }
      
      if (!menuEncontrado) {
        throw new Error('El menÃº lateral nunca apareciÃ³ tras el login, ni siquiera tras recargar. Â¿FallÃ³ el inicio de sesiÃ³n o Facel estÃ¡ caÃ­do?');
      }
    }

    await new Promise(r => setTimeout(r, 2000)); // Extra para hidrataciÃ³n de Vue
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step1_login.png') });
      console.log('Captura Paso 1 (Login exitoso) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 1:', e.message);
    }

    // PASO 2: NAVEGAR A FACTURAS
    console.log('Navegando a Facturas...');
    
    let hashActual = await page.evaluate(() => window.location.hash);
    
    if (!hashActual.includes('/facturas')) {
      // Esperar a que el enlace de Facturas se pueble en el DOM
      let facturasLinkHandle = null;
      let isLink = false;
      for (let i = 0; i < 15; i++) {
        facturasLinkHandle = await page.evaluateHandle(() => {
          // OpciÃ³n 1 (Primordial): Buscar por la etiqueta de texto exacta (evita menÃºs mÃ³viles ocultos o links incorrectos)
          let link = Array.from(document.querySelectorAll('.sidemenu-label, a, span')).find(el => {
            if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
            const rect = el.getBoundingClientRect();
            if (rect.left < 0 || rect.top < 0) return false; // Ignorar menÃºs off-screen
            
            const text = (el.innerText || '').trim().toLowerCase();
            return text === 'facturas' || text === 'ir al listado de facturas';
          });
          if (link && link.tagName !== 'A') {
            link = link.closest('a') || link;
          }
          if (link) return link;

          // OpciÃ³n 2: Buscar por href exacto
          const linksByHref = Array.from(document.querySelectorAll('a')).filter(a => a.href && (a.href.endsWith('#/facturas') || a.href.includes('#/facturas?')));
          for (const a of linksByHref) {
            if (a.offsetWidth > 0 && a.offsetHeight > 0) {
              const rect = a.getBoundingClientRect();
              if (rect.left >= 0 && rect.top >= 0) return a;
            }
          }
          
          return null;
        });
        
        isLink = await page.evaluate(el => el instanceof HTMLElement, facturasLinkHandle);
        if (isLink) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      if (isLink) {
        console.log('Haciendo click en el enlace de Facturas via Puppeteer (nativo)...');
        try {
          // Asignar un atributo temporal para que Puppeteer lo encuentre fÃ¡cilmente
          await page.evaluate(el => el.setAttribute('data-puppeteer-nav-facturas', 'true'), facturasLinkHandle);
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
            page.click('[data-puppeteer-nav-facturas="true"]')
          ]);
        } catch (clickErr) {
          console.log('Click de Puppeteer fallÃ³:', clickErr.message);
        }
        
        await new Promise(r => setTimeout(r, 3000));
        
        hashActual = await page.evaluate(() => window.location.hash);
        if (!hashActual.includes('/facturas')) {
          console.log('Puppeteer click no cambiÃ³ el hash, intentando click JS...');
          await page.evaluate(el => el.click(), facturasLinkHandle);
          await new Promise(r => setTimeout(r, 4000));
        }
      }
      
      hashActual = await page.evaluate(() => window.location.hash);
      if (!hashActual.includes('/facturas')) {
        console.log('NavegaciÃ³n fallÃ³. Forzando navegaciÃ³n directa via hash router...');
        await page.evaluate(() => { window.location.hash = '#/facturas'; });
        await new Promise(r => setTimeout(r, 4000));
        hashActual = await page.evaluate(() => window.location.hash);
      }
      
      if (!hashActual.includes('/facturas')) {
        console.log('Hash router fallÃ³. Haciendo navegaciÃ³n forzada por URL completa...');
        await page.goto('https://facturae.facelcr.com/go.html#/facturas', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
        
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 1000));
          hashActual = await page.evaluate(() => window.location.hash);
          if (hashActual.includes('/facturas')) break;
        }
      }
      
      if (!hashActual.includes('/facturas')) {
        throw new Error(`No se pudo navegar a Facturas tras 15 segundos de espera. Hash actual: ${hashActual}`);
      }
    }
    
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step2_facturas.png') });
      console.log('Captura Paso 2 (Listado de facturas cargado) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 2:', e.message);
    }
    
    // ESPERAR BOTÃ“N AGREGAR
    let agregarEncontrado = false;
    for (let intento = 0; intento < 15; intento++) { // 15 intentos para dar mÃ¡s tiempo a Facel
      try {
        const hay = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button, a, span, div')).find(el => {
            if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
            const rect = el.getBoundingClientRect();
            if (rect.left < 0 || rect.top < 0) return false; // Ignorar botones off-screen
            const text = (el.innerText || '').trim().toLowerCase();
            
            const isNav = !!el.closest('.main-sidebar') || !!el.closest('#sidebar') || 
                         !!el.closest('.sidemenu') || !!el.closest('.main-header') || 
                         !!el.closest('.navbar');
            if (isNav) return false;
            
            return (text.includes('agregar') || text.includes('nuevo') || text.includes('crear') || text.includes('nueva factura')) && 
                   (el.tagName === 'BUTTON' || el.tagName === 'A' || el.closest('button') || el.closest('a'));
          });
          
          if (btn) {
            let targetBtn = btn;
            if (btn.tagName !== 'BUTTON' && btn.tagName !== 'A' && (btn.closest('button') || btn.closest('a'))) {
              targetBtn = btn.closest('button') || btn.closest('a');
            }
            targetBtn.setAttribute('data-puppeteer-agregar', 'true');
            return true;
          }
          return false;
        });
        
          if (hay) {
            console.log('BotÃ³n Agregar encontrado. Haciendo click JS primero...');
            await page.evaluate(() => {
              const b = document.querySelector('[data-puppeteer-agregar="true"]');
              if (b) b.click();
            });
            
            // Si el click JS falla en algunos entornos Vue, hacer un native click inmediatamente despuÃ©s
            try {
              await page.click('[data-puppeteer-agregar="true"]');
            } catch (e) {
              console.log('Click nativo omitido:', e.message);
            }
            
            await new Promise(r => setTimeout(r, 4000));
            agregarEncontrado = true;
            break;
          }
      } catch (e) { }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    if (!agregarEncontrado) {
      console.log('El botÃ³n Agregar no apareciÃ³ tras varios intentos. Forzando recarga de pÃ¡gina (F5) como fallback...');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('Error recargando:', e.message));
      await new Promise(r => setTimeout(r, 8000)); // Esperar a que renderice tras recarga
      
      // Segundo intento de buscar el botÃ³n
      for (let intento = 0; intento < 5; intento++) {
        try {
          const hay = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button, a, span, div')).find(el => {
              if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
              const rect = el.getBoundingClientRect();
              if (rect.left < 0 || rect.top < 0) return false; // Ignorar botones off-screen
              const text = (el.innerText || '').trim().toLowerCase();
              
              const isNav = !!el.closest('.main-sidebar') || !!el.closest('#sidebar') || 
                           !!el.closest('.sidemenu') || !!el.closest('.main-header') || 
                           !!el.closest('.navbar');
              if (isNav) return false;
              
              return (text.includes('agregar') || text.includes('nuevo') || text.includes('crear') || text.includes('nueva factura')) && 
                     (el.tagName === 'BUTTON' || el.tagName === 'A' || el.closest('button') || el.closest('a'));
            });
            
            if (btn) {
              let targetBtn = btn;
              if (btn.tagName !== 'BUTTON' && btn.tagName !== 'A' && (btn.closest('button') || btn.closest('a'))) {
                targetBtn = btn.closest('button') || btn.closest('a');
              }
              targetBtn.setAttribute('data-puppeteer-agregar', 'true');
              return true;
            }
            return false;
          });
          
          if (hay) {
            console.log('BotÃ³n Agregar encontrado tras recarga. Haciendo click JS primero...');
            await page.evaluate(() => {
              const b = document.querySelector('[data-puppeteer-agregar="true"]');
              if (b) b.click();
            });
            
            try {
              await page.click('[data-puppeteer-agregar="true"]');
            } catch (e) {
              console.log('Click nativo omitido:', e.message);
            }
            
            await new Promise(r => setTimeout(r, 4000));
            agregarEncontrado = true;
            break;
          }
        } catch (e) { }
        await new Promise(r => setTimeout(r, 2000));
      }
      
      if (!agregarEncontrado) {
        throw new Error("No apareciÃ³ el botÃ³n 'Agregar' en la lista de facturas ni siquiera despuÃ©s de recargar la pÃ¡gina.");
      }
    }

    console.log('Clic en botÃ³n Agregar ejecutado.');
    await new Promise(r => setTimeout(r, 2000));
    
    // PASO 3 y 4: IDENTIFICACIÃ“N Y LUPA
    console.log('Esperando a que aparezca la secciÃ³n de cliente...');
    let cedulaClean = cedula ? cedula.replace(/\D/g, '') : '';
    let finalNombre = clienteNombre;
    if (isContado) {
      cedulaClean = '000000000';
      finalNombre = 'CLIENTE CONTADO';
      console.log('Modo Contado Activo: Forzando cÃ©dula 000000000 y nombre CLIENTE CONTADO para Facel.');
    }
    const esJuridica = cedulaClean.length > 9;

    let clientSectionFound = false;
    for (let intento = 0; intento < 10; intento++) {
      try {
        const haySeccion = await page.evaluate(() => {
          return !!document.getElementById('detalleCliente') || !!document.querySelector('input[placeholder="Nombre del Cliente"]');
        });
        if (haySeccion) {
          clientSectionFound = true;
          break;
        }
      } catch (e) { /* cargando */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    if (!clientSectionFound) {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_cedula.png') });
      throw new Error("No se cargÃ³ la secciÃ³n de cliente en el formulario de Nueva Factura");
    }

    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step3_agregar.png') });
      console.log('Captura Paso 3 (Formulario Nueva Factura cargado) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 3:', e.message);
    }

    // Expandir el detalle del cliente si estÃ¡ colapsado (escondido con display: none)
    const expandido = await page.evaluate(() => {
      const el = document.getElementById('detalleCliente');
      return el && el.style.display !== 'none';
    });
    
    if (!expandido) {
      console.log('El detalle del cliente estÃ¡ colapsado. Intentando expandirlo...');
      const expandirBtn = await page.evaluateHandle(() => {
        // OpciÃ³n A: Buscar por tÃ­tulo
        let btn = document.querySelector('a[title*="Mostrar InformaciÃ³n"], button[title*="Mostrar InformaciÃ³n"]');
        if (btn) return btn;
        
        // OpciÃ³n B: Buscar por clase de Ã­cono fa-sort-desc
        const icon = document.querySelector('.fa-sort-desc');
        if (icon) return icon.closest('a') || icon.closest('button') || icon;
        
        return null;
      });
      
      const isExpandirBtn = await page.evaluate(el => el instanceof HTMLElement, expandirBtn);
      if (isExpandirBtn) {
        console.log('Haciendo clic en el botÃ³n de expandir...');
        await page.evaluate(el => el.click(), expandirBtn);
        await new Promise(r => setTimeout(r, 2000)); // Esperar que la animaciÃ³n de Vue se complete
      } else {
        console.log('No se pudo encontrar el botÃ³n para expandir el detalle del cliente.');
      }
    }

    if (!isContado) {
      // Seleccionar el tipo de cÃ©dula en el select (01 para FÃ­sica, 02 para JurÃ­dica)
      console.log(`Seleccionando tipo de cÃ©dula (JurÃ­dica: ${esJuridica})...`);
      await page.evaluate((esJur) => {
        const select = document.querySelector('#detalleCliente select[name="select"]');
        if (select) {
          select.focus();
          select.value = esJur ? '02' : '01';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const selectFallback = document.querySelector('#detalleCliente select');
          if (selectFallback) {
            selectFallback.focus();
            selectFallback.value = esJur ? '02' : '01';
            selectFallback.dispatchEvent(new Event('change', { bubbles: true }));
            selectFallback.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }, esJuridica);
      await new Promise(r => setTimeout(r, 1000));

      // Esperar a que el campo de texto de CÃ©dula estÃ© visible y obtener su handle
      let cedInputHandle = null;
      let formularioAbierto = false;
      for (let intento = 0; intento < 5; intento++) {
        try {
          await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_agregar.png') });
          cedInputHandle = await page.evaluateHandle(() => {
            // OpciÃ³n A: Input con placeholder de identificaciÃ³n
            let input = document.querySelector('#detalleCliente input[placeholder*="identifi"]');
            if (input) return input;
            
            // OpciÃ³n B: Segundo input de texto en el detalle
            const inputs = Array.from(document.querySelectorAll('#detalleCliente input'));
            input = inputs.find(i => i.placeholder && (i.placeholder.toLowerCase().includes('identifi') || i.placeholder.toLowerCase().includes('nÃºmero') || i.placeholder.toLowerCase().includes('numero')));
            if (input) return input;
            
            return inputs.length > 0 ? inputs[inputs.length - 1] : null;
          });
          
          const isCedInput = await page.evaluate(el => el instanceof HTMLElement, cedInputHandle);
          if (isCedInput) {
            formularioAbierto = true;
            break;
          }
        } catch (e) {
          console.log('Fallo al resolver cedInputHandle:', e.message);
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!formularioAbierto) {
        await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_cedula.png') });
        throw new Error("No se pudo enfocar el campo de texto de CÃ©dula de IdentificaciÃ³n");
      }

      // Escribir la cÃ©dula usando JS value setting (mÃ¡s seguro y directo para Vue)
      console.log('Escribiendo la cÃ©dula:', cedulaClean);
      await page.evaluate((el, val) => {
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, cedInputHandle, cedulaClean);
      await new Promise(r => setTimeout(r, 1500));

      // Encontrar el botÃ³n de Lupa para consultar la identificaciÃ³n
      const lupaHandle = await page.evaluateHandle(() => {
        const container = document.getElementById('detalleCliente');
        if (container) {
          // OpciÃ³n A: Buscar por ID btn-facel especÃ­fico del contenedor (si existiera)
          let btn = container.querySelector('#btn-facel');
          if (btn) return btn;
          
          // OpciÃ³n B: BotÃ³n con tÃ­tulo que contenga "Obtener InformaciÃ³n"
          btn = container.querySelector('a[title*="Obtener InformaciÃ³n"], button[title*="Obtener InformaciÃ³n"]');
          if (btn) return btn;
          
          // OpciÃ³n C: Buscar Ã­cono fa-search o fa-search-plus en el contenedor
          const icon = container.querySelector('.fa-search, .fa-search-plus');
          if (icon) return icon.closest('a') || icon.closest('button') || icon;
        }
        
        // Fallbacks a nivel de documento completo si no estÃ¡ en el contenedor
        let btnFallback = document.getElementById('btn-facel');
        if (btnFallback) return btnFallback;
        
        btnFallback = document.querySelector('a[title*="Obtener InformaciÃ³n"], button[title*="Obtener InformaciÃ³n"]');
        if (btnFallback) return btnFallback;
        
        const iconFallback = document.querySelector('.fa-search');
        if (iconFallback) return iconFallback.closest('a') || iconFallback.closest('button') || iconFallback;
        
        return null;
      });

      const isLupaElement = await page.evaluate(el => el instanceof HTMLElement, lupaHandle);
      if (!isLupaElement) {
         throw new Error("No se encontrÃ³ el botÃ³n de Lupa para buscar el cliente");
      }
      
      console.log('Haciendo clic en el botÃ³n Lupa/Buscar...');
      try {
        await page.evaluate(el => el.click(), lupaHandle);
      } catch (e) {
        console.log('JS click en lupa fallÃ³:', e.message);
      }
      try {
        await lupaHandle.click();
      } catch (e) {
        console.log('Puppeteer click en lupa fallÃ³:', e.message);
      }

      await new Promise(r => setTimeout(r, 5000)); // Esperar a que la consulta de la lupa finalice

      // PASO 5: VALIDAR NOMBRE Y CARGARLO MANUALMENTE SI NO SE CARGÃ“
      await page.evaluate((nombre) => {
        const nombreInput = document.querySelector('#detalleCliente input[name="nombre"]') || 
                            document.querySelector('input[name="nombre"]') ||
                            Array.from(document.querySelectorAll('input[type="text"]')).find(i => 
                              (i.name && i.name === 'nombre') || 
                              (i.placeholder && i.placeholder === 'Nombre')
                            );
        if (nombreInput) {
          if (!nombreInput.value || nombreInput.value.trim() === '') {
            nombreInput.value = nombre;
            nombreInput.dispatchEvent(new Event('input', { bubbles: true }));
            nombreInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          throw new Error("No se encontrÃ³ el campo Nombre de Cliente");
        }
      }, finalNombre);
    } else {
      console.log('Modo Contado Activo: Buscando input de nombre y tecleando "CLIENTE CONTADO"...');
      const nombreInputHandle = await page.evaluateHandle(() => {
        // Usar el input con el placeholder "Nombre del Cliente" (el buscador general de clientes de Facel)
        return document.querySelector('input[placeholder="Nombre del Cliente"]') || 
               document.querySelector('input[placeholder*="Nombre"]');
      });
      
      const isNombreElement = await page.evaluate(el => el instanceof HTMLElement, nombreInputHandle);
      if (isNombreElement) {
        await nombreInputHandle.click();
        // Teclear letra por letra para activar los eventos de autocompletado
        await nombreInputHandle.type('CLIENTE CONTADO', { delay: 100 });
        
        console.log('Esperando a que la API de Facel despliegue la lista de clientes...');
        await new Promise(r => setTimeout(r, 4000));
        
        console.log('Presionando ArrowDown y Enter para seleccionar el cliente desde la lista...');
        await page.keyboard.press('ArrowDown');
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Enter');
        
        await new Promise(r => setTimeout(r, 4000)); // Esperar que carguen los datos
      } else {
        throw new Error("No se encontrÃ³ el campo Nombre para CLIENTE CONTADO");
      }
    }

    // PASO 6 y 7: DIRECCIÃ“N, TELÃ‰FONO Y EMAIL
    await page.evaluate((tel, emailVal) => {
      const inputs = document.querySelectorAll('input, textarea');
      
      const dirInput = Array.from(inputs).find(i => {
        const id = (i.id || '').toLowerCase();
        const name = (i.name || '').toLowerCase();
        const placeholder = (i.placeholder || '').toLowerCase();
        return id.includes('direccion') || name.includes('direccion') || placeholder.includes('direcciÃ³n') || placeholder.includes('direccion');
      });
      
      if (dirInput) {
        dirInput.value = 'San Carlos';
        dirInput.dispatchEvent(new Event('input', { bubbles: true }));
        dirInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        throw new Error("No se encontrÃ³ el campo DirecciÃ³n");
      }

      const telInput = Array.from(inputs).find(i => {
        const id = (i.id || '').toLowerCase();
        const name = (i.name || '').toLowerCase();
        const placeholder = (i.placeholder || '').toLowerCase();
        return id.includes('telefono') || id.includes('phone') || id.includes('tel') ||
               name.includes('telefono') || name.includes('phone') || name.includes('tel') ||
               placeholder.includes('telÃ©fono') || placeholder.includes('telefono') || placeholder.includes('phone');
      });
      
      if (telInput) {
        if (tel) {
          telInput.value = tel;
          telInput.dispatchEvent(new Event('input', { bubbles: true }));
          telInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        throw new Error("No se encontrÃ³ el campo TelÃ©fono");
      }

      // Encontrar campo de email y rellenarlo si hay correo
      const emailInput = Array.from(inputs).find(i => {
        const id = (i.id || '').toLowerCase();
        const name = (i.name || '').toLowerCase();
        const placeholder = (i.placeholder || '').toLowerCase();
        return id.includes('email') || id.includes('correo') || name.includes('email') || name.includes('correo') || placeholder.includes('email') || placeholder.includes('correo');
      });
      
      if (emailInput && emailVal) {
        emailInput.value = emailVal;
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, telefono, correo);

    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step4_cliente_llenado.png') });
      console.log('Captura Paso 4 (Detalle de cliente llenado) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 4:', e.message);
    }

    // PASO 8: FORMA DE PAGO
    // Buscamos el select de forma de pago
    await page.evaluate((mpago) => {
      const selects = document.querySelectorAll('select');
      let selectPago = null;
      
      // OpciÃ³n A: ID o name directo
      selectPago = document.getElementById('cbTipoPago') || document.querySelector('select[name="cbTipoPago"]');
      
      // OpciÃ³n B: Buscar select que contenga opciones de pago explÃ­citas
      if (!selectPago) {
        selectPago = Array.from(selects).find(s => {
          const opts = Array.from(s.options).map(o => o.text.toLowerCase());
          return opts.some(t => t.includes('efectivo') || t.includes('transferencia') || t.includes('sinpe') || t.includes('tarjeta'));
        });
      }
      
      if (selectPago) {
        const options = Array.from(selectPago.options);
        const matchedOpt = options.find(o => 
          o.text.toLowerCase().includes((mpago || '').toLowerCase()) || 
          o.text.toLowerCase().includes('transferencia') || 
          o.text.toLowerCase().includes('sinpe') ||
          o.text.toLowerCase().includes('efectivo')
        );
        if (matchedOpt) {
          selectPago.value = matchedOpt.value;
          selectPago.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          console.log("No se encontrÃ³ una opciÃ³n de pago coincidente en el select, dejÃ¡ndolo con su valor por defecto.");
        }
      } else {
        console.log("Advertencia: No se encontrÃ³ el combo box Forma de Pago, omitiendo Paso 8.");
      }
    }, metodoPago);

    // PASO 9: PRODUCTO Y PRECIO
    // Expandir el detalle del producto si estÃ¡ colapsado para que Vue renderice el input de precio e impuesto
    const necesitaExpandirPro = await page.evaluate(() => {
      const priceInput = document.querySelector('input[placeholder*="Precio"], input[name*="precio"], input[placeholder*="Monto Unitario"]');
      return !priceInput;
    });

    if (necesitaExpandirPro) {
      console.log('El detalle del producto estÃ¡ colapsado. Intentando expandirlo...');
      const expandirProBtn = await page.evaluateHandle(() => {
        let btn = document.querySelector('a[title*="Mostrar InformaciÃ³n del Producto"], button[title*="Mostrar InformaciÃ³n del Producto"]');
        if (btn) return btn;
        
        const cleanBtn = document.querySelector('a[title*="Limpiar InformaciÃ³n del Producto"]');
        if (cleanBtn && cleanBtn.parentElement) {
          const btnDefault = cleanBtn.parentElement.querySelector('.fa-sort-desc');
          if (btnDefault) return btnDefault.closest('a') || btnDefault.closest('button');
        }
        return null;
      });
      
      const isExpandirPro = await page.evaluate(el => el instanceof HTMLElement, expandirProBtn);
      if (isExpandirPro) {
        await page.evaluate(el => el.click(), expandirProBtn);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const prodInputHandle = await page.evaluateHandle(() => {
      let input = document.querySelector('#FormFactura input[placeholder*="Producto"], #FormFactura input[name*="producto"]');
      if (!input) {
        const form = document.getElementById('FormFactura');
        if (form) {
          const labels = Array.from(form.querySelectorAll('label, div, span'));
          const pLabel = labels.find(l => l.innerText && l.innerText.trim() === 'Producto');
          if (pLabel) {
            input = pLabel.nextElementSibling?.querySelector('input') || pLabel.parentElement?.querySelector('input');
          }
        }
      }
      return input;
    });

    const isProdInput = await page.evaluate(el => el instanceof HTMLElement, prodInputHandle);
    if (!isProdInput) {
      throw new Error("No se encontrÃ³ el campo de texto Producto principal");
    }

    // LÃ“GICA RESTAURADA DEL 22/06/2026: Escribir nombre y usar la Lupa (Funciona 100%)
    console.log('Escribiendo producto PLANO DE AGRIMENSURA para buscarlo...');
    await prodInputHandle.focus();
    await prodInputHandle.click({ clickCount: 3 }); 
    await page.keyboard.press('Backspace');
    await page.keyboard.type('PLANO DE AGRIMENSURA', { delay: 50 });
    await new Promise(r => setTimeout(r, 1000));

    console.log('Haciendo clic en el botÃ³n de bÃºsqueda/lupa de Producto...');
    await page.evaluate(() => {
        const isVisible = el => el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('.modal') && !el.closest('.dialog');
        const inputs = Array.from(document.querySelectorAll('input')).filter(isVisible);
        const pInput = inputs.find(i => (i.placeholder || '').toLowerCase().includes('producto'));
        if (pInput && pInput.parentElement) {
            const btn = pInput.parentElement.querySelector('button, a, .fa-search') || pInput.parentElement.nextElementSibling?.querySelector('button, a, .fa-search');
            if (btn) {
                const clickable = btn.closest('button') || btn.closest('a') || btn;
                clickable.scrollIntoView({ block: 'center' });
                clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                clickable.click();
            }
        }
    });

    console.log('Esperando a que se abra el modal de BÃºsqueda de Productos...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('Seleccionando el primer producto del modal (PLANO DE AGRIMENSURA)...');
    await page.evaluate(() => {
        const modals = Array.from(document.querySelectorAll('.modal, .dialog, [role="dialog"]'));
        const visibleModal = modals.find(m => m.style.display !== 'none' && m.offsetHeight > 0);
        if (visibleModal) {
            let firstBtn = visibleModal.querySelector('table tbody tr button, table tbody tr a.btn');
            if (firstBtn) {
                firstBtn.scrollIntoView({ block: 'center' });
                firstBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                firstBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                firstBtn.click();
            }
        }
    });
    
    console.log('Esperando que cierre el modal y Vue procese la selecciÃ³n de Producto y Cabys...');
    await new Promise(r => setTimeout(r, 4000));

    // Esperar a que la API de Cabys termine de cargar (puede tardar unos segundos)
    await new Promise(r => setTimeout(r, 4000));

    // ASEGURARNOS DE QUE EL DETALLE DEL PRODUCTO ESTÉ EXPANDIDO
    console.log('Verificando si Facel colapsó el detalle del producto al cerrarse el modal...');
    const necesitaExpandirPro2 = await page.evaluate(() => {
      const isVis = el => el.offsetWidth > 0 && el.offsetHeight > 0;
      const priceInput = Array.from(document.querySelectorAll('input')).find(i => {
         const ph = (i.placeholder || '').toLowerCase();
         const name = (i.name || '').toLowerCase();
         return (ph.includes('precio') || name.includes('precio') || ph.includes('monto unitario'));
      });
      return !priceInput || !isVis(priceInput);
    });

    if (necesitaExpandirPro2) {
      console.log('El detalle del producto se colapsó. Expandiendo de nuevo para poder ver y editar Cabys/Precio...');
      const expandirProBtn = await page.evaluateHandle(() => {
        let btn = document.querySelector('a[title*="Mostrar InformaciÃ³n del Producto"], button[title*="Mostrar InformaciÃ³n del Producto"], a[title*="Mostrar Información del Producto"]');
        if (btn) return btn;
        
        const cleanBtn = document.querySelector('a[title*="Limpiar InformaciÃ³n del Producto"], a[title*="Limpiar Información del Producto"]');
        if (cleanBtn && cleanBtn.parentElement) {
          const btnDefault = cleanBtn.parentElement.querySelector('.fa-sort-desc, .fa-chevron-down');
          if (btnDefault) return btnDefault.closest('a') || btnDefault.closest('button');
        }
        return null;
      });
      
      const isExpandirPro = await page.evaluate(el => el instanceof HTMLElement, expandirProBtn);
      if (isExpandirPro) {
        await page.evaluate(el => el.click(), expandirProBtn);
        await new Promise(r => setTimeout(r, 2000)); // Esperar animación
      }
    }

    // Verificar Cabys (en el video ya aparece cargado, pero si no, usamos fallback modal)
    fileLog('Verificando si el Cabys se autocompletó...');
    const needsCabys = await page.evaluate(async () => {
      const allLabels = Array.from(document.querySelectorAll('label, span, div, p'));
      let cabysInput = null;
      const cabysLabel = allLabels.find(el => el.innerText && el.innerText.trim() === 'Cabys');
      if (cabysLabel) cabysInput = cabysLabel.parentElement.querySelector('input') || cabysLabel.nextElementSibling?.querySelector('input');
      if (!cabysInput) cabysInput = Array.from(document.querySelectorAll('input')).find(i => {
         const ph = (i.placeholder || '').toLowerCase();
         const name = (i.name || '').toLowerCase();
         const id = (i.id || '').toLowerCase();
         return (ph.includes('código') || ph.includes('cabys') || name.includes('cabys') || id.includes('cabys'));
      });
      
      if (!cabysInput) {
        return 'NO_INPUT_ENCONTRADO';
      }
      
      const val = cabysInput.value.trim();
      if (!val || val.includes('Digite el Código') || val === '') {
        return 'VACIO_' + val;
      }
      return 'LLENO_' + val;
    });

    fileLog('Resultado de evaluacion Cabys: ' + needsCabys);

    if (needsCabys.startsWith('NO_INPUT_ENCONTRADO') || needsCabys.startsWith('VACIO_')) {
        fileLog('El Cabys no se autocompletó. Usando el modal como respaldo...');
        fileLog('Abriendo modal de búsqueda de Cabys...');
        await page.evaluate(() => {
          const allLabels = Array.from(document.querySelectorAll('label, span, div, p'));
          let cabysInput = null;
          const cabysLabel = allLabels.find(el => el.innerText && el.innerText.trim() === 'Cabys');
          if (cabysLabel) cabysInput = cabysLabel.parentElement.querySelector('input') || cabysLabel.nextElementSibling?.querySelector('input');
          if (!cabysInput) cabysInput = Array.from(document.querySelectorAll('input')).find(i => {
             const ph = (i.placeholder || '').toLowerCase();
             const name = (i.name || '').toLowerCase();
             const id = (i.id || '').toLowerCase();
             return (ph.includes('código') || ph.includes('cabys') || name.includes('cabys') || id.includes('cabys'));
          });
          
          if (cabysInput) {
            // Buscar ESPECÍFICAMENTE el botón de la lupa (fa-search) para no abrir el Descuento por error
            const parent = cabysInput.closest('.row, .form-group') || cabysInput.parentElement;
            const searchIcon = parent.querySelector('.fa-search');
            if (searchIcon) {
              const btnLupa = searchIcon.closest('button, a');
              if (btnLupa) btnLupa.click();
            }
          }
        });
        
        await new Promise(r => setTimeout(r, 2000)); // Esperar a que abra el modal
        
        // Estamos dentro del modal de Cabys. Buscar el input "Filtro" e inyectar el código
        fileLog('Inyectando el código Cabys en el filtro del modal...');
        const filtroAplicado = await page.evaluate(() => {
          const modals = Array.from(document.querySelectorAll('.modal, .dialog, [role="dialog"]'));
          const visibleModal = modals.reverse().find(m => m.style.display !== 'none' && m.offsetHeight > 0);
          const container = visibleModal || document;
          
          const inputs = Array.from(container.querySelectorAll('input'));
          const filtroInput = inputs.find(i => (i.placeholder || '').toLowerCase().includes('filtro') || (i.placeholder || '').toLowerCase().includes('buscar'));
          
          if (filtroInput) {
            // Inyectar nativamente evadiendo Vue
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(filtroInput, '8342100000000');
            filtroInput.dispatchEvent(new Event('input', { bubbles: true }));
            filtroInput.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        });
        
        if (filtroAplicado) {
          fileLog('Filtro aplicado en modal.');
          await new Promise(r => setTimeout(r, 2500)); // Esperar a que cargue la tabla filtrada (Vue reactivity)
          
          // Click en el botón + del resultado
          fileLog('Seleccionando el resultado Cabys...');
          await page.evaluate(() => {
            const modals = Array.from(document.querySelectorAll('.modal, .dialog, [role="dialog"]'));
            const visibleModal = modals.reverse().find(m => m.style.display !== 'none' && m.offsetHeight > 0);
            const container = visibleModal || document;
            
            // Buscar el botón + (fa-plus) para evitar clicar en otra cosa
            const plusIcon = container.querySelector('table tbody tr .fa-plus');
            if (plusIcon) {
              const plusBtn = plusIcon.closest('button, a');
              if (plusBtn) plusBtn.click();
            } else {
              const firstBtn = container.querySelector('table tbody tr button, table tbody tr a.btn');
              if (firstBtn) firstBtn.click();
            }
          });
          
          await new Promise(r => setTimeout(r, 1500)); // Esperar a ver si cierra el modal
          
          // Cerrar TODOS los modales por si acaso (incluyendo el de Descuento si se abrió por error)
          await page.evaluate(() => {
            const modals = Array.from(document.querySelectorAll('.modal'));
            for (const m of modals) {
              if (m.style.display !== 'none' && m.classList.contains('show')) {
                const cerrarBtns = Array.from(m.querySelectorAll('button')).filter(b => 
                  b.innerText.trim() === 'Cerrar' || b.innerText.trim() === 'Cancelar'
                );
                cerrarBtns.forEach(b => b.click());
                
                // También darle click a la X
                const xBtn = m.querySelector('.close');
                if (xBtn) xBtn.click();
              }
            }
          });
          await new Promise(r => setTimeout(r, 1000));
        } else {
           fileLog('ADVERTENCIA: No se encontró el input de Filtro en el modal de Cabys. Intentando inyección directa.');
           await page.keyboard.press('Escape');
           await new Promise(r => setTimeout(r, 500));
        }

        // TERCER ESTRATEGIA: Si TODO falla, escribimos 8342100000000 directamente en el input usando Puppeteer nativo
        const cabysSigueVacio = await page.evaluate(async () => {
           let cInput = Array.from(document.querySelectorAll('input')).find(i => {
             const ph = (i.placeholder || '').toLowerCase();
             const name = (i.name || '').toLowerCase();
             const id = (i.id || '').toLowerCase();
             return ph.includes('código') || ph.includes('cabys') || name.includes('cabys') || id.includes('cabys');
           });
           if (!cInput) return false;
           if (!cInput.value.trim() || cInput.value.trim().includes('Digite el Código')) {
               cInput.id = "puppeteer-hack-cabys-final";
               return true;
           }
           return false;
        });

        if (cabysSigueVacio) {
           fileLog('USANDO ESTRATEGIA EXTREMA: Escribiendo 8342100000000 directo en el input del Cabys con teclado nativo.');
           await page.focus('#puppeteer-hack-cabys-final');
           await page.keyboard.down('Control');
           await page.keyboard.press('A');
           await page.keyboard.up('Control');
           await page.keyboard.press('Backspace');
           await page.keyboard.type('8342100000000', { delay: 100 });
           await new Promise(r => setTimeout(r, 1000));
           await page.keyboard.press('Enter');
           await new Promise(r => setTimeout(r, 2000));
           
           // Buscar la lupa y darle clic nativamente
           await page.evaluate(() => {
              const cInput = document.getElementById('puppeteer-hack-cabys-final');
              if (cInput) {
                  const parent = cInput.closest('.row, .form-group') || cInput.parentElement;
                  const searchIcon = parent.querySelector('.fa-search');
                  if (searchIcon) {
                    const btnLupa = searchIcon.closest('button, a');
                    if (btnLupa) btnLupa.click();
                  }
              }
           });
           await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    console.log('Estableciendo cantidad a 1...');

    await page.evaluate(() => {
      let cantInput = document.querySelector('[data-testid="document-create-document-input-cantidad"]');
      if (!cantInput) {
        const form = document.getElementById('FormFactura');
        if (form) {
          const inputs = Array.from(form.querySelectorAll('input'));
          cantInput = inputs.find(i => {
            const ph = (i.placeholder || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            const id = (i.id || '').toLowerCase();
            return ph.includes('cantidad') || ph.includes('cant') || name.includes('cantidad') || name.includes('cant') || id.includes('cantidad') || id.includes('cant');
          });
        }
      }
      if (cantInput) {
        cantInput.focus();
        cantInput.value = '1';
        cantInput.dispatchEvent(new Event('input', { bubbles: true }));
        cantInput.dispatchEvent(new Event('change', { bubbles: true }));
        cantInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    });

    // Rellenar el precio (subtotal)
    console.log('Rellenando subtotal despacio número por número...');
    const subtotalStr = (parseFloat(monto) / 1.13).toFixed(2);
    
    const foundPrecio = await page.evaluate(() => {
      let precioInput = document.querySelector('[data-testid="document-create-document-input-precio"]');
      const form = document.getElementById('FormFactura');
      if (!precioInput && form) {
        const allElements = Array.from(form.querySelectorAll('*'));
        const pLabel = allElements.find(el => el.innerText && (el.innerText.includes('Precio') || el.innerText.includes('Monto')));
        if (pLabel) {
          precioInput = pLabel.parentElement?.querySelector('input') || pLabel.nextElementSibling?.querySelector('input');
        }
        
        if (!precioInput) {
          precioInput = Array.from(form.querySelectorAll('input')).find(i => {
            const ph = (i.placeholder || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            const id = (i.id || '').toLowerCase();
            return ph.includes('precio') || ph.includes('price') || ph.includes('unitario') ||
                   name.includes('precio') || name.includes('price') || name.includes('unitario') ||
                   id.includes('precio') || id.includes('price') || id.includes('unitario');
          });
        }
      }

      if (precioInput) {
        precioInput.id = 'puppeteer-hack-precio';
        return true;
      }
      return false;
    });

    if (foundPrecio) {
       await page.focus('#puppeteer-hack-precio');
       await page.keyboard.down('Control');
       await page.keyboard.press('A');
       await page.keyboard.up('Control');
       await page.keyboard.press('Backspace');
       await page.keyboard.type(subtotalStr, { delay: 300 }); // Retraso de 300ms entre cada tecla (muy lento)
       
       await page.evaluate(() => {
          const p = document.getElementById('puppeteer-hack-precio');
          if (p) {
             p.dispatchEvent(new Event('input', { bubbles: true }));
             p.dispatchEvent(new Event('change', { bubbles: true }));
             p.dispatchEvent(new Event('blur', { bubbles: true }));
          }
       });
    } else {
       throw new Error("No se encontró el campo de entrada para el Precio (₡)");
    }

    await new Promise(r => setTimeout(r, 2000));

    // PASO 10: IMPUESTOS
    console.log('Seleccionando impuesto del 13%...');
    const impuestoSeleccionado = await page.evaluate(() => {
      const triggerEvents = (el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      };

      const selects = Array.from(document.querySelectorAll('select'));
      const specificSelect = document.querySelector('[data-testid="document-create-document-select-impuesto"]');
      if (specificSelect && specificSelect.tagName.toLowerCase() === 'select' && !selects.includes(specificSelect)) {
        selects.push(specificSelect);
      }

      let seleccionado = false;

      // Buscar en todos los selects alguna opciÃ³n de IVA o 13%
      for (const s of selects) {
        const options = Array.from(s.options);
        const opt13 = options.find(o => {
          const txt = o.text.toLowerCase();
          // Buscar exactamente la opcion "08 (IVA) tarifa general 13.00%"
          return txt.includes('08') && txt.includes('13');
        });

        if (opt13) {
          s.focus();
          s.value = opt13.value;
          
          const tracker = s._valueTracker;
          if (tracker) tracker.setValue(opt13.value);
          
          triggerEvents(s);
          seleccionado = true;
        }
      }

      // Si el elemento es un dropdown custom (div/input) en vez de select
      if (specificSelect && specificSelect.tagName.toLowerCase() !== 'select' && !seleccionado) {
        specificSelect.scrollIntoView({block: 'center'});
        specificSelect.click();
      }

      return seleccionado;
    });

    await new Promise(r => setTimeout(r, 1000));

    if (!impuestoSeleccionado) {
      // Si se abriÃ³ un popup/dropdown custom, clickear el 13%
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('li, div[role="option"], mat-option, span.option, a.dropdown-item'));
        const opt13 = candidates.find(o => {
          if (o.children.length > 3) return false;
          if (o.offsetWidth === 0 || o.offsetHeight === 0) return false;
          // Evitar elementos del menu principal o navegaciÃ³n
          if (o.closest('nav, .menu, .sidebar, .navbar, aside')) return false;

          const txt = o.innerText.toLowerCase();
          return txt.includes('13%') || txt.includes('13.0') || txt.includes('13,0') || (txt.includes('valor agregado') && txt.includes('13')) || /\biva\b/.test(txt);
        });
        if (opt13) {
          opt13.scrollIntoView({block: 'center'});
          opt13.click();
        }
      });
    }

    // Hacer clic en algÃºn botÃ³n de "Agregar Impuesto" (cargar o sÃ­mbolo de suma)
    await page.evaluate(() => {
      let parent = document;
      const specificSelect = document.querySelector('[data-testid="document-create-document-select-impuesto"]');
      if (specificSelect) {
         parent = specificSelect.closest('.row, .form-group') || specificSelect.parentElement?.parentElement || document;
      } else {
         const allSelects = Array.from(document.querySelectorAll('select'));
         const taxSelect = allSelects.find(s => {
            return Array.from(s.options).some(o => o.text.toLowerCase().includes('iva 8') || o.text.toLowerCase().includes('13%'));
         });
         if (taxSelect) {
            parent = taxSelect.closest('.row, .form-group') || taxSelect.parentElement?.parentElement || document;
         }
      }
      
      const buttons = Array.from(parent.querySelectorAll('button, a.btn'));
      const addTaxBtn = buttons.find(b => {
        const t = (b.innerText || '').toLowerCase().trim();
        const hasPlus = b.querySelector('.fa-plus, .fa-plus-circle');
        return t === 'cargar' || t === 'agregar impuesto' || t === 'agregar' || t === 'aÃ±adir' || hasPlus;
      });
      if (addTaxBtn) {
        addTaxBtn.scrollIntoView({block: 'center'});
        addTaxBtn.click();
      }
    });

    await new Promise(r => setTimeout(r, 1500));

    // REFUERZO DE PRECIO: Volver a rellenar el precio subtotal despacio en caso de que Facel lo haya borrado al cargar el impuesto
    console.log('Re-inyectando subtotal despacio para prevenir que Facel lo borre al aplicar el impuesto...');
    const foundPrecio2 = await page.evaluate(() => {
      let precioInput = document.querySelector('[data-testid="document-create-document-input-precio"]');
      if (!precioInput) {
        const form = document.getElementById('FormFactura');
        if (form) {
          const allElements = Array.from(form.querySelectorAll('*'));
          const pLabel = allElements.find(el => el.innerText && (el.innerText.includes('Precio') || el.innerText.includes('Monto')));
          if (pLabel) precioInput = pLabel.parentElement?.querySelector('input') || pLabel.nextElementSibling?.querySelector('input');
          if (!precioInput) {
            precioInput = Array.from(form.querySelectorAll('input')).find(i => {
              const ph = (i.placeholder || '').toLowerCase();
              return ph.includes('precio') || ph.includes('unitario');
            });
          }
        }
      }
      if (precioInput) {
         precioInput.id = 'puppeteer-hack-precio-2';
         return true;
      }
      return false;
    });

    if (foundPrecio2) {
       await page.focus('#puppeteer-hack-precio-2');
       await page.keyboard.down('Control');
       await page.keyboard.press('A');
       await page.keyboard.up('Control');
       await page.keyboard.press('Backspace');
       await page.keyboard.type(subtotalStr, { delay: 250 });
       await page.evaluate(() => {
          const p = document.getElementById('puppeteer-hack-precio-2');
          if (p) {
             p.dispatchEvent(new Event('input', { bubbles: true }));
             p.dispatchEvent(new Event('change', { bubbles: true }));
             p.dispatchEvent(new Event('blur', { bubbles: true }));
          }
       });
    }
    
    await new Promise(r => setTimeout(r, 1000));

    // PASO 11: AGREGAR LA LÃNEA
    // Hacer clic en el botÃ³n de "+", "Agregar", o "Agregar LÃ­nea"
    const resultPaso11 = await page.evaluate(() => {
      // Primero intentar con data-testid exacto del botÃ³n "Agregar al detalle"
      const addBtn = document.querySelector('[data-testid="document-create-document-btn-agregar-producto"]');
      if (addBtn) {
        addBtn.scrollIntoView({ block: 'center' });
        addBtn.click();
        return 'html_element_data_testid';
      }
      
      // Fallback SEGURO: buscar botÃ³n con texto "Agregar" que NO estÃ© en el modal de bÃºsqueda
      // IMPORTANTE: NO buscar por title 'agregar producto' ya que eso abre el modal de bÃºsqueda
      const allElements = Array.from(document.querySelectorAll('#FormFactura button, #FormFactura a.btn'));
      const btn = allElements.find(el => {
        // Excluir cualquier elemento que estÃ© dentro del modal de bÃºsqueda de productos
        if (el.closest('.modal')) return false;
        // Excluir el botÃ³n de bÃºsqueda/lupa
        if ((el.title || '').toLowerCase().includes('agregar producto')) return false;
        if ((el.title || '').toLowerCase().includes('buscar')) return false;
        const text = (el.innerText || '').trim().toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        // Solo el botÃ³n que efectivamente dice "Agregar" o tiene fa-plus SIN ser la lupa
        return text === 'agregar' || (className.includes('fa-plus') && !className.includes('fa-plus-circle'));
      });
      if (btn) {
        btn.click();
        return 'html_element_fallback_safe';
      }
      return false;
    });
    await new Promise(r => setTimeout(r, 2500));

    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step5_producto_llenado.png') });
      console.log('Captura Paso 5 (Detalle de producto llenado) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 5:', e.message);
    }

    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step6_agregar_linea.png') });
      console.log('Captura Paso 6 (LÃ­nea agregada) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 6:', e.message);
    }

    // PASO 12: NOTAS/OBSERVACIONES
    await page.evaluate(({contrato, proyectoNombre}) => {
      const textareas = Array.from(document.querySelectorAll('textarea'));
      let notaEncontrada = false;
      const baseText = proyectoNombre || 'CANCELACION DE SERVICIOS PROFESIONALES DE TOPOGRAFIA';
      // Solo poner el numero de contrato, sin la leyenda inicial, tal como pidio el usuario
      const textoDetalle = contrato ? `Contrato numero ${contrato}` : baseText;
      
      for (const t of textareas) {
        const pText = (t.parentElement?.innerText || '') + (t.parentElement?.parentElement?.innerText || '').toLowerCase();
        const placeholder = (t.placeholder || '').toLowerCase();
        const name = (t.name || '').toLowerCase();
        
        // Â¡CRÃTICO! Excluir 'descripciÃ³n' para no sobreescribir la descripciÃ³n del producto, lo que borra el Cabys
        if (pText.includes('descrip') || placeholder.includes('descrip') || name.includes('descrip')) {
          continue; 
        }

        if (pText.includes('nota') || pText.includes('observ') ||
            placeholder.includes('nota') || placeholder.includes('observ') ||
            name.includes('nota') || name.includes('observ')) {
          t.value = textoDetalle;
          t.dispatchEvent(new Event('input', { bubbles: true }));
          t.dispatchEvent(new Event('change', { bubbles: true }));
          t.dispatchEvent(new Event('blur', { bubbles: true }));
          notaEncontrada = true;
        }
      }
      
      // Si no encontrÃ³ por palabra clave, usar el Ãºltimo textarea (que suele ser el de notas globales)
      if (!notaEncontrada && textareas.length > 0) {
        const lastT = textareas[textareas.length - 1];
        lastT.value = textoDetalle;
        lastT.dispatchEvent(new Event('input', { bubbles: true }));
        lastT.dispatchEvent(new Event('change', { bubbles: true }));
        lastT.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, { contrato: contrato || '', proyectoNombre: proyectoNombre || '' });

    await new Promise(r => setTimeout(r, 1000));
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step7_notas_observaciones.png') });
      console.log('Captura Paso 7 (Notas llenadas) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 7:', e.message);
    }

    // PASO 13, 14, 15: REGISTRAR DOCUMENTO Y CONFIRMAR ALERTAS
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step8_antes_registrar.png') });
      console.log('Captura Paso 8 (Antes de registrar) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 8:', e.message);
    }

    const foundRegistrarBtn = await page.evaluate(() => {
      // Buscar en todos los elementos de la pÃ¡gina
      const allElements = Array.from(document.querySelectorAll('*'));
      
      // Filtrar elementos visibles que representen registrar, guardar o facturar
      const candidates = allElements.filter(el => {
        const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
        if (!isVisible) return false;
        
        const tagName = el.tagName.toLowerCase();
        const text = (el.innerText || el.value || '').trim().toLowerCase();
        const title = (el.title || '').trim().toLowerCase();
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        const id = (el.id || '').toLowerCase();
        
        // Palabras clave de registro/guardado
        const matchesText = text.includes('registrar') || 
                            text.includes('guardar') || 
                            text.includes('facturar') || 
                            text.includes('emitir') ||
                            text.includes('procesar') ||
                            text.includes('enviar') ||
                            text.includes('finalizar');
                            
        const matchesTitle = title.includes('registrar') || 
                             title.includes('guardar') || 
                             title.includes('facturar') || 
                             title.includes('emitir') ||
                             title.includes('procesar') ||
                             title.includes('enviar');

        const matchesClassOrId = className.includes('btn-register') || 
                                 className.includes('btn-save') ||
                                 id.includes('registrar') ||
                                 id.includes('btnregistrar') ||
                                 id.includes('btnsave') ||
                                 id.includes('save');
        
        // Excluir elementos que realicen otras acciones
        const isExcludedText = text.includes('limpiar') || text.includes('cancelar') || 
                               text.includes('eliminar') || text.includes('quitar') || 
                               text.includes('agregar') || text.includes('volver') ||
                               text.includes('atras') || text.includes('atrÃ¡s');
                               
        const isExcludedTitle = title.includes('limpiar') || title.includes('cancelar') || 
                                title.includes('eliminar') || title.includes('quitar') || 
                                title.includes('agregar');
                                
        // Excluir elementos que estÃ©n en el menÃº de navegaciÃ³n, cabecera global o barra superior
        const isHeaderElement = !!el.closest('header') || !!el.closest('.header') || 
                                !!el.closest('.main-header') || !!el.closest('.navbar') ||
                                !!el.closest('.sidemenu') || !!el.closest('.menu') || 
                                !!el.closest('.topbar') || !!el.closest('.nav') || 
                                !!el.closest('.sidemenu-list') || !!el.closest('#InvoicesMenu') ||
                                !!el.closest('.AccesoDirectos') || !!el.closest('.accesoDirecto') ||
                                !!el.closest('[id*="AccesoDirecto"]');
        
        // Excluir botones de tipo de documento abreviado en la barra superior (fc, prf, etc.)
        const isSubheaderText = text === 'fc' || text === 'prf' || text === 'tq' || text === 'fo' || text === 'fex' || text === 'rc' ||
                                text.includes('fc =') || text.includes('fc=') || text.includes('prf =') || text.includes('tq =');

        const isInteractive = ['button', 'a', 'span', 'div', 'input'].includes(tagName);
        
        return isInteractive && (matchesText || matchesTitle || matchesClassOrId) && 
               !isExcludedText && !isExcludedTitle && !isHeaderElement && !isSubheaderText;
      });
      
      // PuntuaciÃ³n de idoneidad: preferir BUTTON, INPUT o A
      candidates.sort((a, b) => {
        const score = (el) => {
          let s = 0;
          const tag = el.tagName.toLowerCase();
          const text = (el.innerText || el.value || '').trim().toLowerCase();
          
          if (tag === 'button' || tag === 'input') s += 15;
          if (tag === 'a') s += 10;
          if (el.getAttribute('role') === 'button') s += 5;
          if (typeof el.className === 'string' && el.className.toLowerCase().includes('btn')) s += 5;
          if (text.includes('registrar documento') || text.includes('registrar')) s += 5;
          if (text.includes('guardar') || text.includes('facturar')) s += 3;
          
          // Prioridad absoluta a elementos dentro del formulario de la factura
          if (el.closest('#FormFactura')) s += 50;
          
          return s;
        };
        return score(b) - score(a);
      });
      
      if (candidates.length > 0) {
        const bestMatch = candidates[0];
        // Hacer scroll y preparar para click de Puppeteer
        bestMatch.scrollIntoView({ block: 'center' });
        bestMatch.setAttribute('data-puppeteer-registrar', 'true');
        return true;
      } else {
        return false;
      }
    });
    
    if (foundRegistrarBtn) {
      console.log('Haciendo clic nativo (Puppeteer) en el botÃ³n Registrar...');
      await new Promise(r => setTimeout(r, 1000));
      try {
        await page.click('[data-puppeteer-registrar="true"]');
      } catch (clickErr) {
        console.log('Error en click nativo, usando fallback JS...');
        await page.evaluate(() => {
          const btn = document.querySelector('[data-puppeteer-registrar="true"]');
          if (btn) btn.click();
        });
      }
    } else {
      throw new Error("No se encontrÃ³ el botÃ³n Registrar Documento");
    }
    
    await new Promise(r => setTimeout(r, 2000));
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step9_despues_registrar.png') });
      console.log('Captura Paso 9 (DespuÃ©s de registrar) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 9:', e.message);
    }
    
    // Esperar y hacer clic en cualquier botÃ³n de confirmaciÃ³n/alerta de modal HTML (ej. SweetAlert, Bootstrap Modals, etc.)
    console.log('Esperando diÃ¡logos de confirmaciÃ³n de registro (espera mÃ¡xima 20 segundos)...');
    let successModalClicked = false;

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));

      // Verificar si ya navegÃ³ automÃ¡ticamente al Historial
      const isAlreadyInHistorial = await page.evaluate(() => {
        const titleElement = document.querySelector('h1, h2, h3, .title');
        const titleText = titleElement ? titleElement.innerText : '';
        const hasHistorialText = titleText.includes('Listado') || titleText.includes('Historial') || document.body.innerText.includes('Historial de Documentos Utilizados');
        return hasHistorialText && 
               window.location.hash.includes('/facturas') && 
               !window.location.hash.includes('/registrar') && 
               !window.location.hash.includes('/nuevo');
      });

      if (isAlreadyInHistorial) {
        console.log('Detectado que ya se navegÃ³ automÃ¡ticamente al Historial. Saliendo del bucle de confirmaciÃ³n.');
        break;
      }

      const clickedPrompt = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        
        const confirmBtns = allElements.filter(el => {
          const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
          if (!isVisible) return false;
          
          const tagName = el.tagName.toLowerCase();
          const text = (el.innerText || el.value || '').trim().toLowerCase();
          const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
          const title = (el.title || '').toLowerCase();
          
          // Debe estar dentro de un modal o diÃ¡logo para ser un botÃ³n de confirmaciÃ³n de alerta
          const isInsideModal = !!el.closest('.modal') || 
                                !!el.closest('.modal-content') || 
                                !!el.closest('.modal-dialog') || 
                                !!el.closest('.swal2-container') || 
                                !!el.closest('.swal2-popup') || 
                                !!el.closest('.sweet-alert') || 
                                !!el.closest('[role="dialog"]') ||
                                !!el.closest('.bootbox') ||
                                !!el.closest('.modal-body');
          
          // EXCLUSIÃ“N CRÃTICA: Nunca interactuar con el modal de bÃºsqueda de productos
          // Este modal tiene clase btn-primary pero NO es un diÃ¡logo de confirmaciÃ³n
          const modalContainer = el.closest('.modal, [role="dialog"]');
          const isProductSearchModal = modalContainer && 
            (modalContainer.innerText || '').includes('BÃºsqueda de Productos');
          if (isProductSearchModal) return false;
          
          // TambiÃ©n excluir por data-testid del botÃ³n de agregar producto del modal
          if (el.getAttribute('data-testid') && 
              el.getAttribute('data-testid').includes('seleccion-producto')) return false;
          if (title.includes('agregar producto')) return false;
                                
          // Palabras clave de confirmaciÃ³n/OK
          const isOkText = text === 'aceptar' || text === 'confirmar' || text === 'sÃ­' || text === 'si' || 
                           text === 'ok' || text === 'continuar' || text === 'entendido' || text === 'yes' ||
                           text === 'registrar' || text.includes('aceptar') || text.includes('confirmar');
          // IMPORTANTE: btn-primary solo cuenta si NO es el modal de productos (ya filtrado arriba)
          const isOkClass = className.includes('confirm') || className.includes('swal2-confirm') || 
                            className.includes('swal-button--confirm');
          // Solo usar btn-primary si el texto es claramente de confirmaciÃ³n
          const isBtnPrimaryWithOkText = className.includes('btn-primary') && isOkText;
          
          const isClickableTag = ['button', 'a', 'span', 'div', 'input'].includes(tagName);
          
          const isExcluded = text.includes('cancelar') || text === 'no' || text.includes('cerrar') || 
                             text.includes('limpiar') || text.includes('eliminar');
          
          return isInsideModal && isClickableTag && (isOkText || isOkClass || isBtnPrimaryWithOkText) && !isExcluded;
        });
        
        if (confirmBtns.length > 0) {
          confirmBtns.sort((a, b) => {
            const score = (el) => {
              let s = 0;
              const tag = el.tagName.toLowerCase();
              const text = (el.innerText || '').trim().toLowerCase();
              if (tag === 'button') s += 10;
              if (text === 'aceptar' || text === 'confirmar' || text === 'ok' || text === 'sÃ­' || text === 'registrar') s += 10;
              return s;
            };
            return score(b) - score(a);
          });
          
          const btn = confirmBtns[0];
          btn.scrollIntoView({ block: 'center' });
          btn.setAttribute('data-puppeteer-modal-btn', 'true');
          
          const modalContainer = btn.closest('.modal, .swal2-container, .sweet-alert, [role="dialog"]') || document.body;
          return { found: true, text: modalContainer.innerText.substring(0, 1000) };
        }
        return { found: false };
      });
      
      if (clickedPrompt && clickedPrompt.found) {
        console.log(`TEXTO DEL MODAL DETECTADO:\n${clickedPrompt.text}\n-------------------`);
        // GUARDAR TEXTO DEL MODAL PARA DEPURAR
        const fs = require('fs');
        const path = require('path');
        try {
          fs.writeFileSync(path.join(process.cwd(), 'public', `debug_modal_text_${i + 1}.txt`), clickedPrompt.text, 'utf8');
        } catch (err) {}
        
        try {
          await page.screenshot({ path: path.join(process.cwd(), 'public', `debug_step10_antes_confirmar_${i + 1}.png`) });
          console.log(`Captura Paso 10 (Antes de confirmar ${i + 1}) guardada.`);
        } catch (screenshotErr) {
          console.log('No se pudo tomar la captura de confirmaciÃ³n:', screenshotErr.message);
        }
        
        // Ahora sÃ­, hacer click
        await page.evaluate(() => {
          const btn = document.querySelector('[data-puppeteer-modal-btn="true"]');
          if (btn) {
            btn.click();
            const parent = btn.parentElement;
            if (parent && (parent.tagName.toLowerCase() === 'a' || parent.tagName.toLowerCase() === 'button')) {
              parent.click();
            }
            btn.removeAttribute('data-puppeteer-modal-btn');
          }
        });
        console.log(`ConfirmaciÃ³n HTML nÃºmero ${i + 1} clickeada con Ã©xito.`);
        
        // Si el texto del modal contiene indicios de Ã©xito, marcamos la bandera
        const lowerText = clickedPrompt.text.toLowerCase();
        if (lowerText.includes('exito') || lowerText.includes('Ã©xito') || lowerText.includes('exitosamente') || 
            lowerText.includes('guardado') || lowerText.includes('procesado') || lowerText.includes('correcto') ||
            lowerText.includes('correctamente') || lowerText.includes('documento registrado')) {
          successModalClicked = true;
          console.log('Detectado modal de Ã©xito. Marcaremos successModalClicked = true.');
        }
        
        // Dar tiempo para que el DOM se actualice tras el click
        await new Promise(r => setTimeout(r, 2000));
      } else {
        // Si no se encontrÃ³ ningÃºn modal en esta iteraciÃ³n, pero ya procesamos uno de Ã©xito en una anterior, podemos continuar
        if (successModalClicked) {
          console.log('Ya se procesÃ³ el modal de Ã©xito y no se detectan nuevos modals. Saliendo del bucle.');
          break;
        }
      }
    }

    // PASO 16: DESCARGAR PDF
    console.log('Esperando botÃ³n de descarga del PDF...');
    
    try {
      await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step11_pagina_descarga.png') });
      console.log('Captura Paso 11 (PÃ¡gina de descarga) guardada.');
    } catch (e) {
      console.log('No se pudo tomar la captura Paso 11:', e.message);
    }

    let downloadSuccess = false;
    for (let intento = 0; intento < 5; intento++) {
      // Verificar si nos encontramos en la pÃ¡gina de Historial de Documentos Utilizados
      const isHistorial = await page.evaluate(() => {
        const breadcrumbs = document.querySelector('.breadcrumb, .breadcrumbs, .breadcrumbs-list')?.innerText || '';
        const title = document.querySelector('h1, h2, h3, .title')?.innerText || '';
        const hasHistorialText = breadcrumbs.includes('Historial') || title.includes('Historial') || document.body.innerText.includes('Historial de Documentos Utilizados');
        return hasHistorialText && window.location.hash.includes('/facturas') && !window.location.hash.includes('/registrar') && !window.location.hash.includes('/nuevo');
      });

      if (!isHistorial && intento === 0) {
        console.log('No estamos en el Historial tras registrar. Navegando manualmente a Historial...');
        await page.evaluate(() => {
          window.location.hash = '#/facturas';
        });
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      if (isHistorial) {
        console.log('Detectada pÃ¡gina de Historial. Intentando refrescar y abrir la factura mÃ¡s reciente...');
        
        // 1. Refrescar la lista de facturas haciendo clic en la lupa de fechas
        await page.evaluate(() => {
          const searchBtns = Array.from(document.querySelectorAll('button, a'));
          const dateSearchBtn = searchBtns.find(el => {
            const innerHTML = el.innerHTML.toLowerCase();
            const parentText = (el.parentElement?.innerText || '') + (el.parentElement?.parentElement?.innerText || '');
            return (parentText.includes('Inicio') || parentText.includes('Fin')) && (innerHTML.includes('fa-search') || el.innerText.includes('Buscar'));
          });
          if (dateSearchBtn) {
            dateSearchBtn.click();
          } else {
            const fallbackSearch = document.querySelector('.fa-search')?.closest('button') || document.querySelector('.fa-search')?.closest('a');
            if (fallbackSearch) fallbackSearch.click();
          }
        });
        await new Promise(r => setTimeout(r, 4000)); // Esperar a que recargue la lista
        
        try {
          await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step11_historial_refrescado.png') });
          console.log('Captura Paso 11 (Historial refrescado) guardada.');
        } catch (e) {
          console.log('No se pudo tomar la captura del historial refrescado:', e.message);
        }

        // 2. Hacer clic en la primera fila de la tabla para abrir los detalles de la factura
        const clickedRow = await page.evaluate(() => {
          const row = document.querySelector('table tbody tr, .table tbody tr, tbody tr');
          if (row) {
            const eyeBtn = row.querySelector('.fa-eye, .fa-file-text')?.closest('button') || 
                           row.querySelector('.fa-eye, .fa-file-text')?.closest('a');
            if (eyeBtn) {
              eyeBtn.click();
            } else {
              row.click();
            }
            return true;
          }
          return false;
        });

        if (clickedRow) {
          console.log('Se hizo clic en la factura mÃ¡s reciente para abrir el detalle.');
          await new Promise(r => setTimeout(r, 5000)); // Esperar que cargue el detalle de la factura
          try {
            await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step11_factura_abierta.png') });
            console.log('Captura Paso 11 (Factura abierta) guardada.');
          } catch (e) {
            console.log('No se pudo tomar la captura de la factura abierta:', e.message);
          }
        } else {
          console.log('No se encontrÃ³ ninguna fila en el historial de facturas.');
        }
      }

      // 3. Buscar el botÃ³n de descarga del PDF en la pÃ¡gina actual
      
      // Tomar captura antes de hacer click en PDF para ver si estÃ¡ el botÃ³n
      try {
        await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step12_antes_click_pdf.png') });
        console.log('Captura Paso 12 (Antes de hacer click en PDF) guardada.');
      } catch (e) {
        console.log('No se pudo tomar la captura Paso 12:', e.message);
      }

      // Guardar el HTML de la pÃ¡gina de descarga para depurar
      try {
        const htmlContent = await page.content();
        fs.writeFileSync(path.join(process.cwd(), 'public', 'debug_html_download.txt'), htmlContent, 'utf8');
        console.log('HTML de la pÃ¡gina de descarga guardado en public/debug_html_download.txt');
      } catch (htmlErr) {
        console.log('No se pudo guardar el HTML de descarga:', htmlErr.message);
      }

      downloadSuccess = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        
        const candidates = allElements.filter(el => {
          const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
          if (!isVisible) return false;
          
          const tagName = el.tagName.toLowerCase();
          const text = (el.innerText || el.value || '').trim().toLowerCase();
          const title = (el.title || '').trim().toLowerCase();
          const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
          const innerHTML = el.innerHTML ? el.innerHTML.toLowerCase() : '';
          
          const matchesText = text.includes('pdf') || text.includes('imprimir') || text.includes('descargar') || 
                              text.includes('download') || text.includes('print') || text.includes('exportar') ||
                              text.includes('enviar') || text.includes('correo') || text.includes('visualizar') ||
                              text.includes('ver');
                              
          const matchesTitle = title.includes('pdf') || title.includes('imprimir') || title.includes('descargar') || 
                               title.includes('download') || title.includes('print') || title.includes('exportar') ||
                               title.includes('enviar') || title.includes('ver');
                               
          const matchesIcon = className.includes('fa-download') || className.includes('fa-print') || 
                              className.includes('fa-file-pdf') || className.includes('fa-file') ||
                              innerHTML.includes('fa-download') || innerHTML.includes('fa-print') || 
                              innerHTML.includes('fa-file-pdf');
                              
          const buttonOrLink = el.closest('button') || el.closest('a');
          const btnText = buttonOrLink ? (buttonOrLink.innerText || '').toLowerCase() : '';
          
          const isExcluded = text.includes('cancelar') || text.includes('limpiar') || text.includes('eliminar') || 
                             text.includes('adquiridos') || text.includes('utilizados') ||
                             btnText.includes('cancelar') || btnText.includes('limpiar') || btnText.includes('eliminar') || 
                             btnText.includes('adquiridos') || btnText.includes('utilizados');
          
          const isInteractive = ['button', 'a', 'span', 'div', 'input', 'i'].includes(tagName);
          
          return isInteractive && (matchesText || matchesTitle || matchesIcon) && !isExcluded;
        });
        
        candidates.sort((a, b) => {
          const score = (el) => {
            let s = 0;
            const tag = el.tagName.toLowerCase();
            const text = (el.innerText || '').trim().toLowerCase();
            
            if (tag === 'button' || tag === 'a') s += 15;
            if (el.getAttribute('role') === 'button') s += 5;
            if (typeof el.className === 'string' && el.className.toLowerCase().includes('btn')) s += 5;
            if (text.includes('descargar pdf') || text.includes('pdf')) s += 5;
            if (text.includes('descargar') || text.includes('imprimir')) s += 3;
            if (text.includes('exportar') || text.includes('visualizar') || text.includes('ver')) s += 2;
            
            return s;
          };
          return score(b) - score(a);
        });
        
        if (candidates.length > 0) {
          const bestMatch = candidates[0];
          bestMatch.scrollIntoView({ block: 'center' });
          
          // Desactivar target="_blank" para forzar la descarga en el mismo hilo/pestaÃ±a
          let targetEl = bestMatch;
          if (targetEl.tagName.toLowerCase() !== 'a') {
            targetEl = bestMatch.closest('a') || bestMatch;
          }
          if (targetEl && targetEl.tagName.toLowerCase() === 'a' && targetEl.getAttribute('target') === '_blank') {
            targetEl.removeAttribute('target');
          }
          bestMatch.setAttribute('data-puppeteer-pdf', 'true');
          return true;
        }
        return false;
      });

      if (downloadSuccess) {
        console.log('BotÃ³n PDF encontrado. Haciendo click nativo (Puppeteer)...');
        try {
          await page.click('[data-puppeteer-pdf="true"]');
        } catch (e) {
          console.log('Fallo click nativo en PDF, usando JS...');
          await page.evaluate(() => {
            const btn = document.querySelector('[data-puppeteer-pdf="true"]');
            if (btn) btn.click();
          });
        }
        console.log('Se clickeÃ³ el botÃ³n de descarga del PDF.');
        console.log('Se clickeÃ³ el botÃ³n de descarga del PDF.');
        await new Promise(r => setTimeout(r, 2000));
        try {
          await page.screenshot({ path: path.join(process.cwd(), 'public', 'debug_step13_despues_click_pdf.png') });
          console.log('Captura Paso 13 (DespuÃ©s de hacer click en PDF) guardada.');
        } catch (e) {
          console.log('No se pudo tomar la captura Paso 13:', e.message);
        }
        break;
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!downloadSuccess) {
      console.log("ADVERTENCIA: No se encontró el botón para descargar/imprimir el PDF.");
      // No lanzamos error para que la API devuelva success, ya que la factura SÍ se creó con éxito.
      // throw new Error("No se encontró el botón para descargar/imprimir el PDF...");
    }
    
    await new Promise(r => setTimeout(r, 5000));

    // PASO 17: ORGANIZAR PDF
    const actionResult = await movePdfToMega(downloadsPath, megaPath, clienteNombre, monto, fecha);

    await browser.close();

    return NextResponse.json({
      success: true,
      message: 'AutomatizaciÃ³n completada',
      actionTaken: actionResult.actionTaken,
      originalName: actionResult.originalName
    });

  } catch (error) {
    console.error('Error en la automatizaciÃ³n:', error);
    if (browser) {
      try {
        const debugPath = path.join(process.cwd(), 'public', 'debug_error.png');
        await page.screenshot({ path: debugPath });
        console.log('Captura de error final guardada en:', debugPath);
      } catch (screenshotErr) {
        console.log('No se pudo tomar la captura final de error:', screenshotErr.message);
      }
      await browser.close();
    }
    return NextResponse.json({ error: `Fallo en el robot: ${error.message} | Captura del error: http://localhost:3000/debug_error.png | Captura antes de registrar: http://localhost:3000/debug_step8_antes_registrar.png` }, { status: 500 });
  }
}

export async function GET() { 
  return NextResponse.json({ message: 'La automatizacion esta encendida. Para crear una factura, por favor usa el boton Agregar en el Panel de Gestor Catastror.' }); 
}
