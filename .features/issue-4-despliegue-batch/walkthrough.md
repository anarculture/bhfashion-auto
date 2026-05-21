# Walkthrough: Despliegue Batch de Múltiples Filas con Deduplicación y Reintentos

**Issue**: #4
**Estado**: 🚀 Listo para Pruebas
**Fecha**: 2026-05-20
**Rama**: `Issue-4-despliegue-batch`

---

## 1. Cambios Realizados

Hemos reestructurado por completo la compilación del workflow de n8n ([build_workflow.js](../../build_workflow.js)) utilizando un patrón de diseño **Builder** en Node.js, reduciendo drásticamente la duplicación y mejorando la mantenibilidad.

### Principales Mejoras de Arquitectura:
1. **Lectura Eficiente de Hojas de Sheets**:
   - Los nodos `Read Campañas Sheet` y `Read Audiencias Sheet` ahora se ejecutan una única vez al inicio global (inmediatamente después del Webhook) en lugar de hacerlo por cada fila. Sus datos quedan cargados en memoria y son accesibles por expresión en cualquier nodo del flujo.

2. **Fase 1: Preparación Serial de Campañas (Loop N=1)**:
   - Se implementó el nodo Code `Extraer Campañas Únicas` que obtiene la lista deduplicada de campañas del lote.
   - Se ejecuta un loop serial (tamaño de lote 1) que consulta la caché Postgres (`campaigns_meta`), y si no está, busca en Meta API, la crea si hace falta y la cachea. Esto evita condiciones de carrera.

3. **Fase 2: Despliegue Paralelo Limitado (Loop N=5)**:
   - Se implementó el nodo `Preparar Filas Deploy` que extrae las filas originales del payload del Webhook.
   - Se usa un nodo `Split In Batches` configurado con tamaño de lote **5**, permitiendo que n8n ejecute la validación, claims y llamadas a Meta concurrentemente para 5 filas a la vez.

4. **Mecanismo de Reintentos Aislado (Backoff Exponencial)**:
   - Cada llamada crítica a Meta (AdSet, Creative y Ad) posee `continueOnFail: true` para que los errores no rompan el lote.
   - Los nodos Code `Prepare AdSet/Creative/Ad Input` inyectan y mantienen el contador de reintentos en la tubería del item.
   - Si se detecta un error de rate limit (código 17 o 32), el nodo `Increment Retry Count` calcula el tiempo de espera exponencial:
     $$\text{Espera} = 30 \times 2^{\text{intentos} - 1} \text{ segundos}$$
     y redirige el item a un nodo `Wait` dinámico antes de volver a intentar la creación, hasta un límite de 3 intentos por recurso.
   - Si falla en el tercer intento o si el error es de otra categoría (ej. validación), la fila se desvía a la ruta de error, registrándose en Postgres y Google Sheets sin detener las demás filas.

---

## 2. Test Gates Verificados

### ✅ Test Gate 1: Compilación Exitosa del Workflow
Ejecutamos con éxito en el entorno local:
```bash
node build_workflow.js
```
El compilador generó el JSON estructurado `meta-ads-deploy-compiled.json` sin errores de sintaxis ni de lógica de conexiones.

---

## 3. Guía de Pruebas Manuales (E2E)

Para realizar la validación final del workflow, sigue estos pasos:

1. **Importar el Workflow en n8n**:
   - Abre tu instancia de n8n.
   - Crea un nuevo workflow vacío.
   - Haz clic en los tres puntos de la esquina superior derecha y selecciona **Import from File**.
   - Sube el archivo compilado [meta-ads-deploy-compiled.json](../../meta-ads-deploy-compiled.json).

2. **Simular Payload de Webhook de Entrada**:
   Usa una herramienta como Postman, cURL, o la misma interfaz de pruebas de n8n para enviar un POST al Webhook con el siguiente body JSON (que simula 3 filas de despliegue con deduplicación y errores mixtos):

```json
{
  "spreadsheet_id": "18f9hDq_...", 
  "filas": [
    {
      "campaña": "Campaña Batch A",
      "ig_post_url": "https://www.instagram.com/p/C67c29vM_xy/",
      "presupuesto_diario": 10,
      "fecha_inicio": "2026-05-20",
      "fecha_fin": "2026-05-27",
      "audiencia": "AudX_Alias",
      "placements": "automatic",
      "fila_sheets": 2
    },
    {
      "campaña": "Campaña Batch A",
      "ig_post_url": "https://www.instagram.com/p/C67c29vM_xy/",
      "presupuesto_diario": 15,
      "fecha_inicio": "2026-05-20",
      "fecha_fin": "2026-05-27",
      "audiencia": "AudY_Alias",
      "placements": "automatic",
      "fila_sheets": 3
    },
    {
      "campaña": "Campaña Inválida",
      "ig_post_url": "https://www.instagram.com/p/C67c29vM_xy/",
      "presupuesto_diario": -5,
      "fecha_inicio": "2026-05-20",
      "fecha_fin": "2026-05-15",
      "audiencia": "AudX_Alias",
      "placements": "automatic",
      "fila_sheets": 4
    }
  ]
}
```

3. **Resultados Esperados**:
   - El Webhook retornará inmediatamente `{ "status": "finished" }` tras concluir el procesamiento de todo el batch.
   - **Fase 1 (Serial)**: Registrará una única campaña llamada `"Campaña Batch A"` en la tabla `campaigns_meta`. No habrá duplicados ni errores.
   - **Fase 2 (Paralela)**: 
     - La fila 2 y la fila 3 se desplegarán correctamente (creando AdSets, Creativos y Ads correspondientes) y actualizarán sus estados en la base de datos a `Desplegado`.
     - La fila 4 (presupuesto negativo y fechas invertidas) fallará inmediatamente en la validación local pre-claim y se registrará en Postgres y Google Sheets con estado `Error` y la descripción detallada en `error_log`, sin interferir con las filas 2 y 3.
