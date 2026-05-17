# BH FASHION - Automatización de Meta Ads

Este repositorio contiene la documentación, configuraciones y guías técnicas para el proyecto de automatización del despliegue masivo y gestión de anuncios en Meta para BH FASHION.

## Objetivo del Proyecto

Transformar la gestión de anuncios de un proceso manual y subjetivo a una arquitectura autónoma basada en datos. Este sistema sustituye la carga manual en el Ads Manager por una arquitectura que traduce variables desde una hoja de cálculo (Google Sheets) directamente a la API de Meta, reduciendo el tiempo de ejecución de 45 minutos a segundos.

## Pilares Operativos

1. **Despliegue Masivo:** Traducción de filas de Google Sheets a solicitudes HTTP POST hacia la Meta Graph API v23.
2. **Ingeniería de Imagen:** Carga automatizada de archivos multimedia para la obtención de `image_hashes`.
3. **Espionaje Algorítmico:** Scraping de la Facebook Ad Library para detectar tendencias en el sector fashion.
4. **Síntesis de Creativos:** Uso de IA (Gemini 2.5 Flash) para generar variaciones de copy basadas en datos ganadores e ingeniería inversa de ganchos exitosos.
5. **Extracción de Métricas:** Consultas cíclicas vía API para extraer Spend, ROAS y CPA.
6. **Filtro de Alertas:** Lógica condicional que dispara webhooks a Slack ante métricas (ej. CPA) críticas.

## Arquitectura del Sistema

* **Capa de Datos (Foundation):** Google Sheets como el "Single Source of Truth" (Dashboard Tabular).
* **Capa de Orquestación:** Instancia de n8n para el manejo y lógica de los flujos.
* **Capa de Integración:** Meta Graph API v23 (Campaña -> Adset -> Creative -> Ad).
* **Capa de Inteligencia:** API de Google Gemini para procesamiento de lenguaje natural.
* **Capa de Notificación:** Slack Webhooks para reportes por excepción.

## Estructura del Repositorio

* `Meta Ads Auto Deploy (Fixed).json` - El flujo principal de automatización en n8n.
* `Plantilla_Meta_Ads.csv` - Estructura base de datos requerida para el despliegue.
* `PRD y Guía Técnica*.txt` - Documentos de requerimientos de producto (PRD) y metodologías.
* `ABOUT_ES.md` - Guía de bienvenida e instrucciones para los colaboradores del equipo.

---
*Preparado por: Mau Dávila-Barbe / colectivo htmk://*
