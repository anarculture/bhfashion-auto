# Plan: Despliegue Single Happy Path (1 Fila → 1 Ad Boost)

**Issue**: #2
**Estado**: 📝 En Planificación (Fase 2)
**Fecha**: 2026-05-19

---

## Pre-condiciones

- [x] Base de datos Postgres ejecutándose y tablas creadas.
- [x] n8n ejecutándose localmente y MCP listo para interactuar.
- [x] Credenciales registradas en n8n:
  - `Postgres BH Fashion` (`zRsMDLm7WeomuzE3`)
  - `Bearer Auth account` (`AQ2tmf94MUYVp0JI`) (Token de System User)
  - `Google Sheets account` (`7dlWSVzJGL0kxmq1`)

---

## Propuesta de Nodos en n8n (`meta-ads-deploy`)

El workflow base `meta-ads-deploy` (que modificará el actual `meta-ads-echo`) estructurará el flujo de ejecución en una cadena lineal y condicional robusta para procesar la fila recibida.

### Paso 1: Recepción & Claim Atómico
1. **Webhook Deploy** (Trigger): POST a `/webhook/meta-ads-deploy`.
2. **Preparar Fila (Code)**: Toma `body.filas[0]` y extrae los campos de entrada:
   ```javascript
   const body = $input.first().json.body;
   const fila = body.filas[0];
   return {
     json: {
       campaña: fila.campaña,
       ig_post_url: fila.ig_post_url,
       presupuesto_diario: Number(fila.presupuesto_diario),
       fecha_inicio: fila.fecha_inicio,
       fecha_fin: fila.fecha_fin,
       audiencia: fila.audiencia,
       placements: fila.placements || 'automatic',
       fila_sheets: fila.fila_sheets,
       spreadsheet_id: body.spreadsheet_id
     }
   };
   ```
3. **Insert Postgres (Postgres)**: Inserta la fila en Postgres con estado `Pendiente`.
   - Consulta:
     ```sql
     INSERT INTO deployments (campaña, ig_post_url, presupuesto_diario, fecha_inicio, fecha_fin, audiencia, placements, fila_sheets, spreadsheet_id, estado)
     VALUES ('{{ $json.campaña }}', '{{ $json.ig_post_url }}', {{ $json.presupuesto_diario }}, '{{ $json.fecha_inicio }}', '{{ $json.fecha_fin }}', '{{ $json.audiencia }}', '{{ $json.placements }}', {{ $json.fila_sheets }}, '{{ $json.spreadsheet_id }}', 'Pendiente')
     RETURNING id, campaña, ig_post_url, presupuesto_diario, fecha_inicio, fecha_fin, audiencia, placements, fila_sheets, spreadsheet_id;
     ```
4. **Claim Postgres (Postgres)**: Intenta reclamar la fila cambiando su estado a `Desplegando` atómicamente.
   - Consulta:
     ```sql
     UPDATE deployments
     SET estado = 'Desplegando'
     WHERE estado = 'Pendiente' AND id = {{ $json.id }}
     RETURNING *;
     ```
5. **Check Claim (Switch/If)**: Si la consulta anterior retorna 0 filas, aborta silenciosamente el workflow (evitando ejecuciones dobles).

### Paso 2: Resolución de Datos Auxiliares (Spreadsheet)
6. **Read Campañas Sheet (Google Sheets)**: Obtiene todos los registros de la hoja `Campañas` usando `spreadsheet_id`.
7. **Read Audiencias Sheet (Google Sheets)**: Obtiene todos los registros de la hoja `Audiencias` usando `spreadsheet_id`.
8. **Resolve Config (Code)**: Cruza la fila del deploy con la información de las hojas para obtener el `objective` (de Campañas) y la `meta_audience_id` junto con su `tipo` (de Audiencias).
   - Lógica:
     ```javascript
     const deploy = $('Claim Postgres').first().json;
     const campañas = $('Read Campañas Sheet').all().map(i => i.json);
     const audiencias = $('Read Audiencias Sheet').all().map(i => i.json);

     const campañaConfig = campañas.find(c => c.nombre === deploy.campaña) || { objective: 'OUTCOME_SALES', special_ad_categories: '[]' };
     const audienciaConfig = audiencias.find(a => a.alias === deploy.audiencia);

     if (!audienciaConfig) {
       throw new Error(`Audiencia no encontrada en la hoja para el alias: ${deploy.audiencia}`);
     }

     return {
       json: {
         ...deploy,
         objective: campañaConfig.objective,
         special_ad_categories: JSON.parse(campañaConfig.special_ad_categories || '[]'),
         meta_audience_id: audienciaConfig.meta_audience_id,
         audience_type: audienciaConfig.tipo
       }
     };
     ```

