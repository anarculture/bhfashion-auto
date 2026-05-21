const fs = require('fs');
const path = require('path');

const nodes = [];
const connections = {};

function addNode(node) {
  nodes.push(node);
  return node.name;
}

function connect(fromNode, toNode, fromOutputIndex = 0, toInputIndex = 0) {
  if (!connections[fromNode]) {
    connections[fromNode] = { main: [] };
  }
  while (connections[fromNode].main.length <= fromOutputIndex) {
    connections[fromNode].main.push([]);
  }
  connections[fromNode].main[fromOutputIndex].push({
    node: toNode,
    type: "main",
    index: toInputIndex
  });
}

// 1. Webhook Deploy
addNode({
  id: "webhook-deploy",
  name: "Webhook Deploy",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [0, 0],
  parameters: {
    httpMethod: "POST",
    options: {},
    path: "meta-ads-deploy",
    responseMode: "responseNode"
  },
  webhookId: "f6fdd7ac-d903-488e-82c0-776b2d883919"
});

// 2. Preparar Payload
addNode({
  id: "prep-payload",
  name: "Preparar Payload",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [200, 0],
  parameters: {
    jsCode: `const body = $input.first().json.body;
if (!body || !body.filas || !Array.isArray(body.filas) || body.filas.length === 0) {
  throw new Error('Payload inválido: se requiere body.filas como array no vacío');
}
return {
  json: {
    spreadsheet_id: body.spreadsheet_id || 'unknown',
    filas: body.filas
  }
};`
  }
});

// 3. Variables Globales
addNode({
  id: "global-vars",
  name: "Variables Globales",
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [400, 0],
  parameters: {
    assignments: {
      assignments: [
        { id: "acc-id", name: "ad_account_id", type: "string", value: "988429123910411" },
        { id: "actor-id", name: "instagram_actor_id", type: "string", value: "17841408634629405" },
        { id: "api-v", name: "api_version", type: "string", value: "v25.0" }
      ]
    },
    includeOtherFields: true,
    options: {}
  }
});

// 4. Read Campañas Sheet
addNode({
  id: "sheets-campanas-07",
  name: "Read Campañas Sheet",
  type: "n8n-nodes-base.googleSheets",
  typeVersion: 4.5,
  position: [600, 0],
  credentials: { googleSheetsOAuth2Api: { id: "7dlWSVzJGL0kxmq1", name: "Google Sheets account" } },
  parameters: {
    operation: "read",
    documentId: {
      __rl: true,
      value: "={{ $('Preparar Payload').first().json.spreadsheet_id }}",
      mode: "id"
    },
    sheetName: { __rl: true, value: "Campañas", mode: "name" },
    options: {}
  }
});

// 5. Read Audiencias Sheet
addNode({
  id: "sheets-audiencias-08",
  name: "Read Audiencias Sheet",
  type: "n8n-nodes-base.googleSheets",
  typeVersion: 4.5,
  position: [800, 0],
  credentials: { googleSheetsOAuth2Api: { id: "7dlWSVzJGL0kxmq1", name: "Google Sheets account" } },
  parameters: {
    operation: "read",
    documentId: {
      __rl: true,
      value: "={{ $('Preparar Payload').first().json.spreadsheet_id }}",
      mode: "id"
    },
    sheetName: { __rl: true, value: "Audiencias", mode: "name" },
    options: {}
  }
});

// 6. Extraer Campañas Únicas
addNode({
  id: "extraer-campanas",
  name: "Extraer Campañas Únicas",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1000, 0],
  parameters: {
    jsCode: `const payload = $('Preparar Payload').first().json;
const campanas = [...new Set(payload.filas.map(f => f.campaña).filter(Boolean))];
return campanas.map(c => ({ json: { campaña: c } }));`
  }
});

// 7. Split Campaigns Loop (N=1)
addNode({
  id: "split-campanas",
  name: "Split Campaigns",
  type: "n8n-nodes-base.splitInBatches",
  typeVersion: 3,
  position: [1200, 0],
  parameters: {
    batchSize: 1,
    options: {}
  }
});

// 8. Postgres Cache Lookup
addNode({
  id: "postgres-camp-lookup",
  name: "Lookup PG Cache",
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  position: [1400, 100],
  credentials: { postgres: { id: "zRsMDLm7WeomuzE3", name: "Postgres BH Fashion" } },
  parameters: {
    options: {},
    operation: "executeQuery",
    query: "SELECT campaign_id, objective FROM campaigns_meta WHERE nombre = '{{ $json.campaña }}';"
  }
});

// 9. IF PG Cached
addNode({
  id: "if-pg-cached",
  name: "IF Cached",
  type: "n8n-nodes-base.if",
  typeVersion: 1,
  position: [1600, 100],
  parameters: {
    conditions: {
      string: [
        { value1: "={{ $json.campaign_id }}", operation: "isNotEmpty" }
      ]
    }
  }
});

