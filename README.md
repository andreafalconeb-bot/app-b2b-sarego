# SAREGO B2B

App web para la venta corporativa B2B de SAREGO: prospección de flotas e
industrias, seguimiento completo de cada cuenta y administración de las
muestras de aceite usado. Sigue el método del curso 06 "Prospección
corporativa B2B" de la Academia SAREGO (`academia-sarego`,
`courses/prospeccion-corporativa`).

- **URL:** `b2b.distribuidorasarego.com` (Cloudflare Worker con assets estáticos).
- **Base de datos:** la misma Supabase de la app retail
  (`app-retail-lubricantes`). Las tablas son `b2b_*` y sus migraciones
  viven en ese repo, desde `supabase/migrations/0119_b2b_base.sql`.
- **Usuarios:** las mismas cuentas de la app retail. El gerente B2B da el
  acceso y el rol desde **Equipo**.

## Qué hace

| Módulo | Qué incluye |
|---|---|
| Inicio | Alertas (estancados, compromisos vencidos, muestras críticas, traspasos por aprobar), indicadores de actividad de la semana (curso 06, módulo 6) y actividad por persona (curso 08). |
| Prospectos | Tablero por etapa y lista, filtros, alta con aviso de duplicados en B2B y de cliente existente en Profit. |
| Semillas | Búsqueda en Google Maps por zona industrial y rubro (reutiliza la Edge Function `buscar-prospectos-places`). |
| Proyecto | Ficha con los 5 criterios del cliente ideal, etapa con enlace a la lección del curso, línea de tiempo (gestiones, comentarios con @, correos), mapa de decisores, compromisos, documentos, equipos y puntos de muestreo con QR, cotizaciones con aprobación del gerente, pilotos y mediciones (también neumáticos), asignación, traspaso y compartir. |
| Muestras | Bandejas por paso (por tomar, por enviar, en laboratorio, por interpretar, por comunicar), puntos que toca muestrear, resultados por parámetro, semáforo automático por límites + del laboratorio + confirmado por el ingeniero, tendencias por punto. |
| QR | La etiqueta pegada en el equipo abre la toma de muestra del punto. Funciona sin señal. |
| Kits | Inventario de kits del laboratorio: carga, entrega, devolución. |
| Equipo | Personas y roles, etapas y enlaces al curso, límites del semáforo, días para "estancado". |

## Roles

| Rol | Ve | Hace |
|---|---|---|
| Gerente B2B | Todo | Asigna, traspasa, comparte, aprueba descuentos, administra el equipo |
| Oficina de prospectación | Todo | Prospecta, asigna, traspasa, comparte |
| Ingeniero | Sus proyectos y los que le comparten | Trabaja sus cuentas; puede pedir el traspaso de una cuenta |
| Coordinación de muestras | Todo | Gestiona muestras, resultados y kits |
| Crédito y cobranza, gerencia general | Todo | Solo lectura |
| Cliente | Su cuenta | Portal (fase 3) |

Los permisos los aplica la base (RLS), no solo la pantalla.

## Sin señal

La app es una PWA. Cada pantalla guarda su última copia para verla sin
señal, y las gestiones, compromisos, equipos, mediciones y tomas de
muestra hechas sin señal quedan en una cola en el teléfono que se envía
sola al volver la conexión (`src/lib/offline.ts`). Los archivos (fotos,
PDF) necesitan señal para subirse.

## Desarrollo

```bash
cd web
cp .env.example .env.local   # URL y anon key del proyecto Supabase compartido
npm install
npm run dev
npm test
```

## Despliegue

Cada push a `main` construye y publica (`.github/workflows/deploy.yml`).
En GitHub → Settings → Secrets and variables → Actions, las mismas que
usa la app retail:

- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CLOUDFLARE_ACCOUNT_ID`
- Secreto: `CLOUDFLARE_API_TOKEN`

## Fases

1. **Esta versión:** prospección, seguimiento del proyecto y muestras.
2. Correo entrante al expediente (`p-0001@b2b.distribuidorasarego.com`
   vía Cloudflare Email Routing), lectura automática del PDF de Smart
   Assistance, PDF de cotizaciones, recordatorios por WhatsApp y Google
   Calendar, resumen semanal al gerente.
3. Portal del cliente, salud de la cuenta (compras y cobranza de
   Profit), metas, mapa de ingenieros.