### Paso 3: Resolución de Campaña (Postgres -> Meta GET -> Meta POST)
9. **Postgres Campaign Cache Lookup (Postgres)**:
   - Consulta: `SELECT campaign_id, objective FROM campaigns_meta WHERE nombre = '{{ $json.campaña }}';`
10. **IF Campaign Cached (If)**: ¿Se encontró en la caché de Postgres?
    - **Sí**: Continuar directamente con el `campaign_id` de Postgres.
    - **No**:
      11. **Meta Campaign Lookup (HTTP Request)**:
          - URL: `https://graph.facebook.com/v25.0/act_5314378785280789/campaigns`
          - Parámetros: `fields=id,name,objective`, `filtering=[{"field":"name","operator":"EQUAL","value":"{{ $('Resolve Config').first().json.campaña }}"}]`
      12. **IF Campaign Found in Meta (If)**: ¿Se encontró la campaña en Meta?
          - **Sí**: Usar `id` de la campaña.
          - **No**:
            13. **Meta Create Campaign (HTTP Request)**:
                - URL: `https://graph.facebook.com/v25.0/act_5314378785280789/campaigns`
                - Body:
                  ```json
                  {
                    "name": "{{ $('Resolve Config').first().json.campaña }}",
                    "objective": "{{ $('Resolve Config').first().json.objective }}",
                    "status": "PAUSED",
                    "special_ad_categories": {{ JSON.stringify($('Resolve Config').first().json.special_ad_categories) }},
                    "is_adset_budget_sharing_enabled": false
                  }
                  ```
      14. **Postgres Cache Campaign (Postgres)**: Guarda en cache local la campaña resuelta (ya sea encontrada en Meta o recién creada).
          - Consulta:
            ```sql
            INSERT INTO campaigns_meta (nombre, campaign_id, objective)
            VALUES ('{{ $('Resolve Config').first().json.campaña }}', '{{ $json.id }}', '{{ $('Resolve Config').first().json.objective }}')
            ON CONFLICT (nombre) DO NOTHING;
            ```

### Paso 4: Despliegue en Meta (AdSet → Creative → Ad)
15. **Meta Create AdSet (HTTP Request)**:
    - URL: `https://graph.facebook.com/v25.0/act_5314378785280789/adsets`
    - Body (Generado mediante Javascript en expresión para bifurcar según tipo de audiencia):
      ```javascript
      const config = $('Resolve Config').first().json;
      const campaignId = $('Postgres Campaign Cache Lookup').first().json.campaign_id || $node['Postgres Cache Campaign'].json.campaign_id || $node['Meta Create Campaign'].json.id || $node['Meta Campaign Lookup'].json.data[0].id;
      
      const payload = {
        name: `${config.campaña} - AdSet`,
        campaign_id: campaignId,
        daily_budget: Math.round(config.presupuesto_diario * 100),
        billing_event: "IMPRESSIONS",
        optimization_goal: "IMPRESSIONS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        automatic_placements: true,
        start_time: `${config.fecha_inicio}T09:00:00-04:00`,
        end_time: `${config.fecha_fin}T23:59:59-04:00`,
        status: "ACTIVE"
      };

      if (config.audience_type === 'saved') {
        payload.saved_audience_id = config.meta_audience_id;
      } else {
        payload.targeting = {
          custom_audiences: [{ id: config.meta_audience_id }]
        };
      }
      return payload;
      ```
16. **Meta Create AdCreative (HTTP Request)**:
    - URL: `https://graph.facebook.com/v25.0/act_5314378785280789/adcreatives`
    - Body:
      ```json
      {
        "name": "{{ $('Resolve Config').first().json.campaña }} - Creative",
        "instagram_actor_id": "17841408634629405",
        "instagram_permalink_url": "{{ $('Resolve Config').first().json.ig_post_url }}"
      }
      ```
