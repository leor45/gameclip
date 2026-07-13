import { net } from 'electron';
import type { UpdateCheckResult } from '@shared/ipc';
import { isNewer } from '@shared/version';

const RELEASES_API = 'https://api.github.com/repos/leor45/gameclip/releases/latest';
/** Página a la que mandar al usuario; válida incluso si la API falla. */
const RELEASES_PAGE = 'https://github.com/leor45/gameclip/releases/latest';
const TIMEOUT_MS = 5000;

/** JSON de GitHub que nos interesa (el resto de campos se ignora). */
interface LatestRelease {
  tag_name?: unknown;
  html_url?: unknown;
}

export interface UpdateCheckDeps {
  /** Trae el JSON de releases/latest; inyectable en tests. Puede lanzar (lo maneja el caller). */
  fetchLatest?: () => Promise<LatestRelease | null>;
}

/**
 * Comprueba si hay una versión más nueva publicada en GitHub. **Nunca lanza**: cualquier fallo (sin
 * red, rate-limit, respuesta rara) se traduce en "no hay update", para que el chequeo silencioso del
 * arranque no rompa nada.
 */
export async function checkForUpdates(
  current: string,
  deps: UpdateCheckDeps = {},
): Promise<UpdateCheckResult> {
  const sinUpdate = (url = RELEASES_PAGE): UpdateCheckResult => ({
    current,
    latest: null,
    updateAvailable: false,
    url,
  });

  try {
    const data = await (deps.fetchLatest ?? fetchLatestRelease)();
    const tag = typeof data?.tag_name === 'string' ? data.tag_name : null;
    const url = typeof data?.html_url === 'string' ? data.html_url : RELEASES_PAGE;
    if (!tag) return sinUpdate(url);
    const latest = tag.replace(/^v/i, '');
    return { current, latest, updateAvailable: isNewer(latest, current), url };
  } catch {
    return sinUpdate();
  }
}

/** GET a la API de GitHub por el `net` de Electron (sin CORS/CSP), con timeout. */
function fetchLatestRelease(): Promise<LatestRelease> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url: RELEASES_API, method: 'GET' });
    request.setHeader('Accept', 'application/vnd.github+json');
    // GitHub rechaza peticiones sin User-Agent.
    request.setHeader('User-Agent', 'GameClip');

    const timer = setTimeout(() => {
      request.abort();
      reject(new Error('timeout'));
    }, TIMEOUT_MS);

    request.on('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        clearTimeout(timer);
        const status = response.statusCode;
        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as LatestRelease);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });

    request.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    request.end();
  });
}
