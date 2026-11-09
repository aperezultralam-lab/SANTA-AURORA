POSADA 2026 · GRUPO ULTRALAM
PAQUETE LISTO PARA RENDER (PENDIENTE PUBLICACIÓN Y AUTORIZACIÓN)
============================================================

ESTADO ACTUAL
- Página de invitación terminada: public/index.html
- Imagen de vista previa para WhatsApp: public/og-posada.jpg
- Código del registro para Google Sheets: apps-script/Code.gs
- Configuración opcional de Render: render.yaml
- El diseño original, logos y fecha/hora/lugar fueron conservados.
- No se envían mensajes de WhatsApp ni SMS.
- El registro no está activo hasta publicar Apps Script e insertar su URL.
- No hay todavía enlace público publicado ni se han realizado confirmaciones reales de prueba.

1. PREPARAR GOOGLE APPS SCRIPT (UNA SOLA VEZ)
1) Abre la hoja: https://docs.google.com/spreadsheets/d/1Wfs_OGgfajWOhGor9v6vn55Irqdmzhp_8JwFgA1zpOU/edit
2) En la barra: Extensiones > Apps Script (preferible vincularlo a esa hoja).
3) En Code.gs, pega TODO el contenido del archivo apps-script/Code.gs.
   Si el proyecto ya tiene un script de confirmaciones funcionando,
   usa un NUEVO proyecto para evitar interrumpirlo; NO borres el original sin respaldo.
4) Guarda. Pulsa Implementar > Nueva implementación > Aplicación web.
5) Ejecutar como: «Yo» (propietario del Google Sheets).
6) Quién tiene acceso: «Cualquier persona» (incluso sin iniciar sesión).
   La opción puede estar restringida por la configuración de Google Workspace.
7) Autoriza el acceso a tu hoja y copia la URL pública terminada en /exec.
8) Abre esa URL desde una ventana privada para comprobar que no pide iniciar sesión.

2. CONECTAR EL SITIO
En public/index.html, busca esta línea:
  const APPS_SCRIPT_URL = 'PEGA_AQUI_URL_APPS_SCRIPT';
Sustituye SOLO el texto PEGA_AQUI_URL_APPS_SCRIPT por la URL de /exec.
No cambies las comillas ni pongas WhatsApp, teléfono o Google Sheets en este campo.

3. PUBLICAR EL SITIO EN RENDER GRATIS
1) Crea un repositorio de GitHub y sube la carpeta «public» y render.yaml.
2) En https://dashboard.render.com selecciona New > Static Site.
3) Conecta ese repositorio (requiere autorizar la conexión GitHub-Render).
4) Configura:
     Name: posada-grupo-ultralam-2026 (o un nombre disponible)
     Branch: main
     Build Command: echo "Sitio listo"
     Publish Directory: public
5) Pulsa Create Static Site.
6) Copia la URL REAL HTTPS asignada: https://NOMBRE-REAL.onrender.com/
7) EN public/index.html sustituye TODAS las apariciones de
     https://TU-SITIO.onrender.com/
   por la URL HTTPS real de Render. Son las etiquetas de vista previa.
8) Guarda los cambios en GitHub y espera el nuevo deploy automático.
9) Comprueba desde datos móviles y Wi-Fi que abre sin login.

4. PRUEBA FINAL ANTES DE COMPARTIR
- Abre URL pública en incógnito, sin Google iniciado.
- Pulsa «Confirmar mi asistencia». Debe abrir nombre, celular y respuesta.
- Envía un registro de prueba con un celular bajo control del equipo.
- Verifica que se agregó a Posada_Asistencias (no Posada_Ajustes).
- Repite el mismo celular: debe conservar un único registro por evento.
- Verifica que NO se envía WhatsApp, SMS ni correo al teléfono registrado.
- Prueba enlace de Google Maps y descarga .ics de calendario.
- Envía la URL HTTPS por WhatsApp a un contacto de prueba.
- La vista previa debe mostrar la foto og-posada.jpg, título y descripción.
  WhatsApp puede almacenar temporalmente una vista previa antigua en caché.
  Nunca envíes file:/// ni el archivo HTML local como enlace.

5. IMPORTANTE SOBRE SEGURIDAD Y ACCESO
- Google Sheets permanece privado: no necesitas compartirlo con invitados.
- Apps Script corre como el propietario autorizado y escribe en el mismo Sheet.
- El formulario público tiene validación, bloqueo de duplicados por celular y un honeypot básico.
- Un celular no equivale a verificación de identidad: quien conozca el número
  podría registrarlo. Para mayor control, usar invitaciones individuales con token.
- No existe garantía absoluta frente a redes empresariales que bloqueen Render
  o Google, aunque el enlace HTTPS es público y se abre sin cuenta.
- Render Static Site es gratis sujeto a límites de uso y conexión Git.
- El editor PDF original es para uso administrativo y NO debe publicarse
  dentro de la carpeta «public».

6. ENLACE EN EL PDF ORIGINAL
Cuando Render esté activo, abre tu editable privado.
Sustituye «Enlace del botón Confirmar mi asistencia» por la URL pública:
  https://TU-SITIO-REAL.onrender.com/#asistencia
Guarda una nueva copia editable y exporta el PDF final.
Así el PDF enviará al invitado a la web pública para confirmar.

CONFIGURACIÓN DE EVENTO INCORPORADA DESDE TU ÚLTIMO EDITABLE
- Fecha: sábado 12 de diciembre de 2026
- Hora: 14:00 UTC-06
- Lugar: La Escondida Eventos
- Dirección: P.º de los Cisnes 201, Paseos del Lago, 45619 San Pedro Tlaquepaque, Jal.
- Google Maps: https://maps.app.goo.gl/3MN86rMHvifnB4QP8

NO SE MODIFICÓ EL GOOGLE SHEETS.
Este paquete prepara la integración y requiere los pasos de publicación.
