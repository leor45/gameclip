// Comparación de versiones "X.Y.Z". Numérica y propia: un semver de tres números no justifica una
// dependencia nueva. No manejamos prereleases (GitHub `releases/latest` ya los excluye), así que
// cualquier sufijo tras el patch se ignora.

/** <0 si a<b, 0 si iguales, >0 si a>b (como el compareFn de Array.sort). */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** ¿`latest` es estrictamente más nueva que `current`? */
export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

/** "v1.2.3" | "1.2" | "1.2.3-rc1" → [1,2,3]. Faltantes o basura → 0. */
function parseVersion(v: string): [number, number, number] {
  const partes = v.trim().replace(/^v/i, '').split('.');
  const n = (i: number): number => {
    const parsed = Number.parseInt(partes[i] ?? '', 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return [n(0), n(1), n(2)];
}
