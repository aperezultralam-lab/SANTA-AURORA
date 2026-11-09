/**
 * CONFIRMACIONES · POSADA GRUPO ULTRALAM 2026
 * Publicar como «Aplicación web»:
 * Ejecutar como: Yo
 * Quién tiene acceso: Cualquier persona (incluso sin cuenta de Google)
 *
 * Registrar en el archivo de Google Sheets existente, pestaña Posada_Asistencias.
 * No utiliza WhatsApp, SMS, Gmail, ni servicios de mensajería.
 */
const SPREADSHEET_ID = '1Wfs_OGgfajWOhGor9v6vn55Irqdmzhp_8JwFgA1zpOU';
const SHEET_NAME = 'Posada_Asistencias';
const EVENT_ID = 'posada-2026-abierta';
const REGISTRO_ABIERTO = true;

function doGet() {
  return HtmlService.createHtmlOutput(pagina_('Registro de asistencia',
    'El enlace está activo. Abre la invitación para registrar tu respuesta.', '', false))
    .setTitle('Posada 2026 · Registro de asistencia');
}

function doPost(e) {
  try {
    if (!REGISTRO_ABIERTO) throw new Error('El registro está cerrado.');
    const p = (e && e.parameter) || {};
    if (p.website) return salida_('Gracias', 'No es necesario realizar ninguna otra acción.', '', false);
    if (p.consent !== '1') throw new Error('Debes aceptar el aviso de privacidad.');
    const name = String(p.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 3 || name.length > 100 || /^[=+\-@]/.test(name))
      throw new Error('Escribe un nombre válido.');
    const phone = normalizarTelefono_(p.phone);
    if (!phone) throw new Error('Revisa tu número de celular.');
    const attendance = String(p.attendance || '');
    if (attendance !== 'Sí asistiré' && attendance !== 'No asistiré')
      throw new Error('Selecciona una respuesta de asistencia.');

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('Intenta registrar nuevamente tu respuesta.');
    let response;
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) throw new Error('No se encontró la pestaña de asistencias.');
      const now = new Date().toISOString();
      const last = sheet.getLastRow();
      const rows = last > 1 ? sheet.getRange(2, 1, last-1, 7).getDisplayValues() : [];
      let existing = -1;
      for (let i=0;i<rows.length;i++) {
        if (normalizarTelefono_(rows[i][1]) === phone && String(rows[i][6]||'') === EVENT_ID) {
          existing = i; break;
        }
      }
      if (existing >= 0) {
        const row = rows[existing];
        const changed = row[2] !== name || row[3] !== attendance;
        if (changed) {
          const sheetRow = existing + 2;
          sheet.getRange(sheetRow,1).setValue(now);
          sheet.getRange(sheetRow,3,1,2).setValues([[name,attendance]]);
          SpreadsheetApp.flush();
        }
        response = {state: changed ? 'updated' : 'existing', folio: String(row[4] || '')};
      } else {
        const folio = Utilities.getUuid();
        const stamp = huella_(phone+'|'+EVENT_ID+'|'+folio);
        sheet.appendRow([now,phone,name,attendance,folio,stamp,EVENT_ID]);
        SpreadsheetApp.flush();
        response = {state:'created', folio};
      }
    } finally { lock.releaseLock(); }

    const message = response.state === 'created' ? 'Tu respuesta quedó registrada correctamente.'
                  : response.state === 'updated' ? 'Actualizamos tu respuesta. Solo hay un registro por celular.'
                  : 'Ya teníamos registrada tu respuesta. No se generó un registro duplicado.';
    return salida_('¡Gracias por responder!', message,
      response.folio ? 'Folio: '+response.folio : '', true);
  } catch (err) {
    console.error(err);
    const allowed = [
      'El registro está cerrado.',
      'Debes aceptar el aviso de privacidad.',
      'Escribe un nombre válido.',
      'Revisa tu número de celular.',
      'Selecciona una respuesta de asistencia.',
      'Intenta registrar nuevamente tu respuesta.'
    ];
    const message = allowed.indexOf(String(err.message)) !== -1
      ? String(err.message)
      : 'No pudimos completar el registro. Regresa a la invitación e inténtalo de nuevo.';
    return salida_('No se registró la respuesta', message, '', false);
  }
}

function normalizarTelefono_(v) {
  let digits = String(v||'').replace(/\D/g,'');
  if (digits.length === 10) digits = '52' + digits;
  if (digits.length === 13 && digits.indexOf('521') === 0) digits = '52' + digits.slice(3);
  if (digits.length < 11 || digits.length > 15) return '';
  return '+' + digits;
}

function huella_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s,
                                       Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function escapeHtml_(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function salida_(title, message, detail, ok) {
  return HtmlService.createHtmlOutput(pagina_(title,message,detail,ok))
    .setTitle(title+' · Posada 2026');
}

function pagina_(title,message,detail,ok) {
  const accent = ok ? '#243e35' : '#934e29';
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml_(title)}</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f2e7;font-family:system-ui,sans-serif;color:#243e35;padding:24px}.card{max-width:520px;width:100%;background:#fffdf7;border:1px solid #cdb889;padding:42px 28px;text-align:center;box-shadow:0 16px 34px #243e3514}.eyebrow{letter-spacing:3px;font-size:11px;color:#92703c}h1{font:normal 36px Georgia,serif;color:${accent};margin:20px 0}p{font-size:16px;line-height:1.7}.folio{font-size:12px;color:#657063;word-break:break-all;margin-top:18px}.small{font-size:13px;color:#657063;margin-top:30px}
  </style></head><body><main class="card"><p class="eyebrow">GRUPO ULTRALAM · POSADA 2026</p><h1>${escapeHtml_(title)}</h1><p>${escapeHtml_(message)}</p><p class="folio">${escapeHtml_(detail)}</p><p class="small">Puedes cerrar esta pantalla. No enviaremos mensajes de WhatsApp.</p></main></body></html>`;
}
