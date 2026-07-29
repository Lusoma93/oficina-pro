const fs = require('fs');

let code = fs.readFileSync('src/app/api/facturas/automate/route.js', 'utf8');

// 1. Remove GET function and everything after it
const getIndex = code.indexOf('export async function GET()');
if (getIndex !== -1) {
    code = code.substring(0, getIndex);
}

// 2. The last character of this string should be the closing bracket of POST. Let's find it.
code = code.trim();
if (code.endsWith('}')) {
    code = code.substring(0, code.length - 1) + '});';
}

// 3. Add header
const header = `
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

`;

code = code.replace(/import { NextResponse } from 'next\/server';/g, '');
code = code.replace(/import puppeteer from 'puppeteer';/g, "const puppeteer = require('puppeteer');");
code = code.replace(/import fs from 'fs';/g, "const fs = require('fs');");
code = code.replace(/import path from 'path';/g, "const path = require('path');");
code = code.replace(/import os from 'os';/g, "const os = require('os');");

// 4. Open app.post
code = code.replace(/export async function POST\(request\) \{/g, `app.post('/automate', async (req, res) => {
    const request = { json: async () => req.body };
    const NextResponse = { json: (data, opts) => res.status(opts?.status || 200).json(data) };`);

// 5. Keep Chrome visible on screen for real-time monitoring
code = code.replace(/headless: true/g, "headless: false");
code = code.replace(/slowMo: 100/g, "slowMo: 50");

// 6. Fix megaPath to allow env fallback
code = code.replace("megaPath, \n      downloadsPath \n    } = data;", "} = data;\n    let megaPath = data.megaPath || process.env.MEGA_PATH;\n    let downloadsPath = data.downloadsPath || process.env.DOWNLOADS_PATH;");
code = code.replace("!facelUser || !facelPass) {", "!facelUser || !facelPass) {\n      return NextResponse.json({ error: 'Faltan credenciales o URL de Facel.' }, { status: 400 });\n    }\n    if (!megaPath || !downloadsPath) {");

// 6.5 Fix screenshot paths (process.cwd(), 'public' -> __dirname)
code = code.replace(/path\.join\(process\.cwd\(\), 'public',/g, "path.join(__dirname,");

// 7. Add select-folder endpoint
code += `
app.post('/select-folder', (req, res) => {
    try {
        const { exec } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const scriptPath = path.join(process.cwd(), 'selector.ps1');
        const psCode = \`Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Seleccione la carpeta"
$f.ShowNewFolderButton = $true
if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ Write-Output $f.SelectedPath }\`;
        fs.writeFileSync(scriptPath, psCode);
        
        exec('powershell -ExecutionPolicy Bypass -File "' + scriptPath + '"', (error, stdout, stderr) => {
            try { fs.unlinkSync(scriptPath); } catch(e){}
            if (error) {
                return res.json({ error: error.message });
            }
            res.json({ path: stdout.trim() });
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});
`;

// 8. Add Footer
code += `\napp.listen(3001, () => console.log('Agente Local corriendo en puerto 3001. Listo para recibir facturas.'));\n`;

fs.writeFileSync('public/agente/agente_local.js', header + code);
console.log("agente_local.js creado exitosamente.");
