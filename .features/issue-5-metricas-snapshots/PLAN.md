# Plan: Pilar 5 — Extracción de métricas: snapshots 2x/día en Postgres

**Issue**: #5
**Estado**: 📝 En Planificación (Fase 2)
**Fecha**: 2026-05-20
**Rama**: `Issue-5-metricas-snapshots`

---

## 1. Goal Description

Crear el workflow `meta-ads-metrics` en n8n mediante un nuevo script compilador `build_metrics_workflow.js`. El workflow corre 2 veces/día, consulta Meta API por cada ad activo y persiste snapshots históricos en Postgres.

**Principio HTMK:** Cambios quirúrgicos. `build_workflow.js` (deploy) **no se toca**. Se crea un archivo nuevo e independiente.

---

## 2. User Review Required

> [!NOTE]
> El workflow usa `continueOnFail: true` en las llamadas HTTP a Meta para que un ad con error no detenga el procesamiento de los demás. El error se registra en `raw_insights` como `{ "error": "..." }` y los campos numéricos quedan en `0`.

> [!IMPORTANT]
> El INSERT usa `ON CONFLICT DO NOTHING` sobre la PK `(ad_id, captured_at, window)`. Si el workflow se ejecuta manualmente más de una vez en el mismo minuto, el segundo run no insertará duplicados — simplemente no hará nada.

---

## 3. Open Questions

Ninguna. Los criterios de aceptación del Issue #5 están completamente especificados.

---

## 4. Proposed Changes

### [NEW] `build_metrics_workflow.js`

Script Node.js con patrón Builder. Compila el workflow `meta-ads-metrics` y lo escribe en `meta-ads-metrics-compiled.json`.

#### Secuencia de Nodos

```
Schedule Trigger (08:00 y 20:00 UTC-4)
  → Variables Globales (ad_account_id, api_version, instagram_actor_id)
  → Postgres: Get Active Ads
    (SELECT ad_id FROM deployments WHERE estado = 'Desplegado')
  → IF: Hay Ads Activos?
      [No] → NoOp: Sin Ads (termina limpiamente)
      [Sí] → Split In Batches (N=5)
               → Code: Preparar Request (inyecta ad_id + retries=0)
               → HTTP: Meta Insights TODAY
                 (GET /<ad_id>/insights?date_preset=today, continueOnFail=true)
               → Code: Normalizar Today
                 (parsea campos, extrae purchase de actions/action_values)
               → Postgres: INSERT snapshot (ventana today, ON CONFLICT DO NOTHING)
               → HTTP: Meta Insights LAST_7D
                 (GET /<ad_id>/insights?date_preset=last_7d, continueOnFail=true)
               → Code: Normalizar Last7d
               → Postgres: INSERT snapshot (ventana last_7d, ON CONFLICT DO NOTHING)
               → [volver a Split In Batches]
```

#### Nodo `Normalizar Today` / `Normalizar Last7d` — Lógica clave

```javascript
// Recibe: { ad_id, data: [...] } de Meta API (o error)
const adId = $('Preparar Request').item.json.ad_id;
const now = new Date().toISOString();
const window = 'today'; // o 'last_7d'

const raw = $input.first().json;
const insights = (raw.data && raw.data[0]) ? raw.data[0] : {};

const actions = insights.actions || [];
const actionValues = insights.action_values || [];

const purchaseCount = actions.find(a => a.action_type === 'purchase');
const purchaseValue = actionValues.find(a => a.action_type === 'purchase');

return {
  json: {
    ad_id: adId,
    captured_at: now,
    window: window,
    spend: parseFloat(insights.spend || 0),
    impressions: parseInt(insights.impressions || 0),
    inline_link_clicks: parseInt(insights.inline_link_clicks || 0),
    purchases_count: purchaseCount ? parseInt(purchaseCount.value) : 0,
    purchases_value: purchaseValue ? parseFloat(purchaseValue.value) : 0,
    frequency: parseFloat(insights.frequency || 0),
    reach: parseInt(insights.reach || 0),
    raw_insights: raw
  }
};
```

#### Nodo Postgres INSERT (ambas ventanas)

```sql
INSERT INTO metrics_snapshots
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
  '{{ JSON.stringify($json.raw_insights) }}'::jsonb
)
ON CONFLICT (ad_id, captured_at, "window") DO NOTHING;
```

---

### [NEW] `meta-ads-metrics-compiled.json`

Output del compilador. Generado automáticamente con `node build_metrics_workflow.js`.

---

## 5. Verification Plan

### Test Gate 1: Compilación sin errores
```bash
node build_metrics_workflow.js
# Esperado: "Workflow compiled: meta-ads-metrics-compiled.json"
# Esperado: archivo JSON válido generado
```

### Test Gate 2: Workflow vacío (0 ads activos)
- **Acción**: Importar JSON en n8n. Ejecutar manualmente con la tabla `deployments` vacía o sin ningún `estado='Desplegado'`.
- **Esperado**: El nodo `IF: Hay Ads Activos?` toma la rama `No` → `Sin Ads` → workflow termina con estado ✅ sin errores.

### Test Gate 3: Snapshot completo con ad real
- **Acción**: Asegurar que hay al menos 1 `ad_id` con `estado='Desplegado'` en Postgres. Ejecutar workflow manualmente.
- **Esperado**:
  - Se insertan exactamente **2 rows** en `metrics_snapshots` para ese `ad_id` (una `today`, una `last_7d`).
  - `raw_insights` contiene el JSON completo retornado por Meta.
  - Verificar con: `SELECT * FROM metrics_snapshots WHERE ad_id = '<el_id>' ORDER BY captured_at DESC LIMIT 2;`

### Test Gate 4: Tolerancia a ad sin impresiones
- **Acción**: Usar un `ad_id` real pero muy reciente (0 impresiones). Meta retorna `data: []`.
- **Esperado**: Se inserta la row con `spend=0, impressions=0, purchases_count=0`, etc. El workflow **no falla**.

### Test Gate 5: Prevención de duplicados
- **Acción**: Ejecutar el workflow dos veces seguidas (dentro del mismo minuto).
- **Esperado**: La segunda ejecución no lanza error. `SELECT COUNT(*) FROM metrics_snapshots` muestra el mismo número de rows que tras la primera ejecución.
