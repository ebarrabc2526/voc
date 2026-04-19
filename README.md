# VOC – English Vocabulary Master

Juego de vocabulario inglés/español estilo *¿Quién quiere ser millonario?*  
Niveles CEFR A1–C2 · Pronunciación UK & US · Hall of Fame compartido

**Demo:** https://voc.ebarrab.com

---

## Características

- Niveles CEFR A1–C2 con categorías temáticas
- Modos EN→ES y ES→EN
- Retos: 10 preguntas, 100, 1000 e Infinito
- Ayudas: 50:50, Público y Experto
- Pronunciación UK y US con IPA
- Hall of Fame compartido entre todos los jugadores
- Login con Google (OAuth 2.0)

---

## Arquitectura

```
Apache (archivos estáticos + proxy)
    └── /api/* → Node.js :3000 (Express + better-sqlite3)
                    └── data/voc.db (SQLite)
```

| Fichero | Rol |
|---|---|
| `index.html` + `js/game.js` | Frontend (vanilla JS) |
| `server.js` | API REST (Express) |
| `migrations/001_schema.sql` | Definición del esquema de la DB |
| `data/words.sql` | Vocabulario CEFR (11.250 palabras, seed data) |
| `scripts/setup-db.js` | Crea la DB desde cero |
| `scripts/seed-from-pdf.js` | Añade vocabulario desde PDFs de Cambridge |

---

## Requisitos previos

- Node.js ≥ 18
- Apache 2.4 con `mod_proxy` y `mod_proxy_http`
- Una cuenta de Google Cloud con:
  - **OAuth 2.0 Client ID** (para el login de usuarios)
  - **Cloud Translation API** habilitada (para el seed de vocabulario)

---

## Instalación

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd voc
npm install
```

### 2. Variables de entorno

Crea el fichero `.env` en la raíz del proyecto:

```env
JWT_SECRET=cambia_esto_por_un_secreto_seguro
GOOGLE_TRANSLATION_API_KEY=tu_api_key_de_google_cloud
```

> `JWT_SECRET` se usa para firmar los tokens de sesión de usuario.  
> `GOOGLE_TRANSLATION_API_KEY` solo es necesaria si vas a añadir vocabulario con `npm run seed`.

### 3. Crear la base de datos

```bash
npm run setup
```

Esto aplica las migraciones de `migrations/` y carga las 11.250 palabras de `data/words.sql`.  
La DB se crea en `data/voc.db` (ignorada por git — nunca contiene datos de usuarios).

### 4. Configurar Google OAuth

El Client ID de Google está definido en dos sitios:

- `server.js` → constante `GOOGLE_CLIENT_ID`
- `js/game.js` → constante `GOOGLE_CLIENT_ID`

Sustitúyelos por tu propio Client ID de Google Cloud Console.  
En la consola de Google, añade tu dominio a los **Orígenes de JavaScript autorizados** y a las **URIs de redireccionamiento autorizadas**.

---

## Configuración del servidor (producción)

### Apache

Copia `apache-voc.conf` a `/etc/apache2/sites-available/` y ajusta `ServerName` y `DocumentRoot`:

```bash
sudo cp apache-voc.conf /etc/apache2/sites-available/voc.conf
sudo a2ensite voc
sudo a2enmod proxy proxy_http
sudo systemctl reload apache2
```

Copia los ficheros estáticos al `DocumentRoot`:

```bash
sudo cp -r index.html js/ css/ /var/www/voc/
```

### Servicio systemd

Copia `voc.service` a `/etc/systemd/system/` y ajusta `WorkingDirectory` y `User`:

```bash
sudo cp voc.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now voc
```

Verifica que arranca correctamente:

```bash
sudo systemctl status voc
```

---

## Ejecución en desarrollo

Sin Apache — el servidor Node sirve solo la API. Abre `index.html` directamente en el navegador o usa un servidor estático sencillo:

```bash
npm start                        # arranca la API en http://localhost:3000
npx serve .                      # sirve el frontend en http://localhost:3000 (opcional)
```

> En local, las llamadas a `/api/*` desde `index.html` necesitan que el servidor esté en el mismo origen o que configures un proxy en tu servidor de desarrollo.

---

## Añadir vocabulario

Para añadir palabras desde un PDF de Cambridge:

```bash
npm run seed data/B2_First_Wordlist.pdf B2
```

Requiere `GOOGLE_TRANSLATION_API_KEY` en `.env`. El script es idempotente (ignora palabras ya existentes).

Tras añadir vocabulario, regenera `data/words.sql` para mantenerlo sincronizado:

```bash
node -e "
const db = require('better-sqlite3')('data/voc.db');
const fs = require('fs');
const rows = db.prepare('SELECT word,translation,level,category,uk_ipa,us_ipa FROM words ORDER BY level,category,word').all();
// ... (ver scripts/export-words.js si lo creas)
"
```

O bien ejecuta directamente desde SQLite:

```bash
sqlite3 data/voc.db .dump | grep '^INSERT INTO words' > data/words.sql
```

---

## Migraciones

Las migraciones se aplican en orden alfabético desde `migrations/`.  
Para añadir una nueva tabla o columna, crea un fichero nuevo:

```bash
# Ejemplo: añadir tabla de logros
touch migrations/002_achievements.sql
# edita el fichero con el SQL necesario
npm run setup --force   # solo si necesitas recrear la DB desde cero
```

En producción, aplica la migración manualmente sobre la DB existente:

```bash
sqlite3 data/voc.db < migrations/002_achievements.sql
```

---

## Variables de entorno — referencia

| Variable | Obligatoria | Descripción |
|---|---|---|
| `JWT_SECRET` | Sí (producción) | Secreto para firmar JWT de sesión |
| `GOOGLE_TRANSLATION_API_KEY` | Solo para seed | Clave de Google Cloud Translation API |
| `PORT` | No (defecto: 3000) | Puerto del servidor Node.js |
