# Auditoría de Workflow n8n: Meta Ads Auto Deploy

**Última actualización:** 2026-05-16
**Estado:** En implementación — fixes aplicados a JSON, pendiente upload n8n
**Archivo workflow:** `Meta Ads Auto Deploy (Fixed).json`

---

## 📌 Single Source of Truth — Credenciales y IDs Cliente

### IDs Meta (BH Fashion - bhfashionvzla)

```
AD_ACCOUNT_ID         = act_5314378785280789
AD_ACCOUNT_ID (sin prefix) = 5314378785280789
PAGE_ID               = 111921501694313
INSTAGRAM_ACCOUNT_ID  = 17841408634629405
APP_ID                = 1773904270656763
PIXEL_ID              = (pendiente — query con act_ correcto)
BUSINESS_MANAGER      = bhfashionvzla (data: [] en /me/businesses, no bloqueante)
SYSTEM_USER_NAME      = n8n-meta-ads-automation
SYSTEM_USER_ID        = 61589854681033
```

### Credenciales (NO en este doc — usar password manager)

- **Token Bearer Auth** (System User, never expires): guardar en 1Password
- **App Secret**: rotado tras exposición en chat — verificar versión actual
- **Gemini API Key**: para Query Auth en n8n

### Scopes Token Confirmados

```
ads_management
ads_read
business_management
pages_read_engagement
pages_manage_ads
instagram_basic        (asignar IG primero)
instagram_content_publish
```

---

## 🚦 Estado Setup Meta Business Manager

```
[✅] System User n8n-meta-ads-automation creado
[✅] Page Bhfashion p asignada al System User (Acceso total)
[✅] Ad Account 5314378785280789 asignada al System User
[✅] App BH Fashion Ads Automation asignada al System User
[✅] IG @bhfashionvzla asignada al System User
[✅] IG @bhfashionvzla vinculada a Page Bhfashion p
[✅] App Meta Developer creada, Marketing API añadido
[✅] App en Modo Live
[✅] Token generado nunca-expira
[⏳] Pixel ID confirmado (opcional)
[⏳] Verificar Business Manager visible (/me/businesses retorna vacío)
```

---

## 🚨 Problemas Críticos (Bloqueantes) — Estado

### 1. Nodo `Create Ad` body vacío ⏳ PENDIENTE FIX

- **Problema**: `bodyParameters` vacío (`[{}]`). POST a Meta sin name/adset_id/creative.
- **Solución a aplicar**: cambiar a `jsonBody` con:

```json
{
  "name": "{{ $('Webhook Sheets').first().json.body.campaign_name }} - Ad {{ $itemIndex }}",
  "adset_id": "{{ $('Create AdSet').first().json.id }}",
  "creative": { "creative_id": "{{ $json.id }}" },
  "status": "PAUSED"
}
```

### 2. Nodo `Download Media` no descarga binario ⏳ PENDIENTE FIX

- **Problema**: GET sin `responseFormat: "file"` → corrompe imagen → `Validar MIME` falla.
- **Solución**: agregar a Options → Response → `responseFormat: "file"`.

### 3. Inconsistencia versiones API ⏳ PENDIENTE FIX

- **Problema**: mezcla `v23.0` (Create Campaign, AdSet, Upload AdImage, Create Ad) + `v25.0` (Create AdCreative).
- **Solución**: estandarizar todo a `v25.0`.

### 4. `special_ad_categories: ["NONE"]` inválido ⏳ PENDIENTE FIX (NUEVO)

- **Problema**: Meta v25.0 ya no acepta `["NONE"]`. Debe ser array vacío `[]`.
- **Síntoma**: error `Invalid parameter` en Create Campaign.
- **Solución**: cambiar `"special_ad_categories": ["NONE"]` → `"special_ad_categories": []`.

### 5. `is_adset_budget_sharing_enabled` requerido ✅ YA APLICADO

- **Problema**: Meta requiere especificar este campo si no usas Campaign Budget Optimization.
- **Estado**: ya está en Create Campaign con valor `false` ✅.
- **Origen del hallazgo**: test curl directo retornó error `(#100) subcode 4834011`.

### 6. IDs Variables Globales desactualizados ⏳ PENDIENTE FIX (NUEVO)

- **Problema**: `Variables Globales` tiene IDs de otro cliente:
  - `ad_account_id: "988429123910411"` (viejo)
  - `page_id: "1072633835938745"` (viejo)
- **Solución**: reemplazar con IDs reales BH Fashion:
  - `ad_account_id: "5314378785280789"` (sin prefix `act_`, ya lo agrega URL)
  - `page_id: "111921501694313"`
  - Agregar `instagram_account_id: "17841408634629405"`

---

## ⚠️ Advertencias de Flujo y Manejo de Errores

### 1. Falta manejo errores HTTP ⏳ PENDIENTE

- **Problema**: ningún nodo Create tiene `Continue On Fail` ni notificación error.
- **Solución**: activar `onError: continueRegularOutput` + nodo Slack/Discord error branch.

