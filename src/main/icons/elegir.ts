import { exeKey } from '@shared/games';

/**
 * Helpers puros del servicio de iconos: validar lo que llega del renderer, elegir el ejecutable que
 * representa a un juego y, en las apps de Microsoft Store, sacar el logo del manifiesto del paquete.
 * Sin IO: todo se prueba con datos.
 */

/** ¿Lleva caracteres de control (U+0000–U+001F)? Ningún nombre de juego ni de archivo los tiene. */
export function tieneControl(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) if (texto.charCodeAt(i) < 0x20) return true;
  return false;
}

/** Tope de longitud de lo que acepta el IPC: un nombre de juego o de `.exe` real cabe de sobra. */
export const MAX_ENTRADA = 260;

/**
 * Nombre de juego válido para `icons:for-game`: string no vacío y de longitud razonable. Devuelve el
 * nombre recortado, o null. El nombre solo se compara contra datos del main; nunca se ejecuta.
 */
export function validarNombreJuego(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const nombre = valor.trim();
  if (!nombre || nombre.length > MAX_ENTRADA || tieneControl(nombre)) return null;
  return nombre;
}

/**
 * Ejecutable válido para `icons:for-exe`: SOLO el nombre (`Discord.exe` o `discord`), nunca una ruta.
 * El renderer no elige qué archivo se lee: la ruta la resuelve el main con lo que él sabe. Devuelve la
 * clave `exeKey` (minúsculas, sin `.exe`), o null.
 */