// 10. Meta Campaign Lookup
addNode({
  id: "meta-camp-lookup",
  name: "Meta Campaign Lookup",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1800, 200],
  credentials: { httpBearerAuth: { id: "AQ2tmf94MUYVp0JI", name: "Bearer Auth account" } },
  parameters: {
    authentication: "genericCredentialType",
    genericAuthType: "httpBearerAuth",
    method: "GET",
    url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/campaigns",
    sendQueryParameters: true,
    queryParameters: {
      parameters: [
        { name: "fields", value: "id,name,objective" },
        { name: "filtering", value: "=[{\"field\":\"name\",\"operator\":\"EQUAL\",\"value\":\"{{ $('Split Campaigns').first().json.campaña }}\"}]" }
      ]
    },
    options: {}
  }
});

// 11. IF Campaign Found in Meta
addNode({
  id: "if-meta-found",
  name: "IF Found in Meta",
  type: "n8n-nodes-base.if",
  typeVersion: 1,
  position: [2000, 200],
  parameters: {
    conditions: {
      number: [
        { value1: "={{ $json.data ? $json.data.length : 0 }}", operation: "larger", value2: 0 }
      ]
    }
  }
});

// 12. Resolve Objective
addNode({
  id: "resolve-objective",
  name: "Resolve Objective",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2200, 300],
  parameters: {
    jsCode: `const campanaName = $('Split Campaigns').first().json.campaña;
const campanasConfig = $('Read Campñas Sheet').all().map(i => i.json);
const config = campanasConfig.find(c => c.nombre && String(c.nombre).trim() === String(campanaName).trim());
return {
  json: {
    campaña: campanaName,
    objective: config ? (config.objective || 'OUTCOME_SALES') : 'OUTCOME_SALES',
    special_ad_categories: config ? JSON.parse(config.special_ad_categories || '[]') : []
  }
};`
  }
});

// 13. Meta Create Campaign
addNode({
  id: "meta-create-campaign",
  name: "Meta Create Campaign",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [2400, 300],
  credentials: { httpBearerAuth: { id: "AQ2tmf94MUYVp0JI", name: "Bearer Auth account" } },
  parameters: {
    authentication: "genericCredentialType",
    genericAuthType: "httpBearerAuth",
    method: "POST",
    url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/campaigns",
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={\n  "name": "{{ $json.campaña }}",\n  "objective": "{{ $json.objective }}",\n  "status": "PAUSED",\n  "special_ad_categories": {{ JSON.stringify($json.special_ad_categories) }}\n}`,
    options: {}
  }
});

// 14. Postgres Cache Campaign
addNode({
  id: "postgres-cache-camp",
  name: "Postgres Cache Campaign",
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  position: [2600, 200],
  credentials: { postgres: { id: "zRsMDLm7WeomuzE3", name: "Postgres BH Fashion" } },
  parameters: {
    options: {},
    operation: "executeQuery",
    query: `INSERT INTO campaigns_meta (nombre, campaign_id, objective)
VALUES (
  '{{ $('Split Campaigns').first().json.campaña.replace(/'/g, "''") }}', 
  '{{ $node["Meta Create Campaign"]?.json?.id || $node["Meta Campaign Lookup"]?.json?.data?.[0]?.id }}', 
  '{{ $('Resolve Objective').first().json?.objective || $('Meta Campaign Lookup').first().json?.data?.[0]?.objective || "OUTCOME_SALES" }}'
)
ON CONFLICT (nombre) DO UPDATE SET campaign_id = EXCLUDED.campaign_id
RETURNING campaign_id;`
  }
});

// 15. Campaign Resolved NoOp
addNode({
  id: "camp-resolved",
  name: "Campaign Resolved",
  type: "n8n-nodes-base.noOp",
  typeVersion: 1,
  position: [2800, 100]
});

// 16. Preparar Filas Deploy
addNode({
  id: "prep-rows-deploy",
  name: "Preparar Filas Deploy",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1400, -300],
  parameters: {
    jsCode: `const payload = $('Preparar Payload').first().json;
return payload.filas.map(fila => ({
  json: {
    campaña: fila.campaña || null,
    ig_post_url: fila.ig_post_url || null,
    presupuesto_diario: fila.presupuesto_diario !== undefined ? Number(fila.presupuesto_diario) : null,
    fecha_inicio: fila.fecha_inicio || null,
    fecha_fin: fila.fecha_fin || null,
    audiencia: fila.audiencia || null,
    placements: fila.placements || 'automatic',
    fila_sheets: fila.fila_sheets || null,
    spreadsheet_id: payload.spreadsheet_id
  }
}));`
  }
});

// 17. Split Rows (N=5)
addNode({
  id: "split-rows",
  name: "Split Rows",
  type: "n8n-nodes-base.splitInBatches",
  typeVersion: 3,
  position: [1600, -300],
  parameters: {
    batchSize: 5,
    options: {}
  }
});

// 18. Validar Local y FKs (process all items)
addNode({
  id: "validar-local-fks",
  name: "Validar Local y FKs",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1800, -300],
  parameters: {
    jsCode: `const items = $input.all();
