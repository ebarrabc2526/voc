-- VOC – English Vocabulary Master
-- Migración 003: soporte de polisemia y limpieza de duplicados espurios
--
-- Permite que una misma palabra inglesa tenga múltiples traducciones
-- distintas según la categoría (ej. record→registro [work] vs record→grabar [verbos]),
-- pero prohíbe duplicados exactos dentro del mismo (word, level, category).

-- 1) Desduplicar filas exactas accidentales (mismo word+level+category+translation).
DELETE FROM words
WHERE id NOT IN (
  SELECT MIN(id) FROM words
  GROUP BY word, level, category, translation
);

-- 2) Colapsar duplicados (word, level, category) con distinta traducción:
--    conservar la fila de menor id (la primera insertada).
DELETE FROM words
WHERE id NOT IN (
  SELECT MIN(id) FROM words GROUP BY word, level, category
);

-- 3) Índice único: una sola entrada por (word, level, category).
--    Distintas categorías → distintos sentidos permitidos.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_words_word_level_cat
  ON words(word, level, category);
