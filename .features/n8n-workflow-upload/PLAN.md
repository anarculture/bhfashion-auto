# Plan: n8n Workflow Upload via API

**Risk level**: Low

## Summary

Subir `Meta Ads Auto Deploy (Fixed).json` corregido a workflow existente n8n (ID `6jXhenAc0eFrTFUV`) vía PUT API. Strip credential refs antes upload para UI clara. Workflow queda inactive hasta que cliente asigne credentials manualmente.

**No incluye**: crear credentials en n8n vía API, activar workflow, modificar Apps Script Google Sheets, test e2e con request real.

## Architecture Decisions

1. **Update vs Crear**: PUT a workflow existente para preservar webhook URL y mantener consistencia con cliente Apps Script.
2. **Credenciales**: Strip refs `credentials: {}` de nodos HTTP antes upload. Cliente asigna en UI post-upload (1 vez, persiste).
3. **Activación**: Dejar `active: false` post-upload. Cliente activa manual tras verificar credentials.
4. **Payload sanitización**: Solo enviar `name`, `nodes`, `connections`, `settings`. Strip todo lo demás (readonly fields).

## Implementation Steps

### Step 1: Construir payload sanitizado

**Files**: `/tmp/n8n_payload.json` (temporal)

**What to build**:
- Python script lee `Meta Ads Auto Deploy (Fixed).json`
- Extrae: `name`, `nodes`, `connections`, `settings`
- Strip de cada nodo: campo `credentials` (objeto completo)
- Strip de `settings`: solo deja `executionOrder`, `binaryMode`
- Escribe `/tmp/n8n_payload.json`

**Test gate**:
```bash
python3 -c "
import json
p = json.load(open('/tmp/n8n_payload.json'))
assert set(p.keys()) == {'name','nodes','connections','settings'}, f'Wrong keys: {p.keys()}'
assert all('credentials' not in n for n in p['nodes']), 'credentials not stripped'
assert len(p['nodes']) == 11, f'Expected 11 nodes, got {len(p[\"nodes\"])}'
print('OK')
"
```
Debe imprimir `OK`.

---

### Step 2: PUT update a workflow existente

**Files**: ninguno (API call)

**What to build**:
```bash
curl -s -X PUT "$N8N_URL/api/v1/workflows/6jXhenAc0eFrTFUV" \
  -H "X-N8N-API-KEY: $N8N_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/n8n_payload.json
```

**Test gate**:
- HTTP code `200` (capturar con `-w '%{http_code}'`)
- Response body incluye `"id":"6jXhenAc0eFrTFUV"` y `"name":"Meta Ads Auto Deploy (Fixed)"`
- Si HTTP no es 200 → STOP, reportar error exacto al user

---

### Step 3: Verificar fixes aplicados online

**Files**: ninguno (API GET)

**What to build**:
```bash
curl -s "$N8N_URL/api/v1/workflows/6jXhenAc0eFrTFUV" \
  -H "X-N8N-API-KEY: $N8N_KEY"
```

**Test gate** (Python checks contra response):
- `nodes` count == 11 (Wait removido)
- No `v23.0` en ninguna URL
- Variables Globales `ad_account_id == "5314378785280789"`
- Variables Globales `instagram_account_id == "17841408634629405"`
- Create Ad tiene `specifyBody: "json"` y `jsonBody` con `adset_id`
- Create Campaign jsonBody contiene `"special_ad_categories": []`
- Webhook Sheets tiene `responseMode: "onReceived"`
- Download Media options.response.response.responseFormat == "file"

Todos deben pasar. Si alguno falla → STOP.

---

### Step 4: Reportar al usuario qué hacer manual

**Files**: ninguno (output al user)

**What to build**: mensaje al user con:
1. URL del workflow en UI n8n
2. Webhook URL preservada (sacada del response)
3. 2 credenciales que debe crear en UI:
   - `Bearer Auth account` (httpBearerAuth) → pegar token Meta
   - `Query Auth account` (httpQueryAuth) → Gemini API key, param name `key`
4. 6 nodos HTTP donde debe asignar credenciales (lista exacta)
5. Recordatorio: NO activar hasta verificar credentials

**Test gate**: mensaje contiene URL workflow + webhook + lista nodos. Usuario confirma recibido.

## Success Criteria

- ✅ HTTP 200 en PUT
- ✅ GET subsecuente confirma todos 10 fixes presentes online
- ✅ Workflow queda `active: false`
- ✅ Webhook URL preservada (mismo path `meta-ads-deploy`)
- ✅ User recibe instrucciones claras qué hacer manual

## Out of Scope

- ❌ Crear credentials via API (riesgo seguridad expone tokens en curl)
- ❌ Activar workflow automáticamente
- ❌ Test e2e con request real Meta API
- ❌ Modificar Apps Script Google Sheets
- ❌ Crear pixel ID (cliente decide si necesita)
- ❌ Documentar uso workflow cliente final
