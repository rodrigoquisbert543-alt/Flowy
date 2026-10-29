# Instalar Flowy como aplicación

## 1. Publicar el backend
En Apps Script: **Implementar > Nueva implementación > Aplicación web** (ejecutar como: yo, acceso: cualquiera). Copia la URL que termina en `/exec`.

## 2. App instalable (celular, tablet, PC) — carpeta `pwa/`
1. Pega la URL en `APP_URL` de `pwa/index.html`.
2. Sube la carpeta `pwa/` a un hosting HTTPS gratuito (GitHub Pages, Netlify, Firebase Hosting).
3. Abre ese enlace e instala:
   - **Android/Chrome/Edge/Windows/Mac/Linux:** botón "Instalar" en la barra de direcciones o menú > *Instalar aplicación*.
   - **iPhone/iPad (Safari):** Compartir > *Agregar a pantalla de inicio*.

## 3. Ejecutable de escritorio — carpeta `desktop/`
1. Pega la URL en `APP_URL` de `desktop/main.js` (o define la variable `FLOWY_URL`).
2. Requiere Node.js. En `desktop/`:
   ```
   npm install
   npm run build:win     # .exe instalador (Windows)
   npm run build:mac     # .dmg (compilar desde un Mac)
   npm run build:linux   # AppImage / .deb
   ```
3. Los instaladores quedan en `desktop/dist/`.

Nota: el sistema necesita internet, porque los datos viven en Google Sheets.
