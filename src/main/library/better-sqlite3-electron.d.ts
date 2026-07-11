// El alias comparte el paquete (y los tipos) de better-sqlite3; solo cambia la ABI del binario.
declare module 'better-sqlite3-electron' {
  import Database from 'better-sqlite3';
  export = Database;
}
