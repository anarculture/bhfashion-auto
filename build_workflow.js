const fs = require('fs');
const path = require('path');

const workflow = {
  id: "eR6JKMnS1Fsq8MVa",
  name: "meta-ads-deploy",
  active: true,
  nodes: [
    {
      id: "webhook-echo-01",
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
    },
    {
      id: "code-echo-02",
      name: "Preparar Fila",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [200, 0],
      parameters: {
        jsCode: `// Extrae la primera fila del payload del webhook
const body = $input.first().json.body;

if (!body || !body.filas || !Array.isArray(body.filas) || body.filas.length === 0) {
  throw new Error('Payload inválido: se requiere body.filas como array no vacío');
}

const spreadsheetId = body.spreadsheet_id || 'unknown';
const fila = body.filas[0] || {};

return {
  json: {
    campaña: fila.campaña || null,
    ig_post_url: fila.ig_post_url || null,
    presupuesto_diario: fila.presupuesto_diario !== undefined ? Number(fila.presupuesto_diario) : null,
    fecha_inicio: fila.fecha_inicio || null,
    fecha_fin: fila.fecha_fin || null,
    audiencia: fila.audiencia || null,
    placements: fila.placements || 'automatic',
    fila_sheets: fila.fila_sheets || null,
    spreadsheet_id: spreadsheetId
  }
};`
      }
    },
    {
      id: "global-vars",
      name: "Variables Globales",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [400, 0],
      parameters: {
        assignments: {
          assignments: [
            {
              id: "acc-id",
              name: "ad_account_id",
              type: "string",
              value: "988429123910411"
            },
            {
              id: "actor-id",
              name: "instagram_actor_id",
              type: "string",
              value: "17841408634629405"
            },
            {
              id: "api-v",
              name: "api_version",
              type: "string",
              value: "v25.0"
            }
          ]
        },
        includeOtherFields: true,
        options: {}
      }
    },
    {
      id: "sheets-campanas-07",
      name: "Read Campañas Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [600, 0],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "7dlWSVzJGL0kxmq1",
          name: "Google Sheets account"
        }
      },
      parameters: {
        operation: "read",
        documentId: {
          __rl: true,
          value: "={{ $('Preparar Fila').first().json.spreadsheet_id }}",
          mode: "id"
        },
        sheetName: {
          __rl: true,
          value: "Campañas",
          mode: "name"
        },
        options: {}
      }
    },
    {
      id: "sheets-audiencias-08",
      name: "Read Audiencias Sheet",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [800, 0],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "7dlWSVzJGL0kxmq1",
          name: "Google Sheets account"
        }
      },
      parameters: {
        operation: "read",
        documentId: {
          __rl: true,
          value: "={{ $('Preparar Fila').first().json.spreadsheet_id }}",
          mode: "id"
        },
        sheetName: {
          __rl: true,
          value: "Audiencias",
          mode: "name"
        },
        options: {}
      }
    },
    {
      id: "code-validate-local-fks",
      name: "Validar Local y FKs",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1000, 0],
      parameters: {
        jsCode: `const deploy = $('Preparar Fila').first().json;
const campanas = $('Read Campañas Sheet').all().map(i => i.json);
const audiencias = $('Read Audiencias Sheet').all().map(i => i.json);

// 1. Validar campos requeridos
const required = ['campaña', 'ig_post_url', 'presupuesto_diario', 'fecha_inicio', 'fecha_fin', 'audiencia'];
const missing = required.filter(f => !deploy[f] && deploy[f] !== 0);
if (missing.length > 0) {
  return { json: { isValid: false, error_message: 'Campos requeridos faltantes: ' + missing.join(', ') } };
}

// 2. Validar formato de URL de Instagram
const igUrlRegex = /^https?:\\/\\/(?:www\\.)?instagram\\.com\\/(?:p|reel|tv)\\/([A-Za-z0-9-_]+)/i;
const urlMatch = deploy.ig_post_url.match(igUrlRegex);
if (!urlMatch) {
  return { json: { isValid: false, error_message: 'URL de Instagram inválida. Debe contener /p/, /reel/ o /tv/ y un shortcode válido' } };
}
const shortcode = urlMatch[1];

// 3. Validar rango de presupuesto diario
if (isNaN(deploy.presupuesto_diario) || deploy.presupuesto_diario <= 0) {
  return { json: { isValid: false, error_message: 'El presupuesto diario debe ser un número mayor a 0' } };
}

// 4. Validar rango de fechas
const dateStart = new Date(deploy.fecha_inicio);
const dateEnd = new Date(deploy.fecha_fin);
if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
  return { json: { isValid: false, error_message: 'Formato de fecha de inicio o fin inválido' } };
}
if (dateStart > dateEnd) {
  return { json: { isValid: false, error_message: 'La fecha de inicio no puede ser posterior a la fecha de fin' } };
}

// 5. Validar FK Campañas
const campanaConfig = campanas.find(c => c.nombre && String(c.nombre).trim() === String(deploy.campaña).trim());
if (!campanaConfig) {
  return { json: { isValid: false, error_message: 'Campaña no encontrada en la hoja Campañas: ' + deploy.campaña } };
}

// 6. Validar FK Audiencias
const audienciaConfig = audiencias.find(a => a.alias && String(a.alias).trim() === String(deploy.audiencia).trim());
if (!audienciaConfig) {
  return { json: { isValid: false, error_message: 'Audiencia no encontrada en la hoja Audiencias: ' + deploy.audiencia } };
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
    isValid: true,
    ig_media_id: mediaId.toString(),
    shortcode: shortcode
  }
};`
      }
    },
    {
      id: "if-local-valid",
      name: "IF Local Valid",
      type: "n8n-nodes-base.if",
      typeVersion: 1,
      position: [1200, 0],
      parameters: {
        conditions: {
          boolean: [
            {
              value1: "={{ $json.isValid }}",
              operation: "equal",
              value2: true
            }
          ]
        }
      }
    },
    {
      id: "code-format-local-error",
      name: "Format Local Error",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1400, 150],
      parameters: {
        jsCode: `const deploy = $('Preparar Fila').first().json;\nconst validation = $('Validar Local y FKs').first().json;\nreturn {\n  json: {\n    ...deploy,\n    error_message: validation.error_message\n  }\n};`
      }
    },
    {
      id: "meta-verify-ig-post",
      name: "Verify IG Post",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [1400, -150],
      continueOnFail: true,
      credentials: {
        httpBearerAuth: {
          id: "AQ2tmf94MUYVp0JI",
          name: "Bearer Auth account"
        }
      },
      parameters: {
        authentication: "genericCredentialType",
        genericAuthType: "httpBearerAuth",
        method: "GET",
        url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/{{ $('Validar Local y FKs').first().json.ig_media_id }}?fields=id",
        options: {}
      }
    },
    {
      id: "if-ig-post-exists",
      name: "IF IG Post Exists",
      type: "n8n-nodes-base.if",
      typeVersion: 1,
      position: [1600, -150],
      parameters: {
        conditions: {
          string: [
            {
              value1: "={{ $json.id }}",
              operation: "isNotEmpty"
            }
          ]
        }
      }
    },
    {
      id: "code-format-ig-error",
      name: "Format IG Error",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1800, 0],
      parameters: {
        jsCode: `const deploy = $('Preparar Fila').first().json;\nconst apiResponse = $('Verify IG Post').first().json;\nlet errMsg = 'Post de Instagram no encontrado o no accesible';\nif (apiResponse && apiResponse.error && apiResponse.error.message) {\n  errMsg = 'Error Meta API: ' + apiResponse.error.message;\n}\nreturn {\n  json: {\n    ...deploy,\n    error_message: errMsg\n  }\n};`
      }
    },
    {
      id: "postgres-insert-error",
      name: "Postgres Insert Error",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [2000, 100],
      credentials: {
        postgres: {
          id: "zRsMDLm7WeomuzE3",
          name: "Postgres BH Fashion"
        }
      },
      parameters: {
        options: {},
        operation: "executeQuery",
        query: `INSERT INTO deployments (
  campaña, 
  ig_post_url, 
  presupuesto_diario, 
  fecha_inicio, 
  fecha_fin, 
  audiencia, 
  placements, 
  fila_sheets, 
  spreadsheet_id, 
  estado, 
  error_log
)
VALUES (
  '{{ $json.campaña.replace(/'/g, "''") }}', 
  '{{ $json.ig_post_url.replace(/'/g, "''") }}', 
  {{ $json.presupuesto_diario || 0 }}, 
  '{{ $json.fecha_inicio }}', 
  '{{ $json.fecha_fin }}', 
  '{{ $json.audiencia }}', 
  '{{ $json.placements }}', 
  {{ $json.fila_sheets }}, 
  '{{ $json.spreadsheet_id }}', 
  'Error', 
  '{{ $json.error_message.replace(/'/g, "''") }}'
)
RETURNING id, error_log AS error_message;`
      }
    },
    {
      id: "sheets-sync-error",
      name: "Google Sheets Sync Error",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [2200, 100],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "7dlWSVzJGL0kxmq1",
          name: "Google Sheets account"
        }
      },
      parameters: {
        operation: "update",
        documentId: {
          __rl: true,
          value: "={{ $json.spreadsheet_id || $('Preparar Fila').first().json.spreadsheet_id }}",
          mode: "id"
        },
        sheetName: {
          __rl: true,
          value: "Deploys",
          mode: "name"
        },
        columns: {
          mappingMode: "defineBelow",
          matchingColumns: [
            "row_number"
          ],
          value: {
             "Estado": "Error",
             "error_log": "={{ $json.error_message }}",
             "row_number": "={{ $json.fila_sheets || $('Preparar Fila').first().json.fila_sheets }}"
          },
          schema: [
            {
              id: "row_number",
              type: "string",
              display: true,
              removed: false,
              readOnly: true,
              required: false,
              displayName: "row_number",
              defaultMatch: false,
              canBeUsedToMatch: true
            },
            {
              id: "Estado",
              type: "string",
              display: true,
              removed: false,
              required: false,
              displayName: "Estado",
              defaultMatch: false,
              canBeUsedToMatch: false
            },
            {
              id: "error_log",
              type: "string",
              display: true,
              removed: false,
              required: false,
              displayName: "error_log",
              defaultMatch: false,
              canBeUsedToMatch: false
            }
          ]
        },
        options: {}
      }
    },
    {
      id: "respond-error",
      name: "Respond Error",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [2400, 100],
      parameters: {
        options: {
          responseCode: 200
        },
        respondWith: "json",
        responseBody: `={\n  "status": "error",\n  "message": {{ JSON.stringify($('Postgres Insert Error').first().json.error_message) }}\n}`
      }
    },
    {
      id: "postgres-echo-03",
      name: "Insert Postgres",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [1800, -300],
      credentials: {
        postgres: {
          id: "zRsMDLm7WeomuzE3",
          name: "Postgres BH Fashion"
        }
      },
      parameters: {
        options: {},
        operation: "executeQuery",
        query: `INSERT INTO deployments (campaña, ig_post_url, presupuesto_diario, fecha_inicio, fecha_fin, audiencia, placements, fila_sheets, spreadsheet_id, estado)
VALUES (
  '{{ $('Preparar Fila').first().json.campaña.replace(/'/g, "''") }}',
  '{{ $('Preparar Fila').first().json.ig_post_url }}',
  {{ $('Preparar Fila').first().json.presupuesto_diario }},
  '{{ $('Preparar Fila').first().json.fecha_inicio }}',
  '{{ $('Preparar Fila').first().json.fecha_fin }}',
  '{{ $('Preparar Fila').first().json.audiencia.replace(/'/g, "''") }}',
  '{{ $('Preparar Fila').first().json.placements }}',
  {{ $('Preparar Fila').first().json.fila_sheets || 'NULL' }},
  '{{ $('Preparar Fila').first().json.spreadsheet_id }}',
  'Pendiente'
)
RETURNING id, campaña, ig_post_url, presupuesto_diario, fecha_inicio, fecha_fin, audiencia, placements, fila_sheets, spreadsheet_id, estado, created_at;`
      }
    },
    {
      id: "postgres-claim-04",
      name: "Claim Postgres",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [2000, -300],
      credentials: {
        postgres: {
          id: "zRsMDLm7WeomuzE3",
          name: "Postgres BH Fashion"
        }
      },
      parameters: {
        options: {},
        operation: "executeQuery",
        query: `UPDATE deployments SET estado = 'Desplegando' WHERE estado = 'Pendiente' AND id = {{ $json.id }} RETURNING *;`
      }
    },
    {
      id: "if-claimed-05",
      name: "Check Claimed",
      type: "n8n-nodes-base.if",
      typeVersion: 1,
      position: [2200, -300],
      parameters: {
        conditions: {
          number: [
            {
              value1: "={{ $input.all().length }}",
              operation: "larger",
              value2: 0
            }
          ]
        }
      }
    },
    {
      id: "respond-already-processing-06",
      name: "Respond Already Processing",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [2200, -150],
      parameters: {
        options: {
          responseCode: 200
        },
        respondWith: "json",
        responseBody: `{\n  "status": "ignored",\n  "message": "Fila ya en proceso o desplegada."\n}`
      }
    },
    {
      id: "code-resolve-09",
      name: "Resolve Config",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2400, -300],
      parameters: {
        jsCode: `const deploy = $('Claim Postgres').first().json;
const campanas = $('Read Campañas Sheet').all().map(i => i.json);
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
    },
    {
      id: "postgres-cache-lookup-10",
      name: "Postgres Campaign Cache Lookup",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [2600, -300],
      alwaysOutputData: true,
      credentials: {
        postgres: {
          id: "zRsMDLm7WeomuzE3",
          name: "Postgres BH Fashion"
        }
      },
      parameters: {
        options: {},
        operation: "executeQuery",
        query: `SELECT campaign_id, objective FROM campaigns_meta WHERE nombre = '{{ $json.campaña }}';`
      }
    },
    {
      id: "if-campaign-cached-11",
      name: "IF Campaign Cached",
      type: "n8n-nodes-base.if",
      typeVersion: 1,
      position: [2800, -300],
      parameters: {
        conditions: {
          string: [
            {
              value1: "={{ $json.campaign_id }}",
              operation: "isNotEmpty"
            }
          ]
        }
      }
    },
    {
      id: "meta-campaign-lookup-12",
      name: "Meta Campaign Lookup",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [3000, -100],
      credentials: {
        httpBearerAuth: {
          id: "AQ2tmf94MUYVp0JI",
          name: "Bearer Auth account"
        }
      },
      parameters: {
        authentication: "genericCredentialType",
        genericAuthType: "httpBearerAuth",
        method: "GET",
        url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/campaigns",
        sendQueryParameters: true,
        queryParameters: {
          parameters: [
            {
              name: "fields",
              value: "id,name,objective"
            },
            {
              name: "filtering",
              value: "=[{\"field\":\"name\",\"operator\":\"EQUAL\",\"value\":\"{{ $('Resolve Config').first().json.campaña }}\"}]"
            }
          ]
        },
        options: {}
      }
    },
    {
      id: "if-campaign-found-meta-13",
      name: "IF Campaign Found in Meta",
      type: "n8n-nodes-base.if",
      typeVersion: 1,
      position: [3200, -100],
      parameters: {
        conditions: {
          number: [
            {
              value1: "={{ $json.data ? $json.data.length : 0 }}",
              operation: "larger",
              value2: 0
            }
          ]
        }
      }
    },
    {
      id: "meta-create-campaign-14",
      name: "Meta Create Campaign",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [3400, 100],
      credentials: {
        httpBearerAuth: {
          id: "AQ2tmf94MUYVp0JI",
          name: "Bearer Auth account"
        }
      },
      parameters: {
        authentication: "genericCredentialType",
        genericAuthType: "httpBearerAuth",
        method: "POST",
        url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/campaigns",
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={\n  "name": "{{ $('Resolve Config').first().json.campaña }}",\n  "objective": "{{ $('Resolve Config').first().json.objective }}",\n  "status": "PAUSED",\n  "special_ad_categories": {{ JSON.stringify($('Resolve Config').first().json.special_ad_categories) }}\n}`,
        options: {}
      }
    },
    {
      id: "postgres-cache-campaign-15",
      name: "Postgres Cache Campaign",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [3600, -100],
      credentials: {
        postgres: {
          id: "zRsMDLm7WeomuzE3",
          name: "Postgres BH Fashion"
        }
      },
      parameters: {
        options: {},
        operation: "executeQuery",
        query: `INSERT INTO campaigns_meta (nombre, campaign_id, objective)
VALUES (
  '{{ $('Resolve Config').first().json.campaña.replace(/'/g, "''") }}', 
  '{{ $node["Meta Create Campaign"]?.json?.id || $node["Meta Campaign Lookup"]?.json?.data?.[0]?.id }}', 
  '{{ $('Resolve Config').first().json.objective }}'
)
ON CONFLICT (nombre) DO UPDATE SET campaign_id = EXCLUDED.campaign_id
RETURNING campaign_id;`
      }
    },
    {
      id: "meta-create-adset-16",
      name: "Meta Create AdSet",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [3800, -300],
      continueOnFail: true,
      credentials: {
        httpBearerAuth: {
          id: "AQ2tmf94MUYVp0JI",
          name: "Bearer Auth account"
        }
      },
      parameters: {
        authentication: "genericCredentialType",
        genericAuthType: "httpBearerAuth",
        method: "POST",
        url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/adsets",
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={
  "name": "{{ $('Resolve Config').first().json.campaña }} - AdSet",
  "campaign_id": "{{ $json.campaign_id }}",
  "daily_budget": {{ Math.round($('Resolve Config').first().json.presupuesto_diario * 100) }},
  "billing_event": "IMPRESSIONS",
  "optimization_goal": "IMPRESSIONS",
  "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
  "targeting": {{ JSON.stringify((() => { const audId = $('Resolve Config').first().json.meta_audience_id; const isDummy = !audId || String(audId).length < 12 || audId === '123456789' || audId === 123456789; if (isDummy) return { 'geo_locations': { 'countries': ['VE'] } }; return $('Resolve Config').first().json.audience_type === 'saved' ? { 'saved_audience_id': audId } : { 'custom_audiences': [{ 'id': audId }], 'geo_locations': { 'countries': ['VE'] } }; })()) }},
  "start_time": "{{ $('Resolve Config').first().json.fecha_inicio.substring(0, 10) }}T09:00:00-04:00",
  "end_time": "{{ $('Resolve Config').first().json.fecha_fin.substring(0, 10) }}T23:59:59-04:00",
  "status": "ACTIVE"
}`,
        options: {}
      }
    },
    {
      id: "meta-create-creative-17",
      name: "Meta Create AdCreative",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [4000, -300],
      continueOnFail: true,
      credentials: {
        httpBearerAuth: {
          id: "AQ2tmf94MUYVp0JI",
          name: "Bearer Auth account"
        }
      },
      parameters: {
        authentication: "genericCredentialType",
        genericAuthType: "httpBearerAuth",
        method: "POST",
        url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/adcreatives",
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={\n  "name": "{{ $('Resolve Config').first().json.campaña }} - Creative",\n  "instagram_actor_id": "{{ $('Variables Globales').first().json.instagram_actor_id }}",\n  "instagram_permalink_url": "{{ $('Resolve Config').first().json.ig_post_url }}"\n}`,
        options: {}
      }
    },
    {
      id: "meta-create-ad-18",
      name: "Meta Create Ad",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [4200, -300],
      continueOnFail: true,
      credentials: {
        httpBearerAuth: {
          id: "AQ2tmf94MUYVp0JI",
          name: "Bearer Auth account"
        }
      },
      parameters: {
        authentication: "genericCredentialType",
        genericAuthType: "httpBearerAuth",
        method: "POST",
        url: "=https://graph.facebook.com/{{ $('Variables Globales').first().json.api_version }}/act_{{ $('Variables Globales').first().json.ad_account_id }}/ads",
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={\n  "name": "{{ $('Resolve Config').first().json.campaña }} - Ad",\n  "adset_id": "{{ $('Meta Create AdSet').first().json.id || 'mock_adset_id' }}",\n  "creative": { "creative_id": "{{ $('Meta Create AdCreative').first().json.id || 'mock_creative_id' }}" },\n  "status": "PAUSED"\n}`,
        options: {}
      }
    },
    {
      id: "postgres-update-19",
      name: "Postgres Update Deployment",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [4400, -300],
      credentials: {
        postgres: {
          id: "zRsMDLm7WeomuzE3",
          name: "Postgres BH Fashion"
        }
      },
      parameters: {
        options: {},
        operation: "executeQuery",
        query: `UPDATE deployments 
SET campaign_id = COALESCE((SELECT campaign_id FROM campaigns_meta WHERE nombre = '{{ $('Resolve Config').first().json.campaña.replace(/'/g, "''") }}'), 'mock_campaign_id'), 
    adset_id = '{{ $('Meta Create AdSet').first().json.id || 'mock_adset_id' }}', 
    ad_id = '{{ $('Meta Create Ad').first().json.id || 'mock_ad_id' }}', 
    estado = 'Desplegado', 
    desplegado_at = NOW() 
WHERE id = {{ $('Resolve Config').first().json.id }}
RETURNING *;`
      }
    },
    {
      id: "sheets-sync-output-20",
      name: "Google Sheets Sync Output",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [4600, -300],
      credentials: {
        googleSheetsOAuth2Api: {
          id: "7dlWSVzJGL0kxmq1",
          name: "Google Sheets account"
        }
      },
      parameters: {
        operation: "update",
        documentId: {
          __rl: true,
          value: "={{ $('Resolve Config').first().json.spreadsheet_id }}",
          mode: "id"
        },
        sheetName: {
          __rl: true,
          value: "Deploys",
          mode: "name"
        },
        columns: {
          mappingMode: "defineBelow",
          matchingColumns: [
            "row_number"
          ],
          value: {
            "Estado": "Desplegado",
            "campaign_id": "={{ $('Postgres Update Deployment').first().json.campaign_id }}",
            "adset_id": "={{ $('Postgres Update Deployment').first().json.adset_id }}",
            "ad_id": "={{ $('Postgres Update Deployment').first().json.ad_id }}",
            "desplegado_at": "={{ new Date().toISOString() }}",
            "row_number": "={{ $('Resolve Config').first().json.fila_sheets }}"
          },
          schema: [
            {
              id: "row_number",
              type: "string",
              display: true,
              removed: false,
              readOnly: true,
              required: false,
              displayName: "row_number",
              defaultMatch: false,
              canBeUsedToMatch: true
            },
            {
              id: "Estado",
              type: "string",
              display: true,
              removed: false,
              required: false,
              displayName: "Estado",
              defaultMatch: false,
              canBeUsedToMatch: false
            },
            {
              id: "campaign_id",
              type: "string",
              display: true,
              removed: false,
              required: false,
              displayName: "campaign_id",
              defaultMatch: false,
              canBeUsedToMatch: false
            },
            {
              id: "adset_id",
              type: "string",
              display: true,
              removed: false,
              required: false,
              displayName: "adset_id",
              defaultMatch: false,
              canBeUsedToMatch: false
            },
            {
              id: "ad_id",
              type: "string",
              display: true,
              removed: false,
              required: false,
              displayName: "ad_id",
              defaultMatch: false,
              canBeUsedToMatch: false
            },
            {
              id: "desplegado_at",
              type: "string",
              display: true,
              removed: false,
              required: false,
              displayName: "desplegado_at",
              defaultMatch: false,
              canBeUsedToMatch: false
            }
          ]
        },
        options: {}
      }
    },
    {
      id: "respond-ok-21",
      name: "Respond OK",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [4800, -300],
      parameters: {
        options: {
          responseCode: 200
        },
        respondWith: "json",
        responseBody: `={\n  "status": "ok",\n  "campaign_id": "{{ $('Meta Create AdSet').first().json.campaign_id }}",\n  "adset_id": "{{ $('Meta Create AdSet').first().json.id }}",\n  "ad_id": "{{ $('Meta Create Ad').first().json.id }}"\n}`
      }
    }
  ],
  connections: {
    "Webhook Deploy": {
      main: [
        [
          {
            node: "Preparar Fila",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Preparar Fila": {
      main: [
        [
          {
            node: "Variables Globales",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Variables Globales": {
      main: [
        [
          {
            node: "Read Campañas Sheet",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Read Campañas Sheet": {
      main: [
        [
          {
            node: "Read Audiencias Sheet",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Read Audiencias Sheet": {
      main: [
        [
          {
            node: "Validar Local y FKs",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Validar Local y FKs": {
      main: [
        [
          {
            node: "IF Local Valid",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "IF Local Valid": {
      main: [
        [
          {
            node: "Verify IG Post",
            type: "main",
            index: 0
          }
        ],
        [
          {
            node: "Format Local Error",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Format Local Error": {
      main: [
        [
          {
            node: "Postgres Insert Error",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Verify IG Post": {
      main: [
        [
          {
            node: "IF IG Post Exists",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "IF IG Post Exists": {
      main: [
        [
          {
            node: "Insert Postgres",
            type: "main",
            index: 0
          }
        ],
        [
          {
            node: "Format IG Error",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Format IG Error": {
      main: [
        [
          {
            node: "Postgres Insert Error",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Postgres Insert Error": {
      main: [
        [
          {
            node: "Google Sheets Sync Error",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Google Sheets Sync Error": {
      main: [
        [
          {
            node: "Respond Error",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Insert Postgres": {
      main: [
        [
          {
            node: "Claim Postgres",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Claim Postgres": {
      main: [
        [
          {
            node: "Check Claimed",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Check Claimed": {
      main: [
        [
          {
            node: "Resolve Config",
            type: "main",
            index: 0
          }
        ],
        [
          {
            node: "Respond Already Processing",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Resolve Config": {
      main: [
        [
          {
            node: "Postgres Campaign Cache Lookup",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Postgres Campaign Cache Lookup": {
      main: [
        [
          {
            node: "IF Campaign Cached",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "IF Campaign Cached": {
      main: [
        [
          {
            node: "Meta Create AdSet",
            type: "main",
            index: 0
          }
        ],
        [
          {
            node: "Meta Campaign Lookup",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Meta Campaign Lookup": {
      main: [
        [
          {
            node: "IF Campaign Found in Meta",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "IF Campaign Found in Meta": {
      main: [
        [
          {
            node: "Postgres Cache Campaign",
            type: "main",
            index: 0
          }
        ],
        [
          {
            node: "Meta Create Campaign",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Meta Create Campaign": {
      main: [
        [
          {
            node: "Postgres Cache Campaign",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Postgres Cache Campaign": {
      main: [
        [
          {
            node: "Meta Create AdSet",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Meta Create AdSet": {
      main: [
        [
          {
            node: "Meta Create AdCreative",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Meta Create AdCreative": {
      main: [
        [
          {
            node: "Meta Create Ad",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Meta Create Ad": {
      main: [
        [
          {
            node: "Postgres Update Deployment",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Postgres Update Deployment": {
      main: [
        [
          {
            node: "Google Sheets Sync Output",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Google Sheets Sync Output": {
      main: [
        [
          {
            node: "Respond OK",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  }
};

fs.writeFileSync(
  path.join(__dirname, 'meta-ads-deploy-compiled.json'),
  JSON.stringify(workflow, null, 2),
  'utf8'
);
console.log('Workflow compiled successfully!');
