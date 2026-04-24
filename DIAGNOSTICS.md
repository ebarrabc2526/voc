# 🔧 Guía de Diagnóstico: Error "Token de Google inválido"

## Paso 1: Obtener logs del servidor

Para ver los errores detallados, necesitamos acceso a los logs. Si el servidor está corriendo:

```bash
# Ver logs en tiempo real
journalctl -u voc -f

# O si está en la terminal:
# Los logs aparecerán directamente
```

## Paso 2: Revisar la consola del navegador

Cuando tu amigo intente iniciar sesión:

1. Abre **Developer Tools** (F12 en Chrome/Firefox)
2. Ve a la pestaña **Console**
3. Intenta iniciar sesión y **copia todo lo que aparezca en rojo**

Debería ver algo como:
```
[FRONTEND] Token recibido de Google
[FRONTEND] Respuesta del servidor: 401
[FRONTEND] Error del servidor: Token de Google inválido
```

## Paso 3: Usar el endpoint de debug

Para inspeccionar el token sin procesarlo:

1. Obtén el token (F12 → Console):
```javascript
// Copia el token que aparece en localStorage
JSON.parse(localStorage.getItem('voc_auth'))
```

2. Envía una solicitud de debug:
```bash
curl -X POST http://tu-servidor.com/api/auth/debug \
  -H "Content-Type: application/json" \
  -d '{"credential": "PEGA_EL_TOKEN_AQUI"}'
```

O desde la consola del navegador:
```javascript
fetch('/api/auth/debug', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    credential: JSON.parse(localStorage.getItem('voc_auth')).token 
  })
}).then(r => r.json()).then(d => console.log(d))
```

## Causas comunes y soluciones

### 🔴 "audience does not match"
El Client ID no coincide. Verifica:
- El Client ID en `js/game.js` línea 158
- El Client ID en `server.js` línea 10
- Deben ser idénticos

### 🔴 "Token expirado"
El token de Google tiene 1 hora de validez. Prueba de nuevo.

### 🔴 "Protocolo/dominio incorrecto"
Si entras con `http://` pero Google espera `https://`:

En Google Cloud Console:
1. Ve a **APIs & Services** → **Credentials**
2. Edita el OAuth 2.0 Client ID
3. Verifica que los **Authorized JavaScript origins** incluyan:
   - `https://tu-dominio.com` (exacto, con protocolo)
   - No incluyas rutas (solo dominio)

### 🔴 "Invalid token format"
El token no es un JWT válido. Puede significar:
- El navegador no está usando la librería de Google correctamente
- La librería de Google no cargó (`https://accounts.google.com/gsi/client`)

## Información a compartir

Cuando reportes el problema, incluye:

```javascript
// Abre la consola (F12) y ejecuta:
{
  clientId: '766212808659-7krp4oj0n0lf2584ntalksa1m9el5iqi.apps.googleusercontent.com',
  origin: window.location.origin,
  userAgent: navigator.userAgent,
  timestamp: new Date().toISOString()
}
```

Esto ayudará a diagnosticar si es un problema de:
- Dominio incorrecto
- Navegador incompatible
- Zona horaria del servidor
