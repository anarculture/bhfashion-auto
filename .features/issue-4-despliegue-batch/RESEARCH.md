# Research: Despliegue Batch de Múltiples Filas con Deduplicación y Reintentos

**Issue**: #4
**Estado**: 🔍 En Investigación (Fase 1)
**Fecha**: 2026-05-20
**Rama**: `Issue-4-despliegue-batch`

---

## 1. Entendimiento del problema y objetivos

El objetivo de este issue es de extender el flujo de `meta-ads-deploy` para manejar de manera robusta y eficiente un lote (batch) de $N$ filas enviado por Google Sheets (vía Apps Script), en lugar de procesar una sola fila a la vez.

El comportamiento requerido se divide en dos fases:

### Fase 1: Preparación (Serial, antes del Fan-out)
* **Objetivo**: Evitar condiciones de carrera (*race conditions*) en Meta API cuando múltiples filas pertenecen a la misma campaña nueva.
* **Lógica**:
  1. Extraer los nombres de campaña únicos del payload de filas entrantes.
  2. Iterar en serie sobre cada campaña única:
     - Buscar en la tabla `campaigns_meta` en Postgres.
     - Si no está cacheada, buscar en Meta API.
     - Si no existe en Meta API, crearla y registrar su ID en Postgres (`campaigns_meta`).
  3. Al finalizar esta fase, todas las campañas requeridas tendrán su `campaign_id` resuelto y cacheado en Postgres.

### Fase 2: Despliegue (Paralelo Limitado, $N=5$)
* **Objetivo**: Desplegar los AdSets, Creativos y Ads para cada fila del batch respetando los límites de rate limit de Meta API.
* **Lógica**:
  1. Dividir el conjunto total de filas en lotes de tamaño $N=5$ utilizando el nodo `Split In Batches` de n8n.
  2. Para cada fila del lote de 5 (procesadas concurrentemente por n8n):
     - Validar campos y claves foráneas localmente contra las hojas de Sheets cargadas en memoria.
     - Realizar el claim atómico en Postgres.
     - Verificar la existencia de la URL del post de Instagram en Meta API.
     - Crear el AdSet, AdCreative y Ad en Meta API utilizando el `campaign_id` cacheado en la Fase 1.
     - Si ocurre un error de Rate Limit de Meta (códigos de error `17` o `32`), aplicar un mecanismo de reintento con **backoff exponencial** (30s base, máx. 3 intentos).
     - Si la fila es exitosa, actualizar Postgres a `Desplegado` y Sheets a `Desplegado`.
     - Si la fila falla (después de agotar los reintentos o por error no recuperable), actualizar Postgres a `Error` con su `error_log` y Sheets a `Error`.

---

## 2. Investigación de Archivos y Componentes

### Archivo a Modificar:
* [build_workflow.js](file:///e:/Development/N8NDev/DHfashion/bhfashion-auto/build_workflow.js): 
  Reestructuraremos por completo la definición de nodos y conexiones en este script para compilar el nuevo flujo batch.

### Payload del Webhook (Sheets → n8n):
El webhook recibirá un payload JSON con la estructura:
```json
{
  "spreadsheet_id": "18f9...",
  "filas": [
    {
      "campaña": "Camp A",
      "ig_post_url": "https://...",
      "presupuesto_diario": 10,
      "fecha_inicio": "2026-05-20",
      "fecha_fin": "2026-05-27",
      "audiencia": "Aud X",
      "placements": "automatic",
      "fila_sheets": 2
    },
    ...
  ]
}
```

### Endpoints y Códigos de Error de Meta:
* **Error 17**: User request limit reached.
* **Error 32**: Page request limit reached.
* Ambos errores indican rate limit superado y dispararán el backoff exponencial:
  $$\text{Wait Time} = 30 \times 2^{\text{retries} - 1} \text{ segundos}$$
  * Intento 1: 30s
  * Intento 2: 60s
  * Intento 3: 120s

---

## 3. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Pérdida de Estado del Reintento** | Si la respuesta HTTP de error sobrescribe el JSON del item en n8n, perderemos el contador de reintentos actual. | Utilizar nodos tipo Code intermedios (`Prepare Input`) antes de las llamadas a Meta para inyectar y persistir el estado de `retries` en la tubería del item. Referenciar este estado con `$('Prepare Input').item.json.retries`. |
| **Bloqueo del Batch por Fila Fallida** | Que una fila que falle detenga la ejecución de todo el lote de 5 o del lote completo de $N$ filas. | Utilizar el comportamiento de bifurcación nativo de n8n. Configurar `continueOnFail: true` en las llamadas HTTP a Meta y manejar las fallas a nivel de item individual, de modo que las filas exitosas sigan su flujo normal y las fallas se desvíen al registro de errores sin detener a las demás. |
| **Race Conditions en la Creación de Campañas** | Si dos hilos de despliegue en paralelo intentan crear la misma campaña al mismo tiempo en Meta, se generará un duplicado. | La Fase 1 de preparación serial garantiza que no haya llamadas concurrentes para una misma campaña. Cuando la Fase 2 comience, el ID de la campaña ya estará asegurado en Postgres. |

---

## 4. Estimación de Esfuerzo

* **Fase 1: Research (Investigación)**: ~30 minutos (Completado).
* **Fase 2: Plan (Planificación)**: ~45 minutos.
* **Fase 3: Implement (Implementación)**: ~90 minutos.
* **Validación y Pruebas**: ~45 minutos.
* **Esfuerzo Total Estimado**: **~3.5h**
