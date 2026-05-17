# Research: n8n Workflow Upload via API

**Date**: 2026-05-16
**Requested**: Subir `Meta Ads Auto Deploy (Fixed).json` corregido a n8n.gsnline.com actualizando workflow existente ID `6jXhenAc0eFrTFUV`.
**Status**: PENDING DECISION

## What Exists Today

- **n8n instance**: https://n8n.gsnline.com — accesible vía API key (verificado, HTTP 200)
- **Workflow target online** (ID `6jXhenAc0eFrTFUV`):
  - Nombre: "Meta Ads Auto Deploy (Fixed)"
  - Estado: `active: false`
  - **0 credenciales atadas** a nodos (no se transfirieron en import previo)
  - Versión vieja: v23.0 mix, Wait node, IDs viejos, body Create Ad vacío
- **Workflow local corregido**: `Meta Ads Auto Deploy (Fixed).json` (11 nodos, validado JSON, todos fixes aplicados)
- **Credenciales en n8n instance**:
  - Google Sheets account, PDFShift, JSONcargo, excel, Microsoft Excel/Outlook, **Header Auth account** (httpHeaderAuth), Postgres
  - **NO existe** `httpBearerAuth` (para Meta token)
  - **NO existe** `httpQueryAuth` (para Gemini key)

## What Needs to Be Built

### Files a Modificar
- `Meta Ads Auto Deploy (Fixed).json` — strip credential refs antes upload (IDs `AQ2tmf94MUYVp0JI`, `GhMm4ppy4Tg42cqd` no existen en target)

### Comandos a Ejecutar
- `PUT /api/v1/workflows/6jXhenAc0eFrTFUV` con payload sanitizado
- Post-upload: GET para verificar fixes aplicados

### Credenciales que Cliente Debe Crear (manual en UI n8n)
1. **Bearer Auth account** (tipo `httpBearerAuth`) → token Meta System User
2. **Query Auth account** (tipo `httpQueryAuth`) → Gemini API key, param name `key`

## Risks

| Risk | Likelihood | Impact | Notes |
|------|-----------|--------|-------|
| Payload schema rechazado por n8n API | Media | Alto | n8n API rechaza fields readonly: `id`, `versionId`, `active`, `shared`, `tags`, `triggerCount`. Strip antes PUT. |
| Webhook URL cambia tras update | Baja | Medio | `webhookId` está en JSON local, debería preservarse. Verificar post-upload. |
| Credenciales rotas (IDs no existen) | **Alta** | Medio | Workflow se sube pero nodos HTTP marcan credential warning. User debe re-asignar en UI. Mitigación: stripping de credential refs hace UI más clara. |
| `active: true` en JSON local activa workflow sin querer | Baja | Bajo | API ignora active en PUT. Activar manualmente después de validar. |
| Pérdida de webhook actual al recrear nodo Webhook | Baja | Medio | webhookId preservado en JSON, no debería pasar. |
| n8n versión específica del endpoint PUT | Baja | Medio | n8n Public API v1 estándar. Si falla, fallback POST a nuevo workflow + delete viejo. |

## Architecture Decision Points

### 1. Update existente vs Crear nuevo
- **Opción A — PUT update existente** (`/api/v1/workflows/6jXhenAc0eFrTFUV`)
  - Pro: preserva webhook URL, mismo ID, historial executions
  - Con: si API rechaza payload, queda en estado raro
- **Opción B — POST nuevo + DELETE viejo**
  - Pro: clean slate
  - Con: webhook URL cambia → cliente debe actualizar Apps Script

**Recomendación**: A (PUT). Preserva webhook.

### 2. Credentials handling
- **Opción A — Strip credential refs antes upload**
  - Pro: UI muestra clara "Select credential" en nodos
  - Con: cliente debe asignar manual cada nodo (5 HTTP + Gemini)
- **Opción B — Mantener refs viejos (IDs inexistentes)**
  - Pro: si en futuro crea credenciales con esos IDs, auto-link
  - Con: warnings en UI más confusos
- **Opción C — Crear credenciales via API primero, luego upload con refs nuevos**
  - Pro: workflow listo end-to-end al subir
  - Con: API key Meta y Gemini deben pegarse vía API (más exposición)

**Recomendación**: A. Más limpio para cliente. Credenciales se crean 1 vez en UI.

### 3. Activación post-upload
- **Opción A — Mantener `active: false`** post-upload (default n8n)
  - Pro: cliente revisa antes activar, no se dispara accidentalmente
  - Con: requiere paso manual extra
- **Opción B — Activar via API tras upload**
  - Pro: end-to-end automatizado
  - Con: workflow corre con primera request, sin oportunidad revisar credentials

**Recomendación**: A. Activación manual tras verificar credentials.

## Effort Estimate

- **Total**: 15-20 min
- **Confianza**: Alta. n8n Public API documentado, payload ya construido, riesgo principal es schema mismatch (rápido de iterar).

## Recommendation

**GO** — proceder con Phase 2 Plan.

Estrategia: PUT update existente, strip credentials, dejar inactive, cliente asigna credentials en UI.

**Decision**: [ ] GO  [ ] NO-GO  [ ] NEEDS CLARIFICATION
