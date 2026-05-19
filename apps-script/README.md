# Apps Script — Setup para BH Fashion

## Requisito previo: Tunnel para localhost

Apps Script corre desde servidores de Google → no puede llegar a `localhost:5678`.

**Solución**: Detén n8n y reinícialo con tunnel:

```bash
# Detener n8n actual (Ctrl+C en la terminal donde corre)
# Luego:
n8n start --tunnel
```

n8n imprimirá algo como:
```
Tunnel URL: https://abc123.tunnel.n8n.io
```

Copia esa URL — la necesitarás en el paso 4.

---

## Pasos (5 minutos)

### 1. Crear Spreadsheet
- Ve a [Google Sheets](https://sheets.google.com) → **Nuevo** → Hoja en blanco
- Ponle nombre: `BH Fashion — Deploys`

### 2. Abrir Apps Script
- En el Spreadsheet: **Extensiones → Apps Script**
- Se abre el editor de Apps Script

### 3. Pegar el código
- Borra todo el contenido default del archivo `Code.gs`
- Copia y pega el contenido de [`apps-script/Code.gs`](../apps-script/Code.gs)

### 4. Configurar webhook URL
- En la línea 15 del código, cambia `WEBHOOK_URL`:
```javascript
const WEBHOOK_URL = 'https://TU-TUNNEL-URL.tunnel.n8n.io/webhook/meta-ads-deploy';
```

### 5. Ejecutar Setup
- Guarda el proyecto (Ctrl+S)
- Vuelve al Spreadsheet y **recarga la página** (F5)
- Espera 3-5 segundos → aparecerá el menú **BH Ads** en la barra superior
- Haz clic en **BH Ads → Setup: Crear hojas y datos de prueba**
- Google te pedirá autorización → acepta todos los permisos
- El setup crea las 3 hojas con encabezados, validaciones y datos de prueba

### 6. Probar el Echo E2E
- Verifica que la fila 2 de `Deploys` tiene `Desplegar=☑️` y `Estado=Pendiente`
- Haz clic en **BH Ads → Desplegar Marcadas**
- Si todo funciona: alerta "✅ 1 fila(s) enviada(s)" y checkbox desmarcado

---

## Estructura resultante

```
📊 BH Fashion — Deploys
├── Hoja: Deploys (principal)
│   ├── Columnas A-H: inputs del cliente
│   ├── Columna H: checkbox Desplegar
│   ├── Columna I: dropdown Estado (6 valores)
│   └── Columnas J-N: read-only (IDs Meta, error_log, timestamp)
├── Hoja: Campañas
│   ├── nombre (texto)
│   ├── objective (dropdown 6 valores Meta)
│   └── special_ad_categories (texto)
└── Hoja: Audiencias
    ├── alias (texto)
    ├── meta_audience_id (texto)
    └── tipo (dropdown: custom, lookalike, saved)
```

## Troubleshooting

| Problema | Solución |
|----------|----------|
| Menú "BH Ads" no aparece | Recarga la página (F5) |
| Error de permisos | Acepta permisos OAuth de Google |
| Error de conexión | Verifica que n8n corre con `--tunnel` y la URL es correcta |
| "No hay filas con Desplegar=TRUE" | Verifica checkbox marcado Y Estado=Pendiente (ambos) |