17. **Meta Create Ad (HTTP Request)**:
    - URL: `https://graph.facebook.com/v25.0/act_5314378785280789/ads`
    - Body:
      ```json
      {
        "name": "{{ $('Resolve Config').first().json.campaña }} - Ad",
        "adset_id": "{{ $('Meta Create AdSet').first().json.id }}",
        "creative": { "creative_id": "{{ $('Meta Create AdCreative').first().json.id }}" },
        "status": "PAUSED"
      }
      ```

### Paso 5: Sincronización y Respuesta
18. **Postgres Update Deployment (Postgres)**:
    - Consulta:
      ```sql
      UPDATE deployments 
      SET campaign_id = '{{ $('Meta Create AdSet').first().json.campaign_id }}', 
          adset_id = '{{ $('Meta Create AdSet').first().json.id }}', 
          ad_id = '{{ $('Meta Create Ad').first().json.id }}', 
          estado = 'Desplegado', 
          desplegado_at = NOW() 
      WHERE id = {{ $('Resolve Config').first().json.id }};
      ```
19. **Google Sheets Sync Output (Google Sheets)**:
    - Método: Update Row
    - Lógica: Escribe en la fila `fila_sheets` del archivo `spreadsheet_id` en la hoja `Deploys`.
    - Columnas actualizadas:
      - `Estado`: `"Desplegado"`
      - `campaign_id`: `{{ $('Meta Create AdSet').first().json.campaign_id }}`
      - `adset_id`: `{{ $('Meta Create AdSet').first().json.id }}`
      - `ad_id`: `{{ $('Meta Create Ad').first().json.id }}`
      - `desplegado_at`: `{{ new Date().toISOString() }}`
20. **Respond OK (Respond to Webhook)**: Retorna HTTP 200 con los IDs creados.

---

## Verification Plan (Test Gates)

### Test Gate 1: Reclamo Atómico
- **Acción**: Forzar ejecuciones concurrentes de deploy para la misma fila.
- **Validación**: Verificar que una ejecución pase y la segunda finalice de inmediato de forma silenciosa debido al query de UPDATE (retornando 0 filas).

### Test Gate 2: Reutilización de Campaña (Caché local)
- **Acción**: Desplegar una fila con un nombre de campaña existente en Postgres `campaigns_meta`.
- **Validación**: El nodo `Postgres Campaign Cache Lookup` debe tener éxito y el flujo debe omitir todas las llamadas de búsqueda y creación de campaña a Meta API, reutilizando directamente el ID de campaña.

### Test Gate 3: Lookup en Meta API
- **Acción**: Simular que no existe en caché local pero sí existe en Meta Ads Manager.
- **Validación**: `Meta Campaign Lookup` debe retornar el ID, guardarlo en la base de Postgres e inyectarlo en el AdSet sin crear duplicados.

### Test Gate 4: Diferenciación de Audiencia (Saved vs Custom)
- **Acción**: Ejecutar una prueba usando audiencia tipo `saved` (debe inyectar `saved_audience_id` a nivel raíz) y otra usando tipo `custom` (debe inyectar `targeting.custom_audiences` en el JSON).
- **Validación**: Validar los payloads HTTP correspondientes que se envían a Meta.

### Test Gate 5: End-to-End Test (E2E)
- **Acción**: Desde el Google Sheets de pruebas, seleccionar un post real y hacer clic en **BH Ads → Desplegar Marcadas**.
- **Validación**:
  - Verificar que el Ad aparezca en Meta Ads Manager con `status: PAUSED`.
  - Confirmar que los IDs de Campaign, AdSet y Ad se escriban correctamente en Postgres.
  - Comprobar que la fila de Google Sheets se desmarque y actualice su estado a `Desplegado` con los 3 IDs correspondientes.

---

## Resumen de secuencia de implementación

1. **Modificar Workflow en n8n**: Reemplazar e importar el nuevo JSON modificado de `meta-ads-deploy`.
2. **Probar localmente** con payloads de prueba via `curl` simulando el trigger de Apps Script.
3. **Ejecutar E2E completo** utilizando el menú custom desde Google Sheets de prueba.

---

**Decision**: [ ] GO  [ ] NO-GO  [ ] NEEDS CLARIFICATION
