const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// Builder helpers
// ─────────────────────────────────────────────────────────────
const nodes = [];
const connections = {};

function addNode(node) {
  nodes.push(node);
  return node.name;
}

function connect(from, to, fromOutput = 0, toInput = 0) {
  if (!connections[from]) connections[from] = { main: [] };
  while (connections[from].main.length <= fromOutput) {
    connections[from].main.push([]);
  }
  connections[from].main[fromOutput].push({ node: to, type: 'main', index: toInput });
}

// ─────────────────────────────────────────────────────────────
// 1. Schedule Trigger — 08:00 y 20:00 hora Caracas (UTC-4)
//    En cron UTC: 12:00 y 00:00 UTC
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'schedule-metrics',
  name: 'Schedule Trigger',
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [0, 0],
  parameters: {
    rule: {
      interval: [
        { field: 'cronExpression', expression: '0 12 * * *' }, // 08:00 Caracas
        { field: 'cronExpression', expression: '0 0 * * *' }   // 20:00 Caracas
      ]
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Variables Globales
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'global-vars',
  name: 'Variables Globales',
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position: [200, 0],
  parameters: {
    assignments: {
      assignments: [
        { id: 'acc-id',  name: 'ad_account_id',       type: 'string', value: '988429123910411' },
        { id: 'api-v',   name: 'api_version',          type: 'string', value: 'v25.0' }
      ]
    },
    includeOtherFields: true,
    options: {}
  }
});

// ─────────────────────────────────────────────────────────────
// 3. Postgres: Get Active Ads
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'postgres-get-ads',
  name: 'Get Active Ads',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.6,
  position: [400, 0],
  credentials: { postgres: { id: 'zRsMDLm7WeomuzE3', name: 'Postgres BH Fashion' } },
  parameters: {
    options: {},
    operation: 'executeQuery',
    query: "SELECT ad_id FROM deployments WHERE estado = 'Desplegado' AND ad_id IS NOT NULL;"
  }
});

// ─────────────────────────────────────────────────────────────
// 4. IF: ¿Hay Ads Activos?
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'if-has-ads',
  name: 'IF Hay Ads Activos',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [600, 0],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [
        {
          id: 'has-ads-cond',
          leftValue: '={{ $input.all().length }}',
          rightValue: 0,
          operator: { type: 'number', operation: 'gt' }
        }
      ],
      combinator: 'and'
    },
    options: {}
  }
});

// ─────────────────────────────────────────────────────────────
// 5. Sin Ads — termina limpiamente
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'noop-sin-ads',
  name: 'Sin Ads Activos',
  type: 'n8n-nodes-base.noOp',
  typeVersion: 1,
  position: [800, 200]
});

// ─────────────────────────────────────────────────────────────
// 6. Split In Batches (N=5)
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'split-ads',
  name: 'Split Ads',
  type: 'n8n-nodes-base.splitInBatches',
  typeVersion: 3,
  position: [800, -200],
  parameters: {
    batchSize: 5,
    options: {}
  }
});

// ─────────────────────────────────────────────────────────────
// 7. Preparar Request — inyecta contexto en el item
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'prep-request',
  name: 'Preparar Request',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1000, -200],
  parameters: {
    jsCode: `return $input.all().map(item => ({
  json: {
    ad_id: item.json.ad_id,
    captured_at: new Date().toISOString(),
    api_version: $('Variables Globales').first().json.api_version
  }
}));`
  }
});

// ─────────────────────────────────────────────────────────────
// 8. Meta Insights — TODAY
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'http-insights-today',
  name: 'Meta Insights TODAY',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1200, -350],
  continueOnFail: true,
  credentials: { httpBearerAuth: { id: 'AQ2tmf94MUYVp0JI', name: 'Bearer Auth account' } },
  parameters: {
    authentication: 'genericCredentialType',
    genericAuthType: 'httpBearerAuth',
    method: 'GET',
    url: '=https://graph.facebook.com/{{ $json.api_version }}/{{ $json.ad_id }}/insights',
    sendQueryParameters: true,
    queryParameters: {
      parameters: [
        { name: 'fields', value: 'spend,impressions,inline_link_clicks,actions,action_values,frequency,reach' },
        { name: 'date_preset', value: 'today' }
      ]
    },
    options: {}
  }
});

