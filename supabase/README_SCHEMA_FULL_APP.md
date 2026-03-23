# Schema completo de la app (Supabase)

Archivo principal:

- `supabase/schema_full_app.sql`

## Qué incluye

- Usuarios y roles
- Catalogos (tipos, marcas, modelos, materiales)
- Inventario de equipos
- Ordenes + fotos de orden
- Liquidaciones + equipos/materiales/fotos de liquidacion
- Clientes + fotos/historial/equipos historial
- Asignaciones de materiales a tecnicos

## Cómo ejecutarlo

1. Entra a tu proyecto Supabase.
2. Ve a **SQL Editor**.
3. Copia y ejecuta el contenido de:
   - `supabase/schema_full_app.sql`

## Nota

- Este esquema está diseñado para migrar la estructura que hoy guardas en `localStorage`.
- No cambia tu frontend por sí solo.
- Si quieres luego te preparo:
  - migrador de todas las entidades (`ordenes`, `liquidaciones`, `inventario`, etc.),
  - integración de lectura/escritura en `App.jsx` con `@supabase/supabase-js`.