export function validarEjecutable(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  if (!texto || texto.length > MAX_ENTRADA) return null;
  // Separadores, unidad (`C:`), comodines o caracteres de control: no es un nombre de archivo suelto.
  if (/[\\/:*?"<>|]/.test(texto) || tieneControl(texto)) return null;
  const clave = exeKey(texto);
  if (!clave || clave === '.' || clave === '..') return null;
  return clave;
}

/** Clave normalizada de un nombre de juego (comparaciones sin distinguir mayúsculas). */
export function claveNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/**
 * Clave de comparación entre nombres que vienen de sitios distintos: solo letras y números, en
 * minúsculas. El nombre guardado en un clip pierde los signos que Windows no admite en carpetas
 * (`Avatar  Frontiers of Pandora`) y los launchers añaden marcas (`Stellar Blade™`).
 */
export function claveCompacta(nombre: string): string {
  return nombre.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Sufijos de edición (ya compactos) que un launcher añade al nombre de un juego. Lista cerrada: nunca
 * números ni subtítulos, que distinguen secuelas y spin-offs («Hades II», «Elden Ring Nightreign»).
 */
const SUFIJOS_EDICION = [
  'intergrade',
  'remastered',
  'gameoftheyearedition',
  'goty',
  'gotyedition',
  'definitiveedition',
  'completeedition',
  'deluxeedition',
  'ultimateedition',
  'goldedition',
  'enhancededition',
  'directorscut',
  'anniversaryedition',
  'standardedition',
];

/**
 * El juego de `candidatos` que corresponde a un nombre visible:
 *   1. el de nombre igual (sin distinguir mayúsculas);
 *   2. el de nombre igual en letras y números (`claveCompacta`);
 *   3. el ÚNICO cuyo nombre es ese más un sufijo de edición (`… REMAKE INTERGRADE`).
 * Null si no hay ninguno o si el paso 3 es ambiguo.
 */
export function buscarPorNombre<T extends { name: string }>(nombre: string, candidatos: T[]): T | null {
  const clave = claveNombre(nombre);
  const exacto = candidatos.find((c) => claveNombre(c.name) === clave);
  if (exacto) return exacto;
  const compacta = claveCompacta(nombre);
  if (!compacta) return null;
  const igual = candidatos.find((c) => claveCompacta(c.name) === compacta);
  if (igual) return igual;
  const conEdicion = candidatos.filter((c) => {
    const otra = claveCompacta(c.name);
    return otra.startsWith(compacta) && SUFIJOS_EDICION.includes(otra.slice(compacta.length));
  });
  const unicos = new Set(conEdicion.map((c) => claveCompacta(c.name)));
  return unicos.size === 1 ? conEdicion[0] : null;
}

/** Letras y dígitos en minúsculas: `Monster Hunter Wilds` → `monsterhunterwilds`. */
function compacto(texto: string): string {
  return texto.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Exes que viven junto al juego pero no lo representan. Complementa a `ignorarExe` del escaneo (que ya
 * quita launchers, `*_EAC`, crash reporters, helpers e instaladores): esto solo resta puntos, porque a
 * veces es lo único que hay (un juego cuyo único exe es su editor sigue teniendo icono).
 */
const SECUNDARIOS =
  /(server|dedicated|editor|tool|config|settings|benchmark|report|updater|uploader|handler|launcher|_eac|anticheat|crash|helper|setup|unins|vrmode|console|cmd|artbook|soundtrack)/i;

export interface OpcionesEleccion {
  /**
   * Claves `exeKey` con preferencia, de más a menos: el exe que se vio en ejecución para ese juego va
   * primero; luego los que el índice asigna a ese juego.
   */
  preferidas?: string[];
}

/**
 * El ejecutable más representativo de un juego entre las rutas encontradas en su carpeta:
 *
 *   1. el que se vio en ejecución / el del índice (`preferidas`, en ese orden);
 *   2. el que más se parece al nombre del juego (`MonsterHunterWilds.exe` para «Monster Hunter Wilds»);
 *   3. los `*-Shipping` de Unreal (el proceso real del juego);
 *   4. el menos profundo (el de la raíz suele ser el bueno).
 *
 * Los secundarios (servidores, editores, launchers…) restan. Sin rutas, null.
 */
export function elegirEjecutable(
  nombreJuego: string,
  rutas: string[],
  opciones: OpcionesEleccion = {},
): string | null {
  if (rutas.length === 0) return null;
  const preferidas = (opciones.preferidas ?? []).map((k) => k.toLowerCase());
  const nombre = compacto(nombreJuego);

  const puntuar = (ruta: string): number => {
    const clave = exeKey(ruta);
    const base = compacto(clave);
    let puntos = 0;
    const idx = preferidas.indexOf(clave);
    if (idx >= 0) puntos += 1000 - idx * 10;
    if (nombre && base) {
      if (base === nombre) puntos += 300;
      else if (base.includes(nombre) || nombre.includes(base)) puntos += 150;
      else if (base.slice(0, 4) === nombre.slice(0, 4)) puntos += 40;
    }
    if (/shipping/i.test(clave)) puntos += 60;
    if (SECUNDARIOS.test(clave)) puntos -= 400;
    // Profundidad: cada nivel de carpeta resta un poco (desempate).
    puntos -= ruta.split(/[\\/]/).length;
    return puntos;
  };

  let mejor = rutas[0];
  let mejorPuntos = puntuar(mejor);
  for (const ruta of rutas.slice(1)) {
    const p = puntuar(ruta);
    if (p > mejorPuntos) {
      mejor = ruta;
      mejorPuntos = p;
    }
  }
  return mejor;
}

/** ¿La ruta es de una app empaquetada (Microsoft Store), real o alias de ejecución? */
export function esRutaStore(ruta: string): boolean {
  return /[\\/]WindowsApps[\\/]/i.test(ruta);
}

/**
 * Alias de ejecución de la Store: `%LOCALAPPDATA%\Microsoft\WindowsApps\<PackageFamilyName>\X.exe`.
 * Devuelve el `PackageFamilyName` (`SpotifyAB.SpotifyMusic_zpdnekdrzrea0`), o null si no lo es.
 */
export function familiaDeAlias(ruta: string): string | null {
  const m = /[\\/]Microsoft[\\/]WindowsApps[\\/]([^\\/]+)[\\/][^\\/]+$/i.exec(ruta);
  if (!m) return null;
  // Formato `<Nombre>_<PublisherId>`: el id del editor son 13 caracteres en base32.
  return /^[\w.-]+_[a-z0-9]{13}$/i.test(m[1]) ? m[1] : null;
}

/**
 * Logo de la app según su `AppxManifest.xml`: `Square44x44Logo` (el de la barra de tareas), y si no,
 * `Square150x150Logo` o `<Logo>`. Devuelve la ruta relativa al paquete tal como la escribe el
 * manifiesto (`Assets\Square44x44Logo.png`), o null.
 */
export function logoDelManifiesto(xml: string): string | null {
  const atributo = (nombre: string): string | null =>
    new RegExp(`\\b${nombre}\\s*=\\s*"([^"]+)"`, 'i').exec(xml)?.[1] ?? null;
  const candidato =
    atributo('Square44x44Logo') ??
    atributo('Square150x150Logo') ??
    /<Logo>\s*([^<]+?)\s*<\/Logo>/i.exec(xml)?.[1] ??
    null;
  if (!candidato || /^(ms-|https?:)/i.test(candidato)) return null;
  // Nunca fuera del paquete: una ruta absoluta o con `..` no es un recurso del paquete.
  if (/^[a-z]:|^[\\/]/i.test(candidato) || /(^|[\\/])\.\.([\\/]|$)/.test(candidato)) return null;
  return candidato;
}

/**
 * De los PNG reales junto al logo (los recursos llevan calificadores en el nombre:
 * `Square44x44Logo.targetsize-64_altform-unplated.png`, `Square44x44Logo.scale-200.png`), el más
 * adecuado para un icono de 64 px sobre fondo oscuro:
 *
 *   - `targetsize-N` antes que `scale-N` (es el icono pensado para ese tamaño, sin la placa de color);
 *   - el tamaño más cercano a 64 por arriba (o el mayor que haya por debajo);
 *   - `altform-unplated` suma (sin placa); `lightunplated` y `contrast-*` restan (tema claro / alto
 *     contraste).
 *
 * `logo` es el nombre del manifiesto (`Square44x44Logo.png`); `archivos`, los nombres de su carpeta.
 * Devuelve el nombre elegido (o el propio `logo` si existe sin calificar), o null.
 */
export function elegirArchivoLogo(logo: string, archivos: string[]): string | null {
  const punto = logo.lastIndexOf('.');
  const raiz = (punto > 0 ? logo.slice(0, punto) : logo).toLowerCase();
  const ext = (punto > 0 ? logo.slice(punto) : '.png').toLowerCase();
  const baseLado = /(\d+)x\d+/i.exec(raiz)?.[1];
  const ladoBase = baseLado ? Number(baseLado) : 44;

  let mejor: string | null = null;
  let mejorPuntos = Number.NEGATIVE_INFINITY;
  for (const archivo of archivos) {
    const bajo = archivo.toLowerCase();
    if (!bajo.endsWith(ext)) continue;
    const sinExt = bajo.slice(0, -ext.length);
    let calificadores: string;
    if (sinExt === raiz) calificadores = '';
    else if (sinExt.startsWith(`${raiz}.`)) calificadores = sinExt.slice(raiz.length + 1);
    else continue;

    let puntos = 0;
    let lado = ladoBase; // sin calificadores: el tamaño nominal
    const target = /targetsize-(\d+)/.exec(calificadores);
    const escala = /scale-(\d+)/.exec(calificadores);
    if (target) {
      lado = Number(target[1]);
      puntos += 50;
    } else if (escala) {
      lado = Math.round((ladoBase * Number(escala[1])) / 100);
    }
    // Cerca de 64 por arriba es lo ideal; por debajo se ve borroso al escalar.
    puntos += lado >= 64 ? 200 - (lado - 64) / 4 : 100 - (64 - lado) * 2;
    if (/altform-unplated/.test(calificadores)) puntos += 40;
    if (/altform-lightunplated|contrast-/.test(calificadores)) puntos -= 120;
    if (puntos > mejorPuntos) {
      mejor = archivo;
      mejorPuntos = puntos;
    }
  }
  return mejor;
}