### 2. Webhook timeout potencial ⏳ PENDIENTE FIX

- **Problema**: Webhook espera workflow completo (Gemini + uploads = lento) → cliente Google Sheets timeout.
- **Solución**: cambiar a `responseMode: "onReceived"` (Respond Immediately).

### 3. Optional chaining `Validar MIME` ⏳ PENDIENTE FIX

- **Problema**: `$binary.data.mimeType` crashea si `$binary` undefined.
- **Solución**: `$binary?.data?.mimeType || ''`.

---

## 💡 Recomendaciones Optimización

### 1. Nodo `Wait` huérfano ⏳ PENDIENTE REMOVE

- Wait de 2s al final no conectado a nada → eliminar.

### 2. Versiones nodos deprecados ⚠️ INFO

- `Webhook` v1, `If` v2 — n8n sugerirá upgrade al importar. Aplicar cuando aparezca prompt.

### 3. Parse JSON limpio ✅ MANTENER

- `.replace(/```/g, '').trim()` + `.map(v => ({json: v}))` correcto. No tocar.

---

## 🆕 Mejoras Nuevas (post-audit original)

### 1. Agregar Instagram a publisher_platforms ⏳ PENDIENTE

- **Razón**: cliente quiere ads en IG, no solo FB.
- **Estado actual AdSet**: `"publisher_platforms": ["facebook"]`
- **Cambiar a**: `["facebook", "instagram"]` + opcionalmente `instagram_positions: ["stream", "story", "reels"]`.

### 2. Discovery Workflow (opcional futuro)

- Workflow separado que use token para auto-extraer IDs Meta.
- Útil para onboarding nuevos clientes sin pedir IDs manualmente.
- Endpoints: `/me/adaccounts`, `/me/accounts?fields=instagram_business_account`, `/act_X/adspixels`.

### 3. Endpoint queries directos IG fallan — workaround

- **Hallazgo**: `GET /IG_ID?fields=username` retorna `(#100) subcode 33` con System User token aunque IG esté asignado.
- **Causa probable**: requiere Page Access Token específico o `appsecret_proof`.
- **Workaround**: usar field expansion `GET /PAGE_ID?fields=instagram_business_account{id,username}` — funciona con System User token.
- **Impacto workflow**: NINGUNO. Workflow no hace query directo IG. AdCreative usa `instagram_actor_id` como referencia.

---

## 📋 Checklist Fixes JSON — APLICADOS

```
[✅] 1. Variables Globales: IDs nuevos + instagram_account_id agregado
[✅] 2. Todas URLs estandarizadas a v25.0
[✅] 3. Create Campaign: special_ad_categories []
[✅] 4. Create Ad: jsonBody completo (name + adset_id + creative.creative_id + status PAUSED)
[✅] 5. Download Media: responseFormat "file" en options
[✅] 6. Validar MIME: $binary?.data?.mimeType || ''
[✅] 7. Webhook Sheets: responseMode "onReceived"
[✅] 8. Create AdSet: publisher_platforms ["facebook","instagram"] + facebook_positions + instagram_positions
[✅] 9. Nodo Wait eliminado (+ conexión Create Ad → Wait removida)
[✅] BONUS: AdCreative instagram_actor_id agregado para IG placements
[ ] 10. (opcional) onError continueRegularOutput en nodos Create — diferido
```

JSON validado: 11 nodos, schema OK.

---

## 🚀 Plan Despliegue

1. **Aplicar fixes JSON** (este doc lista los 10)
2. **Importar JSON corregido a n8n** (UI o API)
3. **Configurar credentials n8n**:
   - `Bearer Auth account` → token Meta
   - `Query Auth account` → Gemini API key
4. **Test e2e**: trigger webhook con row test → verificar campaña aparece Meta Ads Manager con status PAUSED
5. **Validar 5 ads creados** (uno por variación Gemini)
6. **Cliente revisa en Meta Ads Manager** antes activar status

---

## 📜 Historial Hallazgos

| Fecha | Hallazgo | Acción |
|-------|----------|--------|
| Audit inicial | Create Ad body vacío | Fix pendiente |
| Audit inicial | Download Media sin binary | Fix pendiente |
| Audit inicial | Mix versiones API | Fix pendiente |
| Audit inicial | Webhook timeout risk | Fix pendiente |
| 2026-05-16 | `is_adset_budget_sharing_enabled` requerido | Ya en JSON ✅ |
| 2026-05-16 | `special_ad_categories ["NONE"]` inválido | Fix pendiente |
| 2026-05-16 | Variables Globales IDs viejos | Fix pendiente |
| 2026-05-16 | IG-Page link confirmado UI | OK ✅ |
| 2026-05-16 | Query directo IG falla — workaround | Documentado, no bloquea |
| 2026-05-16 | /me/businesses retorna `data: []` | Investigar — no bloquea |
