# Plan: Validación pre-claim: errores de datos antes de tocar Meta API

**Issue**: #3
**Estado**: ✅ Completado
**Fecha**: 2026-05-20

---

## 1. Goal Description

El objetivo de este plan es implementar una fase de validación de datos (pre-claim) para asegurar que cualquier fila con datos corruptos, referencias inexistentes o posts de Instagram no accesibles sea rechazada y marcada como `Error` antes de que el workflow realice el claim atómico en Postgres y proceda al despliegue en Meta.

Esto previene:
- Intentos de despliegue con campañas o audiencias no existentes en la configuración.
- Fallos en la creación de creativos de Meta debido a URLs inválidas o posts privados/inexistentes.
- Bloqueos de slots (filas atrapadas en estado `Desplegando`).

---

## 2. User Review Required

> [!NOTE]
> Para la validación del post de Instagram en Meta API, decodificamos el shortcode de la URL a un `ig_media_id` numérico usando una función con `BigInt` y llamamos al endpoint `GET /v25.0/{ig_media_id}?fields=id`. Esto requiere que el token configurado en n8n tenga los permisos necesarios para leer el post de Instagram de la cuenta.

> [!IMPORTANT]
> Los errores de validación pre-claim registrarán la fila directamente con `estado = 'Error'` y la descripción en `error_log` en la base de datos y Google Sheets, respondiendo al webhook con `{ "status": "error", "message": "..." }` y finalizando de forma controlada.

---

## 3. Open Questions

No hay preguntas abiertas pendientes; las especificaciones de validación y de llamada a Meta API están completamente alineadas con el PRD y la arquitectura de la base de datos.

---

## 4. Proposed Changes

### Orquestación n8n (`meta-ads-deploy`)

A continuación se detallan los cambios en el script de generación del flujo:

#### [MODIFY] [build_workflow.js](file:///e:/Development/N8NDev/DHfashion/bhfashion-auto/build_workflow.js)
- Mover los nodos `Read Campañas Sheet` y `Read Audiencias Sheet` justo después del nodo `Preparar Fila`.
- Modificar el parámetro `documentId` en ambos nodos para usar `={{ $('Preparar Fila').first().json.spreadsheet_id }}` en lugar del claim Postgres.
- Agregar un nodo tipo Code `Validar Local y FKs` con la lógica de verificación de campos requeridos, presupuesto positivo, fecha de inicio <= fecha fin, existencia de campaña y de audiencia, y conversión del shortcode de Instagram a `ig_media_id`.
- Agregar un nodo IF `IF Local Valid` para verificar el resultado de la validación.
- Agregar un nodo Code `Format Local Error` en la rama falsa de `IF Local Valid`.
- Agregar un nodo HTTP Request `Verify IG Post` en la rama verdadera para consultar a la API de Meta (`GET /v25.0/{ig_media_id}?fields=id`) con `continueOnFail: true`.
- Agregar un nodo IF `IF IG Post Exists` para evaluar si la llamada a Meta retornó un error o no.
- Agregar un nodo Code `Format IG Error` en la rama falsa de `IF IG Post Exists`.
- Conectar ambas ramas falsas a un nuevo nodo Postgres `Postgres Insert Error` para insertar la fila en estado `Error` con su respectivo log.
- Conectar `Postgres Insert Error` a un nuevo nodo Google Sheets `Google Sheets Sync Error` para reportar el error en la hoja de cálculo.
- Conectar `Google Sheets Sync Error` a un nuevo nodo Respond to Webhook `Respond Error` para finalizar la ejecución.
- Conectar la rama verdadera de `IF IG Post Exists` al nodo `Insert Postgres` original (el cual se modificará ligeramente para leer los campos usando `$('Preparar Fila').first().json` en lugar del directo parent input, garantizando robustez).

---

## 5. Verification Plan

### Test Gates de Verificación

#### Test Gate 1: Validación de Datos Requeridos y Rangos
- **Acción**: Enviar un webhook de prueba con un presupuesto diario de `0` o negativo, o una fecha de inicio posterior a la fecha de fin.
- **Validación**: Comprobar que la ejecución no realice ningún claim ni llame a Meta. La fila debe ser registrada en Postgres y Google Sheets con estado `Error` y un mensaje detallando el campo con problemas.

#### Test Gate 2: Validación de Claves Foráneas (Hojas de Google Sheets)
- **Acción**: Enviar un webhook de prueba con un nombre de campaña o un alias de audiencia que no existan en sus respectivas hojas.
- **Validación**: La ejecución debe fallar antes del claim, marcando la fila como `Error` indicando que no se encontró el recurso.

#### Test Gate 3: Validación de Post de Instagram Inexistente o Privado
- **Acción**: Enviar una URL de Instagram con un shortcode aleatorio o un post privado que no pertenezca a la cuenta configurada.
- **Validación**: Comprobar que la llamada `Verify IG Post` retorne un error, el cual sea capturado, y la fila se registre con estado `Error` y el mensaje de error retornado por Meta API en la base de datos y Google Sheets.

#### Test Gate 4: Camino Feliz (Validación E2E con Post Real)
- **Acción**: Enviar un deploy con datos válidos y una URL de Instagram real de la cuenta.
- **Validación**: El flujo debe pasar las validaciones locales y la llamada de verificación con éxito, registrar el estado `Pendiente` en Postgres, reclamarlo a `Desplegando` y completar la creación de la campaña, AdSet, Creative y Ad en Meta correctamente.
