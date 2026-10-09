import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

interface Props {
  src: string;
  /** Nombre accesible del reproductor (el título del clip). */
  title: string;
}

/** Pasos de velocidad: los mismos que ofrece el menú de los controles nativos de Chromium. */
export const VELOCIDADES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Saltos: ← → con el teclado; J L y los botones, el salto largo. */
export const SALTO_CORTO = 5;
export const SALTO_LARGO = 10;

/** Sin mover el ratón durante este tiempo y reproduciendo, los controles se ocultan. */
export const REPOSO_MS = 2000;

/** `m:ss` (o `h:mm:ss`) de unos segundos. */
export function formatoTiempo(segundos: number): string {
  const s = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function velocidadTexto(v: number): string {
  return v === 1 ? 'Normal' : `${String(v).replace('.', ',')}×`;
}

/** ¿El foco está en algo que usa esas teclas por sí mismo (campo, deslizador de volumen, menú)? */
function esControlPropio(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return true;
  return el.closest('[role="menu"]') !== null;
}

/**
 * Reproductor de vídeo del panel de la Biblioteca, con controles propios (sustituye a los nativos de
 * Chromium) y todo lo que aquellos ofrecían: reproducir y pausar, barra de posición, tiempo, volumen y
 * silencio, velocidad, imagen en imagen y pantalla completa. Además, retroceder y adelantar 10 s.
 *
 * Teclado (con el foco en el reproductor o en ninguna parte): Espacio/K reproducir, ← → ±5 s,
 * J L ±10 s, M silencio, F pantalla completa. ↑ ↓, Intro y Esc no se tocan: los atiende la Biblioteca.
 *
 * Quien lo monta lo desmonta al cambiar de clip (`key`): así se suelta el `<video>`, que en Windows
 * mantiene el archivo abierto.
 */
export default function VideoPlayer({ src, title }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pista = useRef<HTMLDivElement>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [actual, setActual] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [cargado, setCargado] = useState(0);
  const [volumen, setVolumen] = useState(1);
  const [silencio, setSilencio] = useState(false);
  const [velocidad, setVelocidad] = useState(1);
  const [menuVelocidad, setMenuVelocidad] = useState(false);
  const [reposo, setReposo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [destello, setDestello] = useState<{ lado: 'izq' | 'der'; texto: string; n: number } | null>(
    null,
  );
  const temporizadorReposo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const temporizadorDestello = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pipDisponible =
    typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);

  // ── Reposo: los controles se esconden tras REPOSO_MS sin mover el ratón ──
  const despertar = useCallback(() => {
    setReposo(false);
    if (temporizadorReposo.current) clearTimeout(temporizadorReposo.current);
    temporizadorReposo.current = setTimeout(() => setReposo(true), REPOSO_MS);
  }, []);
  useEffect(
    () => () => {
      if (temporizadorReposo.current) clearTimeout(temporizadorReposo.current);
      if (temporizadorDestello.current) clearTimeout(temporizadorDestello.current);
    },
    [],
  );

  // ── Posición fluida mientras se reproduce (timeupdate solo llega ~4 veces por segundo) ──
  useEffect(() => {
    if (!reproduciendo) return;
    let id = 0;
    const paso = () => {
      const v = video.current;
      if (v) setActual(v.currentTime);
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [reproduciendo]);

  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(document.fullscreenElement === raiz.current);
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  // ── Acciones ──
  const alternar = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused || v.ended) {
      if (v.ended) v.currentTime = 0;
      void v.play()?.catch(() => undefined);
    } else {
      v.pause();
    }
    despertar();
  }, [despertar]);

  const irA = useCallback((segundos: number) => {
    const v = video.current;
    if (!v) return;
    const fin = Number.isFinite(v.duration) ? v.duration : segundos;
    const destino = Math.max(0, Math.min(fin, segundos));
    v.currentTime = destino;
    setActual(destino);
  }, []);

  const saltar = useCallback(
    (delta: number) => {
      const v = video.current;
      if (!v) return;
      irA(v.currentTime + delta);
      if (temporizadorDestello.current) clearTimeout(temporizadorDestello.current);
      setDestello((d) => ({
        lado: delta < 0 ? 'izq' : 'der',
        texto: delta < 0 ? `« ${-delta} s` : `${delta} s »`,
        n: (d?.n ?? 0) + 1,
      }));
      temporizadorDestello.current = setTimeout(() => setDestello(null), 600);
      despertar();
    },
    [irA, despertar],
  );

  const alternarSilencio = useCallback(() => {
    const v = video.current;
    if (!v) return;
    // Quitar el silencio con el volumen a 0 no se oiría nada: vuelve a un volumen audible.
    if (v.muted && v.volume === 0) v.volume = 1;
    v.muted = !v.muted;
  }, []);

  const alternarPantallaCompleta = useCallback(() => {
    const el = raiz.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  }, []);

  const imagenEnImagen = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
    else void v.requestPictureInPicture?.().catch(() => undefined);
  }, []);

  const elegirVelocidad = useCallback((v: number) => {
    if (video.current) video.current.playbackRate = v;
    setMenuVelocidad(false);
  }, []);

  // ── Teclado: con el foco en el reproductor o en ninguna parte (recién abierto el clip) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const objetivo = e.target;
      const dentro = objetivo instanceof Node && raiz.current?.contains(objetivo);
      if (objetivo !== document.body && !dentro) return;
      if (esControlPropio(objetivo)) return;
      const enBoton = objetivo instanceof HTMLElement && objetivo.closest('button') !== null;
      const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (tecla) {
        case ' ':
          // Espacio sobre un botón es el clic de ese botón.
          if (enBoton) return;
          e.preventDefault();
          alternar();
          break;
        case 'k':
          e.preventDefault();
          alternar();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          saltar(-SALTO_CORTO);
          break;
        case 'ArrowRight':
          e.preventDefault();
          saltar(SALTO_CORTO);
          break;
        case 'j':
          e.preventDefault();
          saltar(-SALTO_LARGO);
          break;
        case 'l':
          e.preventDefault();
          saltar(SALTO_LARGO);
          break;
        case 'm':
          e.preventDefault();
          alternarSilencio();
          break;
        case 'f':
          e.preventDefault();
          alternarPantallaCompleta();
          break;
        case 'Home':
          e.preventDefault();
          irA(0);
          break;
        case 'End':
          e.preventDefault();
          irA(Number.POSITIVE_INFINITY);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alternar, saltar, alternarSilencio, alternarPantallaCompleta, irA]);

  // ── Barra de posición: clic y arrastre ──
  const fraccion = (clientX: number): number => {
    const r = pista.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const onPistaDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || duracion <= 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setArrastrando(true);
    irA(fraccion(e.clientX) * duracion);
  };
  const onPistaMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fraccion(e.clientX);
    setHover(f);
    if (arrastrando && duracion > 0) irA(f * duracion);
  };
  const onPistaUp = () => setArrastrando(false);

  // Menú de velocidad: Esc lo cierra sin cerrar el clip; ↑ ↓ recorren sus opciones.
  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setMenuVelocidad(false);
      raiz.current?.querySelector<HTMLButtonElement>('.vp-rate')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[j]?.focus();
    }
  };
  useEffect(() => {
    if (!menuVelocidad) return;
    raiz.current
      ?.querySelector<HTMLButtonElement>('.vp-rate-menu [aria-checked="true"]')
      ?.focus();
    const fuera = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (!raiz.current?.querySelector('.vp-rate-wrap')?.contains(e.target)) setMenuVelocidad(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [menuVelocidad]);

  const progreso = duracion > 0 ? Math.min(1, actual / duracion) : 0;
  const volumenVisible = silencio ? 0 : volumen;
  const clases = ['vp'];
  if (reproduciendo) clases.push('is-playing');
  if (reposo && reproduciendo && !menuVelocidad && !arrastrando) clases.push('is-idle');

  return (
    <div
      ref={raiz}
      className={clases.join(' ')}
      tabIndex={0}
      role="group"
      aria-label={`Reproductor: ${title}`}
      onPointerMove={despertar}
      onPointerDown={despertar}
    >
      <video
        ref={video}
        className="lib-player-video"
        data-testid="player-video"
        src={src}
        autoPlay
        onClick={alternar}
        onDoubleClick={alternarPantallaCompleta}
        onPlay={() => {
          setReproduciendo(true);
          despertar();
        }}
        onPause={() => setReproduciendo(false)}
        onEnded={() => setReproduciendo(false)}
        onTimeUpdate={(e) => setActual(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          setDuracion(Number.isFinite(d) ? d : 0);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuracion(Number.isFinite(d) ? d : 0);
        }}
        onProgress={(e) => {
          const v = e.currentTarget;
          const d = v.duration;
          if (v.buffered.length > 0 && Number.isFinite(d) && d > 0) {
            setCargado(v.buffered.end(v.buffered.length - 1) / d);
          }
        }}
        onVolumeChange={(e) => {
          setVolumen(e.currentTarget.volume);
          setSilencio(e.currentTarget.muted);
        }}
        onRateChange={(e) => setVelocidad(e.currentTarget.playbackRate)}
      />

      <div className="vp-big" aria-hidden="true">
        <PlayGlyph />
      </div>
      {destello && (
        <div key={destello.n} className={`vp-flash ${destello.lado}`} aria-hidden="true">
          {destello.texto}
        </div>
      )}

      <div className="vp-ctl">
        <div
          ref={pista}
          className={arrastrando ? 'vp-track is-drag' : 'vp-track'}
          role="slider"
          tabIndex={0}
          aria-label="Posición"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duracion)}
          aria-valuenow={Math.floor(actual)}
          aria-valuetext={`${formatoTiempo(actual)} de ${formatoTiempo(duracion)}`}
          onPointerDown={onPistaDown}
          onPointerMove={onPistaMove}
          onPointerUp={onPistaUp}
          onPointerCancel={onPistaUp}
          onPointerLeave={() => setHover(null)}
        >
          <div className="vp-rail">
            <div className="vp-buf" style={{ width: `${cargado * 100}%` }} />
            <div className="vp-fill" style={{ width: `${progreso * 100}%` }} />
          </div>
          <div className="vp-knob" style={{ left: `${progreso * 100}%` }} />
          {hover !== null && duracion > 0 && (
            <div className="vp-tip" style={{ left: `${hover * 100}%` }}>
              {formatoTiempo(hover * duracion)}
            </div>
          )}
        </div>

        <div className="vp-btns">
          <button
            type="button"
            className="vp-btn vp-play"
            aria-label={reproduciendo ? 'Pausa' : 'Reproducir'}
            title={reproduciendo ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'}
            onClick={alternar}
          >
            {reproduciendo ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button
            type="button"
            className="vp-btn"
            aria-label={`Retroceder ${SALTO_LARGO} segundos`}
            title={`Retroceder ${SALTO_LARGO} s (J)`}
            onClick={() => saltar(-SALTO_LARGO)}
          >
            <SkipGlyph dir="atras" />
          </button>
          <button
            type="button"
            className="vp-btn"
            aria-label={`Adelantar ${SALTO_LARGO} segundos`}
            title={`Adelantar ${SALTO_LARGO} s (L)`}
            onClick={() => saltar(SALTO_LARGO)}
          >
            <SkipGlyph dir="adelante" />
          </button>
          <div className="vp-vol">
            <button
              type="button"
              className="vp-btn"
              aria-label={silencio ? 'Activar sonido' : 'Silenciar'}
              title={silencio ? 'Activar sonido (M)' : 'Silenciar (M)'}
              onClick={alternarSilencio}
            >
              <VolumeGlyph mudo={silencio || volumen === 0} />
            </button>
            <input
              type="range"
              className="vp-vol-range"
              aria-label="Volumen"
              min={0}
              max={1}
              step={0.05}
              value={volumenVisible}
              style={{ '--vp-vol': `${volumenVisible * 100}%` } as CSSProperties}
              onChange={(e) => {
                const v = video.current;
                if (!v) return;
                const nuevo = Number(e.target.value);
                v.volume = nuevo;
                v.muted = nuevo === 0;
              }}
            />
          </div>
          <span className="vp-time">
            <b>{formatoTiempo(actual)}</b> / {formatoTiempo(duracion)}
          </span>
          <span className="vp-grow" />
          <div className="vp-rate-wrap">
            <button
              type="button"
              className="vp-btn vp-rate"
              aria-label={`Velocidad: ${velocidadTexto(velocidad)}`}
              aria-haspopup="menu"
              aria-expanded={menuVelocidad}
              title="Velocidad de reproducción"
              onClick={() => setMenuVelocidad((v) => !v)}
            >
              {velocidad === 1 ? '1×' : velocidadTexto(velocidad)}
            </button>
            {menuVelocidad && (
              <div className="vp-rate-menu" role="menu" aria-label="Velocidad" onKeyDown={onMenuKey}>
                {VELOCIDADES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="menuitemradio"
                    aria-checked={v === velocidad}
                    onClick={() => elegirVelocidad(v)}
                  >
                    {velocidadTexto(v)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {pipDisponible && (
            <button
              type="button"
              className="vp-btn"
              aria-label="Imagen en imagen"
              title="Imagen en imagen"
              onClick={imagenEnImagen}
            >
              <PipGlyph />
            </button>
          )}
          <button
            type="button"
            className="vp-btn"
            aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
            title={pantallaCompleta ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'}
            onClick={alternarPantallaCompleta}
          >
            <FullscreenGlyph salir={pantallaCompleta} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Glifos (SVG con currentColor) ──

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M7 4.5v15l12.5-7.5z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect fill="currentColor" x="6" y="4.5" width="4" height="15" rx="1" />
      <rect fill="currentColor" x="14" y="4.5" width="4" height="15" rx="1" />
    </svg>
  );
}

function SkipGlyph({ dir }: { dir: 'atras' | 'adelante' }) {
  const atras = dir === 'atras';
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={atras ? undefined : 'matrix(-1 0 0 1 24 0)'}
      >
        <path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" />
        <path d="M4.5 3.8v3.9h3.9" />
      </g>
      <text
        x="12.6"
        y="15.6"
        textAnchor="middle"
        fontSize="7.6"
        fontWeight="700"
        fill="currentColor"
        fontFamily="var(--font-ui)"
      >
        {SALTO_LARGO}
      </text>
    </svg>
  );
}

function VolumeGlyph({ mudo }: { mudo: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M4 9v6h4l5 4V5L8 9z" />
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        {mudo ? (
          <path d="M16.5 9.5l5 5m0-5l-5 5" />
        ) : (
          <path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.6 8.6 0 0 1 0 12" />
        )}
      </g>
    </svg>
  );
}

function PipGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="12" y="11.5" width="7" height="5.5" rx="1" fill="currentColor" />
    </svg>
  );
}

function FullscreenGlyph({ salir }: { salir: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        d={
          salir
            ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
            : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
        }
      />
    </svg>
  );
}