// ─────────────────────────────────────────────────────────────
// 9. Normalizar Today
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'normalize-today',
  name: 'Normalizar Today',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1400, -350],
  parameters: {
    jsCode: `const raw = $input.first().json;
const orig = $('Preparar Request').item.json;

const insights = (raw.data && raw.data[0]) ? raw.data[0] : {};
const actions = insights.actions || [];
const actionValues = insights.action_values || [];

const purchaseCount = actions.find(a => a.action_type === 'purchase');
const purchaseValue = actionValues.find(a => a.action_type === 'purchase');

return {
  json: {
    ad_id: orig.ad_id,
    captured_at: orig.captured_at,
    window: 'today',
    spend: parseFloat(insights.spend || 0),
    impressions: parseInt(insights.impressions || 0),
    inline_link_clicks: parseInt(insights.inline_link_clicks || 0),
    purchases_count: purchaseCount ? parseInt(purchaseCount.value) : 0,
    purchases_value: purchaseValue ? parseFloat(purchaseValue.value) : 0,
    frequency: parseFloat(insights.frequency || 0),
    reach: parseInt(insights.reach || 0),
    raw_insights: raw.error ? { error: raw.error.message || 'Meta API error' } : raw
  }
};`
  }
});

// ─────────────────────────────────────────────────────────────
// 10. Postgres INSERT — today
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'postgres-insert-today',
  name: 'Insert Snapshot TODAY',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.6,
  position: [1600, -350],
  credentials: { postgres: { id: 'zRsMDLm7WeomuzE3', name: 'Postgres BH Fashion' } },
  parameters: {
    options: {},
    operation: 'executeQuery',
    query: `INSERT INTO metrics_snapshots
  (ad_id, captured_at, "window", spend, impressions, inline_link_clicks,
   purchases_count, purchases_value, frequency, reach, raw_insights)
VALUES (
  '{{ $json.ad_id }}',
  '{{ $json.captured_at }}',
  '{{ $json.window }}',
  {{ $json.spend }},
  {{ $json.impressions }},
  {{ $json.inline_link_clicks }},
  {{ $json.purchases_count }},
  {{ $json.purchases_value }},
  {{ $json.frequency }},
  {{ $json.reach }},
  '{{ JSON.stringify($json.raw_insights).replace(/'/g, "''") }}'::jsonb
)
ON CONFLICT (ad_id, captured_at, "window") DO NOTHING;`
  }
});

// ─────────────────────────────────────────────────────────────
// 11. Meta Insights — LAST_7D
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'http-insights-7d',
  name: 'Meta Insights LAST_7D',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1200, -50],
  continueOnFail: true,
  credentials: { httpBearerAuth: { id: 'AQ2tmf94MUYVp0JI', name: 'Bearer Auth account' } },
  parameters: {
    authentication: 'genericCredentialType',
    genericAuthType: 'httpBearerAuth',
    method: 'GET',
    url: '=https://graph.facebook.com/{{ $json.api_version }}/{{ $json.ad_id }}/insights',
    sendQueryParameters: true,
    queryParameters: {
      parameters: [
        { name: 'fields', value: 'spend,impressions,inline_link_clicks,actions,action_values,frequency,reach' },
        { name: 'date_preset', value: 'last_7d' }
      ]
    },
    options: {}
  }
});

