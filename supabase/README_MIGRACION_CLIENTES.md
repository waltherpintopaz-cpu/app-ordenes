# Migracion de Clientes a Supabase

Estos archivos NO cambian tu `src/App.jsx`. Solo preparan migracion de datos.

## 1) Crear tablas en Supabase

1. Abre Supabase -> SQL Editor.
2. Ejecuta el contenido de:
   - `supabase/schema_clientes.sql`

## 2) Exportar clientes desde localStorage

1. Abre tu app en navegador.
2. Abre DevTools -> Console.
3. Copia y ejecuta el contenido de:
   - `supabase/export_localstorage_clientes.js`
4. Se descargara `clientes_export.json`.
5. Copia ese archivo a:
   - `app-ordenes/supabase/clientes_export.json`

## 3) Instalar dependencia del script

```powershell
npm install @supabase/supabase-js
```

## 4) Configurar variables de entorno (PowerShell)

```powershell
$env:SUPABASE_URL="https://TU-PROYECTO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
```

Opcional archivo de entrada personalizado:

```powershell
$env:INPUT_FILE="D:\\ruta\\clientes_export.json"
```

## 5) Ejecutar migracion

```powershell
node supabase/migrate_clientes_to_supabase.mjs
```

## Notas

- El script hace `upsert` por `dni` en `clientes`.
- Para cada cliente reemplaza hijos (`fotos`, `historial`, `equipos`) para mantener consistencia.
- `fecha_registro`, `ultima_actualizacion`, `fecha_liquidacion`, `fecha`:
  si no se pueden parsear, se guardan en `null`.
- Imagenes:
  actualmente se guardan en campos de texto (`foto_url` / `foto_fachada`).
  Luego puedes moverlas a Supabase Storage y actualizar URLs.

