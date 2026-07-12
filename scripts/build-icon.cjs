// Genera build/icon.ico (y icon.png) desde build/icon.svg, rasterizando con el propio Electron:
// no hace falta ninguna dependencia de imágenes. Se corre a mano: `npm run icon`.
//
// CommonJS a propósito: este Electron (29) no arranca con un entrypoint .mjs.
//
// El rasterizado va por <canvas> dentro del renderer (dibujar el SVG y leer toDataURL), no por
// capturePage(): la captura depende del compositor y en una ventana offscreen puede no entregar
// nunca un frame. El canvas es determinista y respeta la transparencia de las esquinas.
//
// El .ico lleva las capas que Windows usa (16→256). Las chicas van como BMP (DIB) y solo la de 256
// como PNG: la API clásica de iconos (GDI+, y con ella parte del shell y muchas herramientas) NO
// sabe leer entradas comprimidas en PNG — las salta o las decodifica en basura. El PNG solo se
// admite desde Vista y en la práctica se reserva a la capa de 256, donde un BMP pesaría 256 KB.
const { appendFileSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { BrowserWindow, app, nativeImage } = require('electron');

const SALIDA = join(__dirname, '..', 'build');
const TAMANOS = [16, 24, 32, 48, 64, 128, 256];

// electron.exe es una app GUI en Windows: su stdout no llega a la consola que lo lanzó. El progreso
// va a build/icon.log para que el script se pueda diagnosticar cuando falla.
const LOG = join(SALIDA, 'icon.log');
const log = (mensaje) => {
  appendFileSync(LOG, `${mensaje}\r\n`);
  console.log(mensaje);
};

/** Dibuja el SVG en un canvas de `tamano` px y devuelve el PNG. */
async function rasterizar(win, svgDataUri, tamano) {
  const dataUrl = await win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = ${tamano};
        c.height = ${tamano};
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, ${tamano}, ${tamano});
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('el SVG no cargó'));
      img.src = ${JSON.stringify(svgDataUri)};
    })
  `);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/**
 * Convierte un PNG en la carga BMP que espera un .ico: BITMAPINFOHEADER + píxeles BGRA de abajo
 * hacia arriba + máscara AND. La máscara va en cero (el canal alfa ya lleva la transparencia), pero
 * tiene que estar igual: sin ella el tamaño no cuadra y el icono sale corrupto.
 */
function pngABmp(png, tamano) {
  // getBitmap() ya devuelve BGRA premultiplicado, que es justo el orden del DIB.
  const bgra = nativeImage.createFromBuffer(png).getBitmap();

  const cabecera = Buffer.alloc(40);
  cabecera.writeUInt32LE(40, 0); // biSize
  cabecera.writeInt32LE(tamano, 4); // biWidth
  cabecera.writeInt32LE(tamano * 2, 8); // biHeight: alto doble (imagen + máscara AND)
  cabecera.writeUInt16LE(1, 12); // biPlanes
  cabecera.writeUInt16LE(32, 14); // biBitCount
  cabecera.writeUInt32LE(0, 16); // biCompression = BI_RGB

  // Filas invertidas: el DIB se guarda de abajo hacia arriba.
  const pixeles = Buffer.alloc(tamano * tamano * 4);
  for (let y = 0; y < tamano; y++) {
    const origen = (tamano - 1 - y) * tamano * 4;
    bgra.copy(pixeles, y * tamano * 4, origen, origen + tamano * 4);
  }

  // Máscara AND: 1 bit por píxel, cada fila alineada a 4 bytes.
  const bytesPorFila = Math.ceil(tamano / 32) * 4;
  const mascara = Buffer.alloc(bytesPorFila * tamano); // en cero = todo opaco

  return Buffer.concat([cabecera, pixeles, mascara]);
}

/** Empaqueta las capas en un contenedor ICO (directorio de 16 bytes por capa + las cargas). */
function empaquetarIco(capas) {
  const cargas = capas.map(({ tamano, png }) =>
    // Solo la capa grande va en PNG; el resto en BMP, que es lo que lee la API clásica.
    tamano >= 256 ? png : pngABmp(png, tamano),
  );

  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // tipo 1 = icono
  cabecera.writeUInt16LE(capas.length, 4);

  let offset = 6 + capas.length * 16;
  const directorio = [];
  capas.forEach(({ tamano }, i) => {
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(tamano >= 256 ? 0 : tamano, 0); // 0 = 256 (no entra en un byte)
    entrada.writeUInt8(tamano >= 256 ? 0 : tamano, 1);
    entrada.writeUInt8(0, 2); // colores de la paleta
    entrada.writeUInt8(0, 3); // reservado
    entrada.writeUInt16LE(1, 4); // planos
    entrada.writeUInt16LE(32, 6); // bits por píxel
    entrada.writeUInt32LE(cargas[i].length, 8);
    entrada.writeUInt32LE(offset, 12);
    directorio.push(entrada);
    offset += cargas[i].length;
  });

  return Buffer.concat([cabecera, ...directorio, ...cargas]);
}

async function main() {
  let win;
  try {
    mkdirSync(SALIDA, { recursive: true });
    writeFileSync(LOG, '');
    log('[icono] electron listo');

    const svg = readFileSync(join(SALIDA, 'icon.svg'), 'utf8');
    const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    // Ventana oculta normal (sin `offscreen`): el canvas no necesita compositor, y el modo
    // offscreen deja el loadURL esperando un frame que nunca llega.
    win = new BrowserWindow({ show: false });
    await win.loadURL('data:text/html,<html><body></body></html>');
    log('[icono] renderer cargado');

    const capas = [];
    for (const tamano of TAMANOS) {
      capas.push({ tamano, png: await rasterizar(win, svgDataUri, tamano) });
      log(`[icono] ${tamano}x${tamano} listo`);
    }

    writeFileSync(join(SALIDA, 'icon.ico'), empaquetarIco(capas));
    // PNG grande suelto: fuente de respaldo y el que usan las plataformas que no leen .ico.
    writeFileSync(join(SALIDA, 'icon.png'), capas[capas.length - 1].png);
    log(`[icono] build/icon.ico (${TAMANOS.length} capas) y build/icon.png (256px)`);
  } catch (err) {
    log(`[icono] falló: ${(err && err.stack) || err}`);
    process.exitCode = 1;
  } finally {
    if (win) win.destroy();
    app.quit();
  }
}

app.whenReady().then(main);
