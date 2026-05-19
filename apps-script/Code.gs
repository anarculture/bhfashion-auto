// ============================================================
// BH Fashion — Apps Script: Menú "BH Ads → Desplegar Marcadas"
// ============================================================
// Este script:
//   1. Crea un menú custom en Google Sheets
//   2. Lee filas donde Desplegar=TRUE AND Estado=Pendiente
//   3. Hace POST al webhook n8n con el payload
//   4. Desmarca checkboxes al completar
// ============================================================

// ── CONFIGURACIÓN ──────────────────────────────────────────
// Cambia esta URL al webhook de tu instancia n8n.
// Para local con tunnel:  la URL que te da "n8n start --tunnel"
// Para producción:        https://n8n.gsnline.com/webhook/meta-ads-deploy
const WEBHOOK_URL = 'https://define-devotedly-elaborate.ngrok-free.dev/webhook/meta-ads-deploy';

// ── MENÚ ───────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BH Ads')
    .addItem('Desplegar Marcadas', 'desplegarMarcadas')
    .addSeparator()
    .addItem('Setup: Crear hojas y datos de prueba', 'setupSpreadsheet')
    .addToUi();
}

// ── FUNCIÓN PRINCIPAL ──────────────────────────────────────
function desplegarMarcadas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Deploys');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ No se encontró la hoja "Deploys".\nEjecuta primero: BH Ads → Setup.');
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Buscar índices de columnas por nombre (resiliente al orden)
  const colIndex = {};
  headers.forEach((h, i) => colIndex[h.toString().trim()] = i);

  const required = ['Campaña', 'IG Post URL', 'Presupuesto diario USD',
                     'Fecha inicio', 'Fecha fin', 'Audiencia', 'Placements',
                     'Desplegar', 'Estado'];
  const missing = required.filter(c => colIndex[c] === undefined);
  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert('❌ Columnas faltantes: ' + missing.join(', '));
    return;
  }

  // Filtrar filas donde Desplegar=TRUE AND Estado=Pendiente
  const filasParaDesplegar = [];
  const filasIndices = []; // guardar row index (1-based para Sheets)

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const desplegar = row[colIndex['Desplegar']];
    const estado = row[colIndex['Estado']];

    if (desplegar === true && estado === 'Pendiente') {
      filasParaDesplegar.push({
        campaña:              row[colIndex['Campaña']],
        ig_post_url:          row[colIndex['IG Post URL']],
        presupuesto_diario:   row[colIndex['Presupuesto diario USD']],
        fecha_inicio:         formatDate(row[colIndex['Fecha inicio']]),
        fecha_fin:            formatDate(row[colIndex['Fecha fin']]),
        audiencia:            row[colIndex['Audiencia']],
        placements:           row[colIndex['Placements']] || 'automatic',
        fila_sheets:          i + 1  // referencia para sync de vuelta
      });
      filasIndices.push(i + 1);
    }
  }

  if (filasParaDesplegar.length === 0) {
    SpreadsheetApp.getUi().alert('⚠️ No hay filas con Desplegar=TRUE y Estado=Pendiente.');
    return;
  }

  // POST al webhook n8n
  const payload = {
    spreadsheet_id: ss.getId(),
    filas: filasParaDesplegar,
    timestamp: new Date().toISOString()
  };

  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    Logger.log('POST → ' + WEBHOOK_URL);
    Logger.log('Payload: ' + JSON.stringify(payload, null, 2));

    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const code = response.getResponseCode();
    const body = response.getContentText();

    Logger.log('Response: ' + code + ' — ' + body);

    if (code >= 200 && code < 300) {
      // Éxito → desmarcar checkboxes
      const colDesplegar = colIndex['Desplegar'] + 1; // 1-based para Range
      filasIndices.forEach(rowNum => {
        sheet.getRange(rowNum, colDesplegar).setValue(false);
      });

      SpreadsheetApp.getUi().alert(
        '✅ ' + filasParaDesplegar.length + ' fila(s) enviada(s) al webhook.\n\n' +
        'Response: ' + code + '\n' + body
      );
    } else {
      SpreadsheetApp.getUi().alert(
        '❌ Error del webhook.\n\n' +
        'HTTP ' + code + '\n' + body
      );
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error de conexión:\n\n' + e.message);
    Logger.log('Error: ' + e.message);
  }
}