const campanas = $('Read Campñas Sheet').all().map(i => i.json);
const audiencias = $('Read Audiencias Sheet').all().map(i => i.json);

return items.map(item => {
  const deploy = item.json;
  
  // 1. Validar campos requeridos
  const required = ['campaña', 'ig_post_url', 'presupuesto_diario', 'fecha_inicio', 'fecha_fin', 'audiencia'];
  const missing = required.filter(f => !deploy[f] && deploy[f] !== 0);
  if (missing.length > 0) {
    return { json: { ...deploy, isValid: false, error_message: 'Campos requeridos faltantes: ' + missing.join(', ') } };
  }
  
  // 2. Validar formato de URL de Instagram
  const igUrlRegex = /^https?:\\/\\/(?:www\\.)?instagram\\.com\\/(?:p|reel|tv)\\/([A-Za-z0-9-_]+)/i;
  const urlMatch = deploy.ig_post_url.match(igUrlRegex);
  if (!urlMatch) {
    return { json: { ...deploy, isValid: false, error_message: 'URL de Instagram inválida. Debe contener /p/, /reel/ o /tv/ y un shortcode válido' } };
  }
  const shortcode = urlMatch[1];
  
  // 3. Validar rango de presupuesto diario
  if (isNaN(deploy.presupuesto_diario) || deploy.presupuesto_diario <= 0) {
    return { json: { ...deploy, isValid: false, error_message: 'El presupuesto diario debe ser un número mayor a 0' } };
  }
  
  // 4. Validar rango de fechas
  const dateStart = new Date(deploy.fecha_inicio);
  const dateEnd = new Date(deploy.fecha_fin);
  if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
    return { json: { ...deploy, isValid: false, error_message: 'Formato de fecha de inicio o fin inválido' } };
  }
  if (dateStart > dateEnd) {
    return { json: { ...deploy, isValid: false, error_message: 'La fecha de inicio no puede ser posterior a la fecha de fin' } };
  }
  
  // 5. Validar FK Campañas
  const campanaConfig = campanas.find(c => c.nombre && String(c.nombre).trim() === String(deploy.campaña).trim());
  if (!campanaConfig) {
    return { json: { ...deploy, isValid: false, error_message: 'Campaña no encontrada en la hoja Campañas: ' + deploy.campaña } };
  }
  
  // 6. Validar FK Audiencias
  const audienciaConfig = audiencias.find(a => a.alias && String(a.alias).trim() === String(deploy.audiencia).trim());
  if (!audienciaConfig) {
    return { json: { ...deploy, isValid: false, error_message: 'Audiencia no encontrada en la hoja Audiencias: ' + deploy.audiencia } };
  }
  
  // Decodificar shortcode a ig_media_id (usando BigInt para evitar overflow)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let mediaId = BigInt(0);
  for (let i = 0; i < shortcode.length; i++) {
    let char = shortcode[i];
    let value = BigInt(alphabet.indexOf(char));
    mediaId = (mediaId * BigInt(64)) + value;
  }
  
  return {
    json: {
      ...deploy,
      isValid: true,
      ig_media_id: mediaId.toString(),
      shortcode: shortcode
    }
  };
});`
  }
});

// 19. IF Row Valid
addNode({
  id: "if-row-valid",
  name: "IF Row Valid",
  type: "n8n-nodes-base.if",
  typeVersion: 1,
  position: [2000, -300],
  parameters: {
    conditions: {
      boolean: [
        { value1: "={{ $json.isValid }}", operation: "equal", value2: true }
      ]
    }
  }
});

// 20. Format Local Error
addNode({
  id: "format-local-error",
  name: "Format Local Error",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2200, -100],
  parameters: {
    jsCode: "return $input.all().map(item => ({ json: { ...item.json } }));"
  }
});

// 21. Verify IG Post
addNode({
  id: "verify-ig-post",
  name: "Verify IG Post",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [2200, -450],
  continueOnFail: true,
  credentials: { httpBearerAuth: { id: "AQ2tmf94MUYVp0JI", name: "Bearer Auth account" } },
  parameters: {
    authentication: "genericCredentialType",
    genericAuthType: "httpBearerAuth",
    method: "GET",
    url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/{{ $json.ig_media_id }}?fields=id",
    options: {}
  }
});

// 22. Merge IG Verify
addNode({
  id: "merge-ig-verify",
  name: "Merge IG Verify",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2400, -450],
  parameters: {
    jsCode: `return $input.all().map(item => {
  const orig = $('Validar Local y FKs').item;
  let isExists = false;
  let errMsg = null;
  if (item.json && item.json.id) {
    isExists = true;
  } else if (item.json && item.json.error) {
    errMsg = 'Error Meta API: ' + (item.json.error.message || 'Desconocido');
  } else {
    errMsg = 'Post de Instagram no encontrado o no accesible';
  }
  return {
    json: {
      ...orig.json,
      ig_exists: isExists,
      error_message: errMsg
    }
  };
});`
  }
});

// 23. IF IG Post Exists
addNode({
  id: "if-ig-exists",
  name: "IF IG Post Exists",
  type: "n8n-nodes-base.if",
  typeVersion: 1,
  position: [2600, -450],
  parameters: {
    conditions: {
      boolean: [
        { value1: "={{ $json.ig_exists }}", operation: "equal", value2: true }
      ]
    }
  }
});

// 24. Format IG Error
addNode({
  id: "format-ig-error",
  name: "Format IG Error",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2800, -300],
  parameters: {
    jsCode: "return $input.all().map(item => ({ json: { ...item.json } }));"
  }
});

// 25. Postgres Insert Error (pre-claim path)
addNode({
  id: "postgres-insert-error",
  name: "Postgres Insert Error",
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  position: [3000, -200],
  credentials: { postgres: { id: "zRsMDLm7WeomuzE3", name: "Postgres BH Fashion" } },
  parameters: {
    options: {},
    operation: "executeQuery",
    query: `INSERT INTO deployments (campaña, ig_post_url, presupuesto_diario, fecha_inicio, fecha_fin, audiencia, placements, fila_sheets, spreadsheet_id, estado, error_log)
