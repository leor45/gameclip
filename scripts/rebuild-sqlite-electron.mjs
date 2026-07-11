// Deja el alias better-sqlite3-electron con el prebuild oficial para la ABI de Electron.
// El paquete better-sqlite3 normal conserva su binario de Node (lo usa el server); el main
// de Electron importa el alias. Corre en postinstall; si falla (sin red), la app arranca
// igual y la biblioteca reporta el error en vez de crashear.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

let electronVersion;
let aliasDir;
try {
  electronVersion = require('electron/package.json').version;
  aliasDir = dirname(require.resolve('better-sqlite3-electron/package.json'));
} catch {
  console.log('[sqlite-electron] electron o el alias no están instalados; nada que hacer.');
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [
    require.resolve('prebuild-install/bin.js'),
    '--runtime=electron',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
  ],
  { cwd: aliasDir, stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error(
    `[sqlite-electron] no se pudo descargar el prebuild para Electron ${electronVersion}.`,
  );
  process.exit(result.status ?? 1);
}
console.log(`[sqlite-electron] binario listo para Electron ${electronVersion} (${process.arch}).`);
