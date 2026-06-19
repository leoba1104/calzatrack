-- Migration 007: Add tipo column and normalize estado on ventas
-- tipo separates the "kind" of sale (contado/apartado/credito) from its lifecycle estado (pendiente/pagada/anulada)

-- Step 1: add tipo column (default 'contado' for all existing rows)
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'contado'
  CHECK (tipo IN ('contado', 'apartado', 'credito'));

-- Step 2: backfill tipo from the old estado values
UPDATE ventas SET tipo = 'apartado' WHERE estado = 'apartado';
UPDATE ventas SET tipo = 'credito'  WHERE estado = 'credito';
-- contado rows: everything else (borrador, pagada, anulada) stays as 'contado'

-- Step 3: drop old CHECK constraint BEFORE changing estado values
--   (the old constraint blocks 'pendiente' so must be removed first)
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;

-- Step 4: rewrite estado for rows that used estado as tipo
--   'borrador'  → 'pendiente'
--   'apartado'  → 'pendiente'  (now encoded in tipo)
--   'credito'   → 'pendiente'  (now encoded in tipo)
UPDATE ventas SET estado = 'pendiente' WHERE estado IN ('borrador', 'apartado', 'credito');

-- Step 5: add new normalized CHECK constraint
ALTER TABLE ventas
  ADD CONSTRAINT ventas_estado_check
  CHECK (estado IN ('pendiente', 'pagada', 'anulada'));

-- Also apply moroso and archivado columns if migration 006 was not yet run
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS moroso   boolean NOT NULL DEFAULT false;
ALTER TABLE ventas   ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false;