VALUES (
  '{{ $json.campaña.replace(/'/g, "''") }}', 
  '{{ $json.ig_post_url.replace(/'/g, "''") }}', 
  {{ $json.presupuesto_diario || 0 }}, 
  '{{ $json.fecha_inicio }}', 
  '{{ $json.fecha_fin }}', 
  '{{ $json.audiencia.replace(/'/g, "''") }}', 
  '{{ $json.placements }}', 
  {{ $json.fila_sheets || 'NULL' }}, 
  '{{ $json.spreadsheet_id }}', 
  'Error', 
  '{{ $json.error_message ? $json.error_message.replace(/'/g, "''") : "Error desconocido" }}'
)
RETURNING id, error_log AS error_message, spreadsheet_id, fila_sheets AS row_number;`
  }
});

// 26. Google Sheets Sync Error
addNode({
  id: "sheets-sync-error",
  name: "Google Sheets Sync Error",
  type: "n8n-nodes-base.googleSheets",
  typeVersion: 4.5,
  position: [3200, -200],
  credentials: { googleSheetsOAuth2Api: { id: "7dlWSVzJGL0kxmq1", name: "Google Sheets account" } },
  parameters: {
    operation: "update",
    documentId: {
      __rl: true,
      value: "={{ $json.spreadsheet_id }}",
      mode: "id"
    },
    sheetName: { __rl: true, value: "Deploys", mode: "name" },
    columns: {
      mappingMode: "defineBelow",
      matchingColumns: ["row_number"],
      value: {
         "Estado": "Error",
         "error_log": "={{ $json.error_message }}",
         "row_number": "={{ $json.row_number }}"
      },
      schema: [
        { id: "row_number", type: "string", display: true, removed: false, readOnly: true, displayName: "row_number", defaultMatch: false, canBeUsedToMatch: true },
        { id: "Estado", type: "string", display: true, removed: false, displayName: "Estado", defaultMatch: false, canBeUsedToMatch: false },
        { id: "error_log", type: "string", display: true, removed: false, displayName: "error_log", defaultMatch: false, canBeUsedToMatch: false }
      ]
    },
    options: {}
  }
});

// 27. Insert Postgres (pending path)
addNode({
  id: "postgres-insert-pending",
  name: "Insert Postgres",
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  position: [2800, -600],
  credentials: { postgres: { id: "zRsMDLm7WeomuzE3", name: "Postgres BH Fashion" } },
  parameters: {
    options: {},
    operation: "executeQuery",
    query: `INSERT INTO deployments (campaña, ig_post_url, presupuesto_diario, fecha_inicio, fecha_fin, audiencia, placements, fila_sheets, spreadsheet_id, estado)
