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
  del cliente ideal son informativos; estancado = 15 días; laboratorio
  Smart Assistance; un resultado crítico crea 3 compromisos (avisar en
  24 h, cambio de aceite, repetir la muestra); líneas: lubricantes,
  grasas y neumáticos; correo de la empresa en `mad4performance.com`.
- Todo texto de la interfaz en español de Venezuela, tuteando.