// ─────────────────────────────────────────────────────────────
// 12. Normalizar Last7d
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'normalize-7d',
  name: 'Normalizar Last7d',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1400, -50],
  parameters: {
    jsCode: `const raw = $input.first().json;
const orig = $('Preparar Request').item.json;

const insights = (raw.data && raw.data[0]) ? raw.data[0] : {};
const actions = insights.actions || [];
const actionValues = insights.action_values || [];

const purchaseCount = actions.find(a => a.action_type === 'purchase');
const purchaseValue = actionValues.find(a => a.action_type === 'purchase');

return {
  json: {
    ad_id: orig.ad_id,
    captured_at: orig.captured_at,
    window: 'last_7d',
    spend: parseFloat(insights.spend || 0),
    impressions: parseInt(insights.impressions || 0),
    inline_link_clicks: parseInt(insights.inline_link_clicks || 0),
    purchases_count: purchaseCount ? parseInt(purchaseCount.value) : 0,
    purchases_value: purchaseValue ? parseFloat(purchaseValue.value) : 0,
    frequency: parseFloat(insights.frequency || 0),
    reach: parseInt(insights.reach || 0),
    raw_insights: raw.error ? { error: raw.error.message || 'Meta API error' } : raw
  }
};`
  }
});

// ─────────────────────────────────────────────────────────────
// 13. Postgres INSERT — last_7d
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'postgres-insert-7d',
  name: 'Insert Snapshot LAST_7D',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.6,
  position: [1600, -50],
  credentials: { postgres: { id: 'zRsMDLm7WeomuzE3', name: 'Postgres BH Fashion' } },
  parameters: {
    options: {},
    operation: 'executeQuery',
    query: `INSERT INTO metrics_snapshots
  (ad_id, captured_at, "window", spend, impressions, inline_link_clicks,
   purchases_count, purchases_value, frequency, reach, raw_insights)
VALUES (
  '{{ $json.ad_id }}',
  '{{ $json.captured_at }}',
  '{{ $json.window }}',
  {{ $json.spend }},
  {{ $json.impressions }},
  {{ $json.inline_link_clicks }},
  {{ $json.purchases_count }},
  {{ $json.purchases_value }},
  {{ $json.frequency }},
  {{ $json.reach }},
  '{{ JSON.stringify($json.raw_insights).replace(/'/g, "''") }}'::jsonb
)
ON CONFLICT (ad_id, captured_at, "window") DO NOTHING;`
  }
});

// ─────────────────────────────────────────────────────────────
// 14. Ad Completado — NoOp de cierre por ad (loop back)
// ─────────────────────────────────────────────────────────────
addNode({
  id: 'ad-completed',
  name: 'Ad Completado',
  type: 'n8n-nodes-base.noOp',
  typeVersion: 1,
  position: [1800, -200]
});

// ─────────────────────────────────────────────────────────────
// Connections
// ─────────────────────────────────────────────────────────────
connect('Schedule Trigger',       'Variables Globales');
connect('Variables Globales',     'Get Active Ads');
connect('Get Active Ads',         'IF Hay Ads Activos');
connect('IF Hay Ads Activos',     'Split Ads',         0); // true → hay ads
connect('IF Hay Ads Activos',     'Sin Ads Activos',   1); // false → vacío
connect('Split Ads',              'Preparar Request',  1); // output 1 = items batch
connect('Preparar Request',       'Meta Insights TODAY');
connect('Preparar Request',       'Meta Insights LAST_7D');
connect('Meta Insights TODAY',    'Normalizar Today');
connect('Normalizar Today',       'Insert Snapshot TODAY');
connect('Insert Snapshot TODAY',  'Ad Completado');
connect('Meta Insights LAST_7D',  'Normalizar Last7d');
connect('Normalizar Last7d',      'Insert Snapshot LAST_7D');
connect('Insert Snapshot LAST_7D','Ad Completado');
connect('Ad Completado',          'Split Ads');          // loop back

// ─────────────────────────────────────────────────────────────
// Compile
// ─────────────────────────────────────────────────────────────
const workflow = {
  id: 'mEtRiCs-BHf-01',
  name: 'meta-ads-metrics',
  active: true,
  nodes,
  connections
};

const outPath = path.join(__dirname, 'meta-ads-metrics-compiled.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Workflow compiled: meta-ads-metrics-compiled.json');
