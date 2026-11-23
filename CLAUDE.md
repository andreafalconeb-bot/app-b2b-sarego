# Notas para Claude

- App B2B de SAREGO. La base de datos es la **misma Supabase de la app
  retail** (`andreafalconeb-bot/app-retail-lubricantes`). Los cambios de
  esquema van como migración **en ese repo** (tablas `b2b_*`, desde
  `0119_b2b_base.sql`), nunca aquí.
- El método sale del curso 06 "Prospección corporativa B2B" del repo
  `academia-sarego`. Si el curso cambia, se ajustan `b2b_etapas` (desde
  Equipo → Etapas y curso) y los textos de `src/lib/catalogos.ts`.
- Decisiones de Andrea (22/nov/2026): primero prospecta la oficina con la
  gerencia y después se asigna a un ingeniero, que es dueño de la cuenta;
  el traspaso exige motivo y nota; un ingeniero solo ve lo suyo y lo que
  le comparten; los descuentos los aprueba el gerente; los 5 criterios
  del cliente ideal son informativos (consumo: 20 o más camiones o 10
  o más equipos de maquinaria pesada, Andrea 23/nov/2026; el curso decía
  30 vehículos o equipos); estancado = 15 días; laboratorio
  Smart Assistance; un resultado crítico crea 3 compromisos (avisar en
  24 h, cambio de aceite, repetir la muestra); líneas: lubricantes,
  grasas y neumáticos; correo de la empresa en `mad4performance.com`.
- Sucursales B2B: `01` Caracas, `02` Valencia y `03` Ciudad Bolívar (Andrea,
  23/nov/2026; `03` lo asignó la app, el ERP no tiene código para Ciudad
  Bolívar). Las Semillas deducen la sucursal del punto (`sucursalPorPunto`).
- Todo texto de la interfaz en español de Venezuela, tuteando.
- **Publicación:** Andrea (23/nov/2026) autorizó que Claude publique solo
  los cambios de esta app: abrir el PR, unirlo a `main` cuando `tsc`, las
  pruebas y el build pasen, revisar que el deploy a Cloudflare termine en
  verde y avisarle qué se publicó. Si el cambio necesita una migración en
  `app-retail-lubricantes`, se une primero esa (y se espera su workflow)
  y después la de aquí.
