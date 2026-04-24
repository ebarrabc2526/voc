#!/bin/bash
cd /home/ebarrab/pro/voc
node scripts/seed-from-pdf.js data/A2_Key_Vocabulary.pdf A2 --delay=350 >> /tmp/seed-A2.log 2>&1 && \
node scripts/seed-from-pdf.js data/B1_Preliminary_Vocabulary.pdf B1 --delay=350 >> /tmp/seed-B1.log 2>&1 && \
node scripts/seed-from-pdf.js data/B2_First_Wordlist.pdf B2 --delay=350 >> /tmp/seed-B2.log 2>&1 && \
node scripts/seed-from-pdf.js data/C1_Advanced_Wordlist.pdf C1 --delay=350 >> /tmp/seed-C1.log 2>&1 && \
node scripts/seed-from-pdf.js data/C2_Proficiency_Wordlist.pdf C2 --delay=350 >> /tmp/seed-C2.log 2>&1
echo "COMPLETADO"