VALUES (
  '{{ $json.campaña.replace(/'/g, "''") }}',
  '{{ $json.ig_post_url }}',
  {{ $json.presupuesto_diario }},
  '{{ $json.fecha_inicio }}',
  '{{ $json.fecha_fin }}',
  '{{ $json.audiencia.replace(/'/g, "''") }}',
  '{{ $json.placements }}',
  {{ $json.fila_sheets || 'NULL' }},
  '{{ $json.spreadsheet_id }}',
  'Pendiente'
)
RETURNING id, campaña, ig_post_url, presupuesto_diario, fecha_inicio, fecha_fin, audiencia, placements, fila_sheets, spreadsheet_id, estado, created_at;`
  }
});

// 28. Claim Postgres
addNode({
  id: "postgres-claim-deploying",
  name: "Claim Postgres",
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  position: [3000, -600],
  credentials: { postgres: { id: "zRsMDLm7WeomuzE3", name: "Postgres BH Fashion" } },
  parameters: {
    options: {},
    operation: "executeQuery",
    query: "UPDATE deployments SET estado = 'Desplegando' WHERE estado = 'Pendiente' AND id = {{ $json.id }} RETURNING *;"
  }
});

// 29. Check Claimed
addNode({
  id: "if-claimed",
  name: "Check Claimed",
  type: "n8n-nodes-base.if",
  typeVersion: 1,
  position: [3200, -600],
  parameters: {
    conditions: {
      number: [
        { value1: "={{ $input.all().length }}", operation: "larger", value2: 0 }
      ]
    }
  }
});

// 30. Resolve Config
addNode({
  id: "resolve-config",
  name: "Resolve Config",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [3400, -600],
  parameters: {
    jsCode: `const deploy = $input.first().json;
const campanas = $('Read Campñas Sheet').all().map(i => i.json);
const audiencias = $('Read Audiencias Sheet').all().map(i => i.json);

const campanaConfig = campanas.find(c => c.nombre === deploy.campaña);
if (!campanaConfig) {
  throw new Error('Configuración de campaña no encontrada en hoja Campañas para: ' + deploy.campaña);
}

const audienciaConfig = audiencias.find(a => a.alias === deploy.audiencia);
if (!audienciaConfig) {
  throw new Error('Audiencia no encontrada en hoja Audiencias para: ' + deploy.audiencia);
}

return {
  json: {
    ...deploy,
    objective: campanaConfig.objective || 'OUTCOME_SALES',
    special_ad_categories: JSON.parse(campanaConfig.special_ad_categories || '[]'),
    meta_audience_id: audienciaConfig.meta_audience_id,
    audience_type: audienciaConfig.tipo || 'custom'
  }
};`
  }
});

// 31. Lookup Campaign ID Cache
addNode({
  id: "postgres-camp-id-lookup",
  name: "Lookup Campaign ID Cache",
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  position: [3600, -600],
  credentials: { postgres: { id: "zRsMDLm7WeomuzE3", name: "Postgres BH Fashion" } },
  parameters: {
    options: {},
    operation: "executeQuery",
    query: "SELECT campaign_id FROM campaigns_meta WHERE nombre = '{{ $json.campaña }}';"
  }
});

// 32. Merge Campaign ID
addNode({
  id: "merge-camp-id",
  name: "Merge Campaign ID",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [3800, -600],
  parameters: {
    jsCode: `return $input.all().map(item => {
  const orig = $('Resolve Config').item;
  return {
    json: {
      ...orig.json,
      campaign_id: item.json.campaign_id
    }
  };
});`
  }
});

// --- Retry Subflows Definition helper ---
function addRetrySubflow(assetType, startPositionX, startPositionY, metaUrl, jsonBodyExpression, credentialsId) {
  const prepName = `Prepare ${assetType} Input`;
  const httpName = `Meta Create ${assetType}`;
  const checkSuccessName = `Check ${assetType} Success`;
  const checkRateLimitName = `Is ${assetType} Rate Limit Error`;
  const incrementRetryName = `Increment ${assetType} Retry Count`;
  const shouldRetryName = `Should ${assetType} Retry`;
  const waitName = `Wait ${assetType}`;
  const formatErrorName = `Format ${assetType} Error`;

  // 1. Prepare Input
  addNode({
    id: `prep-${assetType.toLowerCase()}-input`,
    name: prepName,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [startPositionX, startPositionY],
    parameters: {
      jsCode: `const input = $input.first().json;
