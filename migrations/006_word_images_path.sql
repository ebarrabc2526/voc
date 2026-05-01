-- Migración 006: pasar de BLOB a fichero en disco
-- Añade columna `path` (relativo a data/images/). image_data queda nullable
-- como compat durante la transición; tras volcar a fichero, se vacía a NULL.

-- SQLite no permite cambiar NOT NULL via ALTER, hay que recrear si quisiéramos
-- pasar image_data a nullable. Workaround simple: dejar columna como está,
-- y permitir BLOB vacío X'' tras el volcado.
ALTER TABLE word_images ADD COLUMN path TEXT;
CREATE INDEX IF NOT EXISTS idx_word_images_path ON word_images(path);
