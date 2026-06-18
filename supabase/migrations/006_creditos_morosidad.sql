-- Flag de morosidad en clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS moroso boolean DEFAULT false NOT NULL;

-- Flag de archivado en ventas (para cerrar créditos sin cambiar estado ni stock)
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS archivado boolean DEFAULT false NOT NULL;