return {
  json: {
    ...input,
    retries: input.retries !== undefined ? input.retries : 0
  }
};`
    }
  });

  // 2. HTTP Request
  addNode({
    id: `http-create-${assetType.toLowerCase()}`,
    name: httpName,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [startPositionX + 200, startPositionY],
    continueOnFail: true,
    credentials: { httpBearerAuth: { id: credentialsId, name: "Bearer Auth account" } },
    parameters: {
      authentication: "genericCredentialType",
      genericAuthType: "httpBearerAuth",
      method: "POST",
      url: metaUrl,
      sendBody: true,
      specifyBody: "json",
      jsonBody: jsonBodyExpression,
      options: {}
    }
  });

  // 3. Check Success IF
  addNode({
    id: `check-${assetType.toLowerCase()}-success`,
    name: checkSuccessName,
    type: "n8n-nodes-base.if",
    typeVersion: 1,
    position: [startPositionX + 400, startPositionY],
    parameters: {
      conditions: {
        string: [
          { value1: "={{ $json.id }}", operation: "isNotEmpty" }
        ]
      }
    }
  });

  // 4. Is Rate Limit Error IF
  addNode({
    id: `check-${assetType.toLowerCase()}-ratelimit`,
    name: checkRateLimitName,
    type: "n8n-nodes-base.if",
    typeVersion: 1,
    position: [startPositionX + 400, startPositionY + 200],
    parameters: {
      conditions: {
        boolean: [
          {
            value1: "={{ !!$json.error && ($json.error.code === 17 || $json.error.code === 32) }}",
            operation: "equal",
            value2: true
          }
        ]
      }
    }
  });

  // 5. Increment Retry Count Code
  addNode({
    id: `inc-${assetType.toLowerCase()}-retry`,
    name: incrementRetryName,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [startPositionX + 600, startPositionY + 200],
    parameters: {
      jsCode: `const errorResp = $input.first().json;
const prevInput = $('${prepName}').item.json;
const newRetries = (prevInput.retries || 0) + 1;
const maxTries = 3;

if (newRetries <= maxTries) {
  const backoff = 30 * Math.pow(2, newRetries - 1);
  return {
    json: {
      ...prevInput,
      retries: newRetries,
      backoff_seconds: backoff,
      retry: true
    }
  };
} else {
  return {
    json: {
      ...prevInput,
      retry: false,
      error_message: 'Meta API Rate Limit Exceeded (3 attempts): ' + (errorResp.error ? errorResp.error.message : 'Desconocido')
    }
  };}`
    }
  });

  // 6. Should Retry IF
  addNode({
    id: `should-${assetType.toLowerCase()}-retry`,
    name: shouldRetryName,
    type: "n8n-nodes-base.if",
    typeVersion: 1,
    position: [startPositionX + 800, startPositionY + 200],
    parameters: {
      conditions: {
        boolean: [
          { value1: "={{ $json.retry }}", operation: "equal", value2: true }
        ]
      }
    }
  });

  // 7. Wait Node
  addNode({
    id: `wait-${assetType.toLowerCase()}`,
    name: waitName,
    type: "n8n-nodes-base.wait",
    typeVersion: 1.1,
    position: [startPositionX + 600, startPositionY + 350],
    parameters: {
      amount: "={{ $json.backoff_seconds }}",
      unit: "seconds"
    }
  });

  // 8. Format Error Code
  addNode({
    id: `format-${assetType.toLowerCase()}-error`,
    name: formatErrorName,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [startPositionX + 600, startPositionY + 50],
    parameters: {
      jsCode: `const err = $input.first().json;
