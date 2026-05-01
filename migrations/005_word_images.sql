-- VOC – English Vocabulary Master
-- Migración 005: imágenes representativas por palabra

CREATE TABLE IF NOT EXISTS word_images (
  word_lower    TEXT NOT NULL,
  category      TEXT NOT NULL,
  image_data    BLOB NOT NULL,
  image_mime    TEXT NOT NULL DEFAULT 'image/svg+xml',
  source        TEXT,
  metadata      TEXT,
  generated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (word_lower, category)
);

CREATE INDEX IF NOT EXISTS idx_word_images_category ON word_images(category);
