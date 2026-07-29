-- 1. Agregar columna 'area' a la tabla 'presentaciones'
ALTER TABLE public.presentaciones ADD COLUMN IF NOT EXISTS area NUMERIC;

-- 2. IMPORTANTE: Recargar la caché de la API de Supabase (PostgREST)
-- Esto soluciona el problema de que la aplicación no reconozca la columna recién agregada.
NOTIFY pgrst, 'reload schema';