// ── SETUP AUTOMÁTICO ───────────────────────────────────────
// Crea las 3 hojas con encabezados, validaciones y datos de prueba
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // ── Hoja DEPLOYS ─────────────────────────────────────────
  let deploys = ss.getSheetByName('Deploys');
  if (!deploys) {
    deploys = ss.insertSheet('Deploys');
  }

  const deploysHeaders = [
    'Campaña', 'IG Post URL', 'Presupuesto diario USD',
    'Fecha inicio', 'Fecha fin', 'Audiencia', 'Placements',
    'Desplegar', 'Estado',
    'campaign_id', 'adset_id', 'ad_id', 'error_log', 'desplegado_at'
  ];
  deploys.getRange(1, 1, 1, deploysHeaders.length).setValues([deploysHeaders]);

  // Formato encabezados
  deploys.getRange(1, 1, 1, deploysHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1a73e8')
    .setFontColor('white');

  // Checkbox en columna Desplegar (H), filas 2-100
  const desplegarCol = deploysHeaders.indexOf('Desplegar') + 1;
  deploys.getRange(2, desplegarCol, 99, 1).insertCheckboxes();

  // Dropdown Estado (I), filas 2-100
  const estadoCol = deploysHeaders.indexOf('Estado') + 1;
  const estadoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Borrador', 'Pendiente', 'Desplegando', 'Desplegado', 'Error', 'Finalizado'])
    .setAllowInvalid(false)
    .build();
  deploys.getRange(2, estadoCol, 99, 1).setDataValidation(estadoRule);

  // Columnas read-only (J-N) fondo gris
  deploys.getRange(2, 10, 99, 5).setBackground('#f0f0f0');

  // Auto-resize
  for (let i = 1; i <= deploysHeaders.length; i++) {
    deploys.autoResizeColumn(i);
  }

  // ── Hoja CAMPAÑAS ────────────────────────────────────────
  let campañas = ss.getSheetByName('Campañas');
  if (!campañas) {
    campañas = ss.insertSheet('Campañas');
  }

  const campañasHeaders = ['nombre', 'objective', 'special_ad_categories'];
  campañas.getRange(1, 1, 1, campañasHeaders.length).setValues([campañasHeaders]);

  campañas.getRange(1, 1, 1, campañasHeaders.length)
    .setFontWeight('bold')
    .setBackground('#34a853')
    .setFontColor('white');

  // Dropdown objective
  const objRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT',
      'OUTCOME_AWARENESS', 'OUTCOME_LEADS', 'OUTCOME_APP_PROMOTION'
    ])
    .setAllowInvalid(false)
    .build();
  campañas.getRange(2, 2, 99, 1).setDataValidation(objRule);

  for (let i = 1; i <= campañasHeaders.length; i++) {
    campañas.autoResizeColumn(i);
  }

  // ── Hoja AUDIENCIAS ──────────────────────────────────────
  let audiencias = ss.getSheetByName('Audiencias');
  if (!audiencias) {
    audiencias = ss.insertSheet('Audiencias');
  }

  const audienciasHeaders = ['alias', 'meta_audience_id', 'tipo'];
  audiencias.getRange(1, 1, 1, audienciasHeaders.length).setValues([audienciasHeaders]);

  audiencias.getRange(1, 1, 1, audienciasHeaders.length)
    .setFontWeight('bold')
    .setBackground('#fbbc04')
    .setFontColor('black');

  // Dropdown tipo
  const tipoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['custom', 'lookalike', 'saved'])
    .setAllowInvalid(false)
    .build();
  audiencias.getRange(2, 3, 99, 1).setDataValidation(tipoRule);

  for (let i = 1; i <= audienciasHeaders.length; i++) {
    audiencias.autoResizeColumn(i);
  }

  // ── DATOS DE PRUEBA ──────────────────────────────────────
  campañas.getRange(2, 1, 1, 3).setValues([
    ['Test Echo', 'OUTCOME_SALES', '[]']
  ]);

  audiencias.getRange(2, 1, 1, 3).setValues([
    ['Test Audience', '123456789', 'saved']
  ]);

  deploys.getRange(2, 1, 1, 9).setValues([
    ['Test Echo', 'https://www.instagram.com/p/test123/', 10,
     new Date(2026, 4, 19), new Date(2026, 4, 25),
     'Test Audience', 'automatic', true, 'Pendiente']
  ]);

  // Eliminar hoja default "Hoja 1" / "Sheet1" si existe
  const defaultSheet = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  ui.alert(
    '✅ Setup completo\n\n' +
    '• Hoja Deploys: encabezados + checkboxes + dropdown Estado\n' +
    '• Hoja Campañas: encabezados + dropdown objective\n' +
    '• Hoja Audiencias: encabezados + dropdown tipo\n' +
    '• 1 fila de prueba en cada hoja\n\n' +
    'Siguiente paso: configura WEBHOOK_URL en el código.'
  );
}

// ── UTILIDADES ──────────────────────────────────────────────
function formatDate(date) {
  if (date instanceof Date) {
    return Utilities.formatDate(date, 'America/Caracas', 'yyyy-MM-dd');
  }
  return date;
}
