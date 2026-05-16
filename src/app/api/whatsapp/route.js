import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { to, body } = await request.json();

    if (!to || !body) {
      return NextResponse.json({ error: 'Faltan parámetros: "to" y "body" son requeridos.' }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER; // Ej: "whatsapp:+14155238886"

    if (!accountSid || !authToken || !fromPhone) {
      console.warn("Credenciales de Twilio no configuradas en el entorno.");
      // Devolvemos un éxito simulado para que el frontend no se rompa en desarrollo si no hay credenciales
      return NextResponse.json({ success: true, simulated: true, message: "Modo simulado: WhatsApp no enviado porque faltan credenciales." });
    }

    // Asegurar formato internacional para WhatsApp
    let formattedTo = to.replace(/\D/g, ''); // Quitar no-dígitos
    if (formattedTo.length === 8) {
      formattedTo = '506' + formattedTo; // Código de país CR por defecto
    }
    
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      },
      body: new URLSearchParams({
        'To': `whatsapp:+${formattedTo}`,
        'From': fromPhone,
        'Body': body
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.message || 'Error en Twilio' }, { status: response.status });
    }

    return NextResponse.json({ success: true, messageSid: data.sid });

  } catch (error) {
    console.error('Error enviando WhatsApp:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
