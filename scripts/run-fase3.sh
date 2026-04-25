#!/bin/bash
LOG=/home/ebarrab/pro/voc/data/fase3.log
SCRIPT=/home/ebarrab/pro/voc/scripts/reforma-fase3-coherencia.js

echo "[$(date '+%F %T')] === Iniciando wrapper fase3 ===" >> "$LOG"

while true; do
  node "$SCRIPT" >> "$LOG" 2>&1
  EXIT=$?
  if [ $EXIT -eq 0 ]; then
    echo "[$(date '+%F %T')] Completado con éxito." >> "$LOG"
    break
  fi
  echo "[$(date '+%F %T')] Terminó con código $EXIT. Reintentando en 15s..." >> "$LOG"
  sleep 15
done
