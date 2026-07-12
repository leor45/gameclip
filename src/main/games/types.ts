/** Launcher del que salió un juego instalado. Solo informativo (logs, diagnóstico). */
export type GameSourceId = 'steam' | 'epic' | 'xbox' | 'gog' | 'registry';

/** Un juego instalado, tal como lo declara su launcher. */
export interface InstalledGame {
  /** Nombre del catálogo: `ARC Raiders`, `Marvel's Spider-Man: Miles Morales`. */
  name: string;
  /** Carpeta de instalación; de ahí se sacan los ejecutables. */
  installDir: string;
  source: GameSourceId;
}

/**
 * Una fuente = un launcher. Contrato único para poder enchufar launchers nuevos sin tocar nada más.
 * **Toda fuente devuelve `[]` ante cualquier error**: un launcher raro (o un formato que cambió)
 * nunca puede tumbar el índice ni la app. Asíncrona porque algunas consultan el registro.
 */
export interface GameSource {
  id: GameSourceId;
  listInstalledGames(): Promise<InstalledGame[]>;
}
