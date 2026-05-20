# Research: Validación pre-claim: errores de datos antes de tocar Meta API

**Issue**: #3
**Estado**: ✅ Completado
**Fecha**: 2026-05-20

---

## 1. Entendimiento del problema y objetivos

El objetivo de este issue es robustecer la entrada de datos del sistema para evitar fallas a mitad de ejecución en Meta o en la base de datos. Debemos implementar una fase de validación estricta **antes del claim atómico** (pre-claim) de la fila, de modo que si hay un error local o el post de Instagram es inaccesible, la fila se marque como `Error` con su respectivo log de error en Postgres y en Google Sheets, sin llegar a estar en estado `Desplegando` (no consume slots ni interrumpe ejecuciones paralelas).

### Validaciones requeridas:
1. **Validación local (campos requeridos, tipos y rangos)**:
   - Presencia de campos requeridos: `campaña`, `ig_post_url`, `presupuesto_diario`, `fecha_inicio`, `fecha_fin`, `audiencia`.
   - Formato de URL de Instagram (`ig_post_url`): Debe ser un permalink válido que empiece con `https://(www.)instagram.com/` y contenga `/p/`, `/reel/` o `/tv/`.
   - Rango de presupuesto diario: Debe ser un número positivo (`> 0`).
   - Rango de fechas: `fecha_inicio` y `fecha_fin` deben ser fechas válidas y cumplir `fecha_inicio <= fecha_fin`.
2. **Validación de Relaciones / FKs (Hojas de Google Sheets)**:
   - La campaña (`campaña`) ingresada en la fila debe existir en la columna `nombre` de la hoja `Campañas`.
   - La audiencia (`audiencia`) ingresada en la fila debe existir en la columna `alias` de la hoja `Audiencias`.
3. **Verificación de post de Instagram en Meta API**:
   - Decodificar el `shortcode` de la URL de Instagram para obtener el `ig_media_id` numérico.
   - Realizar una llamada a `GET /v25.0/{ig_media_id}?fields=id` utilizando el token de Meta para confirmar que el post existe y la cuenta tiene acceso.

### Flujo lógico de estados en caso de error pre-claim:
- Si alguna validación de los pasos anteriores falla:
  - Registrar la fila directamente en la tabla `deployments` de Postgres con `estado = 'Error'` y el error detallado en `error_log` (sin pasar por `Pendiente` ni `Desplegando`).
  - Sincronizar de vuelta a Google Sheets la fila como `Estado = 'Error'` y rellenar la columna `error_log`.
  - Retornar una respuesta HTTP 200 con un JSON de error (`{ "status": "error", "message": "..." }`) para finalizar el webhook limpia y controladamente.

---

## 2. Investigación de Archivos y Componentes

### Archivos a Modificar:
- [build_workflow.js](file:///e:/Development/N8NDev/DHfashion/bhfashion-auto/build_workflow.js):
  - Modificaremos la cadena de generación de nodos del workflow `meta-ads-deploy`.
  - Adelantaremos la lectura de las hojas `Campañas` y `Audiencias` para que ocurra al inicio del flujo, inmediatamente después del webhook.
  - Implementaremos nodos de validación local y de claves foráneas.
  - Añadiremos lógica para la decodificación de la URL a `ig_media_id`.
  - Añadiremos una llamada HTTP Request para verificar la existencia del post en Meta API.
  - Integraremos caminos alternativos (bifurcaciones) para registrar errores en Postgres y en Google Sheets cuando la validación falle.

### Endpoints y Lógica Técnica:
1. **Decodificación de Shortcode a Media ID**:
   Instagram codifica sus IDs numéricos en base64 modificado en las URL. La lógica de decodificación en JavaScript/BigInt es:
   ```javascript
   function shortcodeToMediaId(shortcode) {
     const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
     let id = BigInt(0);
     for (let i = 0; i < shortcode.length; i++) {
       let char = shortcode[i];
       let value = BigInt(alphabet.indexOf(char));
       id = (id * BigInt(64)) + value;
     }
     return id.toString();
   }
   ```
   *Ejemplo*: De `https://www.instagram.com/p/C67c29vM_xy/`, extraemos el shortcode `C67c29vM_xy` y lo decodificamos a su ID de Meta correspondiente.

2. **Endpoint de Verificación de Post**:
   - `GET /v25.0/{ig_media_id}?fields=id`
   - Si retorna `200 OK`, el post es accesible y válido.
   - Si retorna `4xx` (por ejemplo, token inválido, post privado o no existente), se considera validación fallida.

---

## 3. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Límites de Rate Limit en Meta API** | Falsos negativos al verificar la URL si Meta nos bloquea temporalmente por exceso de llamadas. | Configurar el nodo HTTP Request con un reintento simple o manejar de forma descriptiva el error de rate limit en el `error_log`. |
| **Pérdida de precisión de IDs numéricos** | IDs truncados en JavaScript que causen fallas de 400 Bad Request en Meta. | Usar `BigInt` en JavaScript dentro de los nodos Code de n8n para asegurar que el ID numérico mantenga toda su precisión de bits. |
| **Cambios en URLs de Instagram** | Que las URLs tengan formatos inesperados (parámetros de query, sub-rutas adicionales). | Limpiar la URL de Instagram con expresiones regulares antes de extraer el shortcode (eliminar query parameters, etc.). |

---

## 4. Estimación de Esfuerzo

- **Fase 1: Research (Investigación)**: ~20 minutos (Completado).
- **Fase 2: Plan (Planificación)**: ~25 minutos.
- **Fase 3: Implement (Implementación)**: ~50 minutos.
- **Validación y Pruebas**: ~25 minutos.
- **Esfuerzo Total Estimado**: **~2h**

---

¿Me das el **GO** para pasar a la **Fase 2 (Planificación)**?