const msg = err.error_message || (err.error ? err.error.message : 'Error desconocido de Meta API');
return {
  json: {
    ...$('${prepName}').item.json,
    error_message: msg
  }
};`
    }
  });

  // Connect retry loop nodes
  connect(prepName, httpName);
  connect(httpName, checkSuccessName);
  connect(checkSuccessName, checkRateLimitName, 1);
  connect(checkRateLimitName, incrementRetryName, 0);
  connect(checkRateLimitName, formatErrorName, 1);
  connect(incrementRetryName, shouldRetryName);
  connect(shouldRetryName, waitName, 0);
  connect(shouldRetryName, formatErrorName, 1);
  connect(waitName, prepName);
}

// Instantiate retry subflows
const credentialsId = "AQ2tmf94MUYVp0JI";

// AdSet Subflow
addRetrySubflow(
  "AdSet", 
  4000, 
  -600, 
  "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/adsets",
  `={\n  "name": "{{ $json.campaña }} - AdSet",\n  "campaign_id": "{{ $json.campaign_id }}",\n  "daily_budget": {{ Math.round($json.presupuesto_diario * 100) }},\n  "billing_event": "IMPRESSIONS",\n  "optimization_goal": "IMPRESSIONS",\n  "bid_strategy": "LOWEST_COST_WITHOUT_CAP",\n  "targeting": {{ JSON.stringify((() => { const audId = $json.meta_audience_id; const isDummy = !audId || String(audId).length < 12 || audId === '123456789' || audId === 123456789; if (isDummy) return { 'geo_locations': { 'countries': ['VE'] } }; return $json.audience_type === 'saved' ? { 'saved_audience_id': audId } : { 'custom_audiences': [{ 'id': audId }], 'geo_locations': { 'countries': ['VE'] } }; })()) }},\n  "start_time": "{{ $json.fecha_inicio.substring(0, 10) }}T09:00:00-04:00",\n  "end_time": "{{ $json.fecha_fin.substring(0, 10) }}T23:59:59-04:00",\n  "status": "ACTIVE"\n}`,
  credentialsId
);

// Creative Subflow
addRetrySubflow(
  "Creative", 
  5000, 
  -600, 
  "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/adcreatives",
  `={\n  "name": "{{ $json.campaña }} - Creative",\n  "instagram_actor_id": "{{ $('Variables Globales').first().json.instagram_actor_id }}",\n  "instagram_permalink_url": "{{ $json.ig_post_url }}"\n}`,
  credentialsId
);

// Ad Subflow
addRetrySubflow(
  "Ad", 
  6000, 
  -600, 
  "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/ads",
  `={\n  "name": "{{ $json.campaña }} - Ad",\n  "adset_id": "{{ $json.adset_id }}",\n  "creative": { "creative_id": "{{ $json.creative_id }}" },\n  "status": "PAUSED"\n}`,
  credentialsId
);

// We need to modify "Prepare Creative Input" and "Prepare Ad Input" to correctly merge upstream fields!
const prepCreativeNode = nodes.find(n => n.name === 'Prepare Creative Input');
prepCreativeNode.parameters.jsCode = `const adsetResp = $input.first().json;
const orig = $('Prepare AdSet Input').item.json;
return {
  json: {
    ...orig,
    adset_id: adsetResp.id,
    retries: 0
  }
};`;

const prepAdNode = nodes.find(n => n.name === 'Prepare Ad Input');
prepAdNode.parameters.jsCode = `const creativeResp = $input.first().json;
const orig = $('Prepare Creative Input').item.json;
return {
  json: {
    ...orig,
    creative_id: creativeResp.id,
    retries: 0
  }
};`;

// 33. Postgres Update Error (post-claim path)
addNode({
  id: "postgres-update-error",
  name: "Postgres Update Error",
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  position: [7000, -200],
  credentials: { postgres: { id: "zRsMDLm7WeomuzE3", name: "Postgres BH Fashion" } },
  parameters: {
    options: {},
    operation: "executeQuery",
    query: `UPDATE deployments 
SET estado = 'Error', 
    error_log = '{{ $json.error_message ? $json.error_message.replace(/'/g, "''") : "Error desconocido" }}' 
WHERE id = {{ $json.id }}
RETURNING id, error_log AS error_message, spreadsheet_id, fila_sheets AS row_number;`
  }
});

// 34. Postgres Update Deployment (Success)
addNode({
  id: "postgres-update-success",
  name: "Postgres Update Deployment",
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  position: [7000, -600],
  credentials: { postgres: { id: "zRsMDLm7WeomuzE3", name: "Postgres BH Fashion" } },
  parameters: {
    options: {},
    operation: "executeQuery",
    query: `UPDATE deployments 
SET campaign_id = '{{ $json.campaign_id }}', 
    adset_id = '{{ $json.adset_id }}', 
    ad_id = '{{ $json.ad_id }}', 
    estado = 'Desplegado', 
    desplegado_at = NOW() 
