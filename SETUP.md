# SETUP — Credenciales e IDs de Producción

Referencia rápida de IDs y configuración de Meta para BH Fashion. Los secretos (tokens, API keys) **NO van aquí** — se almacenan en el gestor de contraseñas del equipo (1Password) y se configuran en n8n como credentials.

---

## IDs Meta (BH Fashion - @bhfashionvzla)

```
AD_ACCOUNT_ID         = act_5314378785280789
AD_ACCOUNT_ID (sin prefix) = 5314378785280789
PAGE_ID               = 111921501694313
INSTAGRAM_ACCOUNT_ID  = 17841408634629405
APP_ID                = 1773904270656763
PIXEL_ID              = pendiente verificación
SYSTEM_USER_NAME      = n8n-meta-ads-automation
SYSTEM_USER_ID        = 61589854681033
```

## Scopes del Token (System User, nunca expira)

```
ads_management
ads_read
business_management
pages_read_engagement
pages_manage_ads
instagram_basic
instagram_content_publish
```

## Estado del Setup en Meta Business Manager

```
[✅] System User n8n-meta-ads-automation creado
[✅] Page BH Fashion asignada al System User (Acceso total)
[✅] Ad Account 5314378785280789 asignada al System User
[✅] App BH Fashion Ads Automation asignada al System User
[✅] IG @bhfashionvzla asignada al System User
[✅] IG @bhfashionvzla vinculada a Page BH Fashion
[✅] App Meta Developer creada, Marketing API añadida
[✅] App en Modo Live
[✅] Token System User generado (nunca expira) — guardar en 1Password
[⏳] Pixel ID confirmado (pendiente — requerido antes de activar Pilar 6)
```

## Versión API

Todos los endpoints usan **Meta Graph API v25.0**.

## Credenciales n8n a configurar

| Nombre credential n8n | Tipo | Valor |
|---|---|---|
| `Meta System User` | Bearer Auth | Token desde 1Password |
| `Telegram Bot` | Telegram API | Token desde @BotFather |
| `Postgres BH Fashion` | Postgres | Connection string desde 1Password |

## Variables Globales n8n

| Variable | Valor |
|---|---|
| `ad_account_id` | `5314378785280789` |
| `page_id` | `111921501694313` |
| `instagram_account_id` | `17841408634629405` |
| `telegram_chat_id_cliente` | (obtener del cliente, ver ABOUT_ES.md) |
| `telegram_chat_id_ops` | (ID del grupo ops, ver ABOUT_ES.md) |

---

⚠️ El App Secret fue rotado tras exposición previa. Verificar versión actual en 1Password antes de usar.