WHERE id = {{ $json.id }}
RETURNING *;`
  }
});

// 35. Google Sheets Sync Output (Success)
addNode({
  id: "sheets-sync-success",
  name: "Google Sheets Sync Output",
  type: "n8n-nodes-base.googleSheets",
  typeVersion: 4.5,
  position: [7200, -600],
  credentials: { googleSheetsOAuth2Api: { id: "7dlWSVzJGL0kxmq1", name: "Google Sheets account" } },
  parameters: {
    operation: "update",
    documentId: {
      __rl: true,
      value: "={{ $json.spreadsheet_id }}",
      mode: "id"
    },
    sheetName: { __rl: true, value: "Deploys", mode: "name" },
    columns: {
      mappingMode: "defineBelow",
      matchingColumns: ["row_number"],
      value: {
        "Estado": "Desplegado",
        "campaign_id": "={{ $json.campaign_id }}",
        "adset_id": "={{ $json.adset_id }}",
        "ad_id": "={{ $json.ad_id }}",
        "desplegado_at": "={{ new Date().toISOString() }}",
        "row_number": "={{ $json.fila_sheets }}"
      },
      schema: [
        { id: "row_number", type: "string", display: true, removed: false, readOnly: true, displayName: "row_number", defaultMatch: false, canBeUsedToMatch: true },
        { id: "Estado", type: "string", display: true, removed: false, displayName: "Estado", defaultMatch: false, canBeUsedToMatch: false },
        { id: "campaign_id", type: "string", display: true, removed: false, displayName: "campaign_id", defaultMatch: false, canBeUsedToMatch: false },
        { id: "adset_id", type: "string", display: true, removed: false, displayName: "adset_id", defaultMatch: false, canBeUsedToMatch: false },
        { id: "ad_id", type: "string", display: true, removed: false, displayName: "ad_id", defaultMatch: false, canBeUsedToMatch: false },
        { id: "desplegado_at", type: "string", display: true, removed: false, displayName: "desplegado_at", defaultMatch: false, canBeUsedToMatch: false }
      ]
    },
    options: {}
  }
});

// 36. Row Completed NoOp
addNode({
  id: "row-completed",
  name: "Row Completed",
  type: "n8n-nodes-base.noOp",
  typeVersion: 1,
  position: [7600, -300]
});

// 37. Respond OK Webhook
addNode({
  id: "respond-ok",
  name: "Respond OK",
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.1,
  position: [1800, -500],
  parameters: {
    options: { responseCode: 200 },
    respondWith: "json",
    responseBody: '{\n  "status": "finished"\n}'
  }
});

// --- Connecting everything together ---
connect("Webhook Deploy", "Preparar Payload");
connect("Preparar Payload", "Variables Globales");
connect("Variables Globales", "Read Campañas Sheet");
connect("Read Campañas Sheet", "Read Audiencias Sheet");
connect("Read Audiencias Sheet", "Extraer Campañas Únicas");
connect("Extraer Campañas Únicas", "Split Campaigns");

// Campaign loop
connect("Split Campaigns", "Lookup PG Cache", 1);
connect("Lookup PG Cache", "IF Cached");
connect("IF Cached", "Campaign Resolved", 0);
connect("IF Cached", "Meta Campaign Lookup", 1);
connect("Meta Campaign Lookup", "IF Found in Meta");
connect("IF Found in Meta", "Postgres Cache Campaign", 0);
connect("IF Found in Meta", "Resolve Objective", 1);
connect("Resolve Objective", "Meta Create Campaign");
connect("Meta Create Campaign", "Postgres Cache Campaign");
connect("Postgres Cache Campaign", "Campaign Resolved");
connect("Campaign Resolved", "Split Campaigns");

// Done Campaign -> Split Rows
connect("Split Campaigns", "Preparar Filas Deploy", 0);
connect("Preparar Filas Deploy", "Split Rows");

// Rows Loop
connect("Split Rows", "Validar Local y FKs", 1);
connect("Validar Local y FKs", "IF Row Valid");

// Pre-claim Error path
connect("IF Row Valid", "Format Local Error", 1);
connect("Format Local Error", "Postgres Insert Error");
connect("Postgres Insert Error", "Google Sheets Sync Error");
connect("Google Sheets Sync Error", "Row Completed");

// Valid row path
connect("IF Row Valid", "Verify IG Post", 0);
connect("Verify IG Post", "Merge IG Verify");
connect("Merge IG Verify", "IF IG Post Exists");

// Post IG Verify Error path
connect("IF IG Post Exists", "Format IG Error", 1);
connect("Format IG Error", "Postgres Insert Error");

// Post IG Verify Success -> DB Insert/Claim
connect("IF IG Post Exists", "Insert Postgres", 0);
connect("Insert Postgres", "Claim Postgres");
connect("Claim Postgres", "Check Claimed");
connect("Check Claimed", "Resolve Config", 0);
connect("Check Claimed", "Row Completed", 1);

connect("Resolve Config", "Lookup Campaign ID Cache");
connect("Lookup Campaign ID Cache", "Merge Campaign ID");
connect("Merge Campaign ID", "Prepare AdSet Input");

// Post-claim Error paths (from retry subflows)
connect("Format AdSet Error", "Postgres Update Error");
connect("Format Creative Error", "Postgres Update Error");
connect("Format Ad Error", "Postgres Update Error");
connect("Postgres Update Error", "Google Sheets Sync Error");

// Connect between subflows
connect("Check AdSet Success", "Prepare Creative Input", 0);
connect("Check Creative Success", "Prepare Ad Input", 0);

// Connect success path
connect("Check Ad Success", "Postgres Update Deployment", 0);
connect("Postgres Update Deployment", "Google Sheets Sync Output");
connect("Google Sheets Sync Output", "Row Completed");

// Loop back to Split Rows
connect("Row Completed", "Split Rows");

// Done Split Rows -> Respond Webhook
connect("Split Rows", "Respond OK", 0);

// Compile to JSON
const workflow = {
  id: "eR6JKMnS1Fsq8MVa",
  name: "meta-ads-deploy",
  active: true,
  nodes,
  connections
};

fs.writeFileSync(
  path.join(__dirname, 'meta-ads-deploy-compiled.json'),
  JSON.stringify(workflow, null, 2),
  'utf8'
);
console.log('Workflow compiled successfully!');
