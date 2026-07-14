import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AudioDeviceInfo, CaptureSettings, EncoderInfo } from '@shared/capture';
import { HapticMuteListener } from '../capture/app-audio-mute';
import { ControllerCaptureListener } from '../capture/controller-capture';
import { CaptureManager, gameExecutableForName } from '../capture/manager';
import type { CaptureBackend, ClipSavedInfo } from '../capture/manager';
import { SettingsStore } from '../capture/settings-store';

/** Listener del háptico sin binario: apply/stop son no-op, nunca spawnea un proceso real. */
const noopHapticListener = () => new HapticMuteListener({ helperPath: () => null, spawn: () => ({ kill() {}, on() {} }) }); // prettier-ignore
/** Listener del botón de mandos sin binario: apply/stop son no-op. */
const noopControllerListener = () => new ControllerCaptureListener({ helperPath: () => null, spawn: () => ({ kill() {}, on() {}, onLine() {} }) }); // prettier-ignore

/** Backend falso: registra llamadas y no toca libobs. */
class FakeObs implements CaptureBackend {
  isInitialized = false;
  bufferActivo = false;
  grabando = false;
  llamadas: string[] = [];
  buildCount = 0;
  /** Último ejecutable de juego recibido por buildPipeline. */
  ultimoGameExe: string | null = null;
  /** Último ejecutable religado en caliente vía updateGameAudioTarget. */
  ultimoGameAudioTarget: string | null = null;
  updateGameAudioCount = 0;

  init(): void {
    this.isInitialized = true;
    this.llamadas.push('init');
  }
  getAvailableEncoders(): EncoderInfo[] {
    return [];
  }
  getAudioDevices(): AudioDeviceInfo[] {
    return [];
  }
  buildPipeline(
    _settings: CaptureSettings,
    _screen: { width: number; height: number; x: number; y: number },
    _outputDir: string,
    gameExecutable: string | null,
  ): void {
    this.llamadas.push('buildPipeline');
    this.buildCount++;
    this.ultimoGameExe = gameExecutable;
    this.bufferActivo = false;
  }
  updateGameAudioTarget(executable: string | null): void {
    this.llamadas.push('updateGameAudioTarget');
    this.ultimoGameAudioTarget = executable;
    this.updateGameAudioCount++;
  }
  ultimoGameCaptureTarget: string | null = null;
  updateGameCaptureTarget(executable: string | null): void {
    this.llamadas.push('updateGameCaptureTarget');
    this.ultimoGameCaptureTarget = executable;
  }
  micMuted: boolean | null = null;
  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
  }
  startReplayBuffer(): Promise<void> {
    this.llamadas.push('startReplayBuffer');
    this.bufferActivo = true;
    return Promise.resolve();
  }
  stopReplayBuffer(): Promise<void> {
    this.llamadas.push('stopReplayBuffer');
    this.bufferActivo = false;
    return Promise.resolve();
  }
  /** Rutas que libobs "devuelve" al guardar; los tests de reubicación las apuntan a archivos reales. */
  archivoReplay = 'C:\\v\\replay.mp4';
  archivoGrabacion = 'C:\\v\\clip.mp4';
  saveReplay(): Promise<string> {
    this.llamadas.push('saveReplay');
    return Promise.resolve(this.archivoReplay);
  }
  startRecording(): Promise<void> {
    this.llamadas.push('startRecording');
    this.grabando = true;
    return Promise.resolve();
  }
  stopRecording(): Promise<string> {
    this.llamadas.push('stopRecording');
    this.grabando = false;
    return Promise.resolve(this.archivoGrabacion);
  }
  /** Pistas nombradas que el manager remuxará; null = no aplica (por defecto). */
  tracks: { index: number; name: string }[] | null = null;
  namedTracks(): { index: number; name: string }[] | null {
    return this.tracks;
  }
  shutdown(): void {
    this.llamadas.push('shutdown');
  }
}

describe('CaptureManager (modos de buffer y detección de juegos)', () => {
  let dir: string;
  let obs: FakeObs;
  let remuxCalls: { file: string; tracks: { index: number; name: string }[] }[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gameclip-capture-'));
    obs = new FakeObs();
    remuxCalls = [];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function crear(ajustes: Partial<CaptureSettings> = {}): CaptureManager {
    const store = new SettingsStore(join(dir, 'settings.json'));
    store.save({ ...ajustes, outputDir: join(dir, 'salida') });
    return new CaptureManager(
      store,
      {
        obsDataPath: join(dir, 'obs'),
        defaultOutputDir: join(dir, 'salida'),
        appVersion: '0.0.0-test',
        primaryDisplay: { width: 1920, height: 1080, x: 0, y: 0 },
      },
      obs,
      'ffmpeg-test',
      (_ffmpeg, file, tracks) => {
        remuxCalls.push({ file, tracks });
        return Promise.resolve(true);
      },
      noopHapticListener(),
      noopControllerListener(),
    );
  }

  it('nombra las pistas del clip (remux) cuando el pipeline es layout por rol', async () => {
    obs.tracks = [
      { index: 1, name: 'default' },
      { index: 2, name: 'game' },
      { index: 3, name: 'mic' },
    ];
    const manager = crear({ bufferMode: 'always' });
    await manager.initialize();
    await manager.startRecording();
    await manager.stopRecording();
    expect(remuxCalls).toEqual([{ file: 'C:\\v\\clip.mp4', tracks: obs.tracks }]);
  });

  it('no remuxa nombres si el pipeline no es layout por rol (namedTracks null)', async () => {
    const manager = crear({ bufferMode: 'always' });
    await manager.initialize();
    await manager.startRecording();
    await manager.stopRecording();
    expect(remuxCalls).toEqual([]);
  });

  describe('perfil de captura (escritorio ↔ juego)', () => {
    it('lanzar un juego cambia el perfil y reconstruye el pipeline apuntando al juego', async () => {
      const manager = crear({ bufferMode: 'always' }); // escritorio + auto-switch (defaults)
      await manager.initialize();
      const buildsEnEscritorio = obs.buildCount;
      expect(obs.ultimoGameExe).toBeNull(); // se construyó para escritorio

      await manager.setGameDetected('Counter-Strike 2', 'cs2.exe');
      expect(obs.buildCount).toBe(buildsEnEscritorio + 1);
      expect(obs.ultimoGameExe).toBe('cs2.exe');

      // Al cerrarse el juego se vuelve al escritorio: otro rebuild, ya sin ejecutable.
      await manager.setGameDetected(null);
      expect(obs.buildCount).toBe(buildsEnEscritorio + 2);
      expect(obs.ultimoGameExe).toBeNull();
    });

    it('sin auto-switch, lanzar un juego NO cambia el perfil (se sigue grabando el escritorio)', async () => {
      const manager = crear({ bufferMode: 'always', desktopAutoSwitchToGame: false });
      await manager.initialize();
      const builds = obs.buildCount;

      await manager.setGameDetected('Counter-Strike 2', 'cs2.exe');
      expect(obs.buildCount).toBe(builds); // mismo perfil 'desktop': nada que reconstruir
      expect(obs.ultimoGameExe).toBeNull();
    });

    it('sin grabación de escritorio y sin juego: no se bufferiza ni se puede grabar', async () => {
      const manager = crear({ bufferMode: 'always', desktopRecordingEnabled: false });
      await manager.initialize();
      expect(manager.getStatus().state).toBe('idle');
      expect(obs.bufferActivo).toBe(false);

      const trasGrabar = await manager.startRecording();
      expect(trasGrabar.state).toBe('idle');
      expect(trasGrabar.error).toContain('no hay nada que capturar');
      expect(obs.llamadas).not.toContain('startRecording');

      const trasReplay = await manager.saveReplay();
      expect(trasReplay.error).toContain('no hay nada que capturar');
      expect(obs.llamadas).not.toContain('saveReplay');
    });

    it('sin grabación de escritorio, el juego despierta la captura y su cierre la duerme', async () => {
      const manager = crear({ bufferMode: 'always', desktopRecordingEnabled: false });
      await manager.initialize();

      await manager.setGameDetected('Counter-Strike 2', 'cs2.exe');
      expect(manager.getStatus().state).toBe('buffering');
      expect(obs.ultimoGameExe).toBe('cs2.exe');

      await manager.setGameDetected(null);
      expect(manager.getStatus().state).toBe('idle');
      expect(obs.bufferActivo).toBe(false);
    });

    it('un juego lanzado durante una grabación no la corta: el rebuild espera al final', async () => {
      const manager = crear({ bufferMode: 'always' });
      await manager.initialize();
      await manager.startRecording();
      const builds = obs.buildCount;

      await manager.setGameDetected('Counter-Strike 2', 'cs2.exe');
      expect(manager.getStatus().state).toBe('recording'); // el clip sigue vivo
      expect(obs.buildCount).toBe(builds); // rebuild aplazado

      await manager.stopRecording();
      expect(obs.buildCount).toBe(builds + 1); // ahora sí, ya en perfil de juego
      expect(obs.ultimoGameExe).toBe('cs2.exe');
    });

    it('regresión: un juego detectado a la vez que se pulsa grabar no mata la grabación', async () => {
      // El rebuild por cambio de perfil corría en paralelo al arranque de la grabación y destruía
      // la salida a medio arrancar: libobs nunca emitía 'start' ("timeout esperando señal").
      const manager = crear({ bufferMode: 'always' });
      await manager.initialize();

      const builds = obs.buildCount;

      // Sin await entre medias: ambas entradas compiten por el pipeline.
      const grabando = manager.startRecording();
      const juego = manager.setGameDetected('Counter-Strike 2', 'cs2.exe');
      await Promise.all([grabando, juego]);

      // La cola serializa: la grabación queda arrancada y el rebuild se aplaza (no la tumba).
      expect(manager.getStatus()).toMatchObject({ state: 'recording', error: null });
      expect(obs.buildCount).toBe(builds);
      expect(obs.grabando).toBe(true);

      // Y al parar, el pipeline se reconstruye ya en perfil de juego.
      await manager.stopRecording();
      expect(obs.buildCount).toBe(builds + 1);
      expect(obs.ultimoGameExe).toBe('cs2.exe');
    });

    it('desactivar la grabación de escritorio en caliente detiene el buffer', async () => {
      const manager = crear({ bufferMode: 'always' });
      await manager.initialize();
      expect(obs.bufferActivo).toBe(true);

      await manager.setSettings({ desktopRecordingEnabled: false });
      expect(manager.getStatus().state).toBe('idle');
      expect(obs.bufferActivo).toBe(false);
    });
  });

  it("modo 'always': el buffer arranca en la init (comportamiento previo)", async () => {
    const manager = crear({ bufferMode: 'always' });
    await manager.initialize();
    expect(manager.getStatus().state).toBe('buffering');
    expect(obs.bufferActivo).toBe(true);
  });

  it("modo 'game': sin juego queda idle; el juego arranca y detiene el buffer", async () => {
    const manager = crear({ bufferMode: 'game' });
    await manager.initialize();
    expect(manager.getStatus().state).toBe('idle');
    expect(obs.bufferActivo).toBe(false);

    await manager.setGameDetected('Valorant');
    expect(manager.getStatus()).toMatchObject({ state: 'buffering', detectedGame: 'Valorant' });
    expect(obs.bufferActivo).toBe(true);

    await manager.setGameDetected(null);
    expect(manager.getStatus()).toMatchObject({ state: 'idle', detectedGame: null });
    expect(obs.bufferActivo).toBe(false);
  });

  it("modo 'game': si el juego ya corre al inicializar, el buffer arranca en la init", async () => {
    const manager = crear({ bufferMode: 'game' });
    await manager.setGameDetected('Valorant'); // el detector puede ganarle a libobs
    await manager.initialize();
    expect(manager.getStatus().state).toBe('buffering');
    expect(obs.bufferActivo).toBe(true);
  });

  it('el cierre del juego nunca interrumpe una grabación manual; se reconcilia al parar', async () => {
    const manager = crear({ bufferMode: 'game' });
    await manager.initialize();
    await manager.setGameDetected('Valorant');
    await manager.startRecording();
    expect(manager.getStatus().state).toBe('recording');

    await manager.setGameDetected(null);
    expect(manager.getStatus().state).toBe('recording');
    expect(obs.grabando).toBe(true);
    expect(obs.bufferActivo).toBe(true); // el buffer sigue; se ajusta al terminar

    const status = await manager.stopRecording();
    expect(status.state).toBe('idle'); // sin juego: buffer detenido al reconciliar
    expect(obs.bufferActivo).toBe(false);
  });

  it('un juego abierto durante una grabación iniciada en idle deja el buffer corriendo al parar', async () => {
    const manager = crear({ bufferMode: 'game' });
    await manager.initialize();
    await manager.startRecording(); // grabación manual sin juego (desde idle)
    await manager.setGameDetected('Valorant');

    const status = await manager.stopRecording();
    expect(status.state).toBe('buffering');
    expect(obs.bufferActivo).toBe(true);
  });

  it("'clip-saved' incluye el juego detectado al momento de guardar", async () => {
    const manager = crear({ bufferMode: 'always' });
    await manager.initialize();
    await manager.setGameDetected('Valorant');
    const guardados: ClipSavedInfo[] = [];
    manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

    await manager.saveReplay();
    await manager.setGameDetected(null);
    await manager.startRecording();
    await manager.stopRecording();

    expect(guardados).toEqual([
      { filePath: 'C:\\v\\replay.mp4', source: 'replay', game: 'Valorant' },
      { filePath: 'C:\\v\\clip.mp4', source: 'recording', game: null },
    ]);
  });

  it('un rebuild que falla no envenena la cadena: el siguiente guardado se aplica igual', async () => {
    const manager = crear({ bufferMode: 'always' });
    await manager.initialize();

    const original = obs.buildPipeline.bind(obs);
    obs.buildPipeline = () => {
      throw new Error('fallo transitorio de libobs');
    };
    await manager.setSettings({ fps: 30 });
    expect(manager.getStatus().error).toContain('fallo transitorio');

    obs.buildPipeline = original;
    await manager.setSettings({ fps: 60 });
    expect(manager.getStatus()).toMatchObject({ state: 'buffering', error: null });
  });

  it("modo 'apps' con audio de juego: rotar de juego religa la fuente SIN reconstruir (el buffer sobrevive)", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
    await manager.initialize();

    // Entrar al primer juego cambia el perfil (escritorio → juego): eso SÍ reconstruye.
    await manager.setGameDetected('Counter-Strike 2', 'cs2.exe');
    expect(obs.ultimoGameExe).toBe('cs2.exe');
    const buildsEnJuego = obs.buildCount;

    // Rotar a otro juego se queda en el mismo perfil: religado en caliente, sin rebuild.
    await manager.setRunningGames([{ name: 'Valorant', executable: 'valorant.exe' }]);
    expect(obs.buildCount).toBe(buildsEnJuego); // el buffer conserva su contenido
    expect(obs.ultimoGameAudioTarget).toBe('valorant.exe');
    expect(manager.getStatus().state).toBe('buffering');
    expect(obs.bufferActivo).toBe(true);
  });

  it('sin ejecutable del detector cae al lookup inverso por nombre', async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
    await manager.initialize();

    // Entrar al perfil de juego reconstruye: el pipeline recibe el ejecutable del lookup.
    await manager.setGameDetected('Valorant');
    expect(obs.ultimoGameExe).toBe('valorant.exe');

    // Y un rebuild posterior (guardar ajustes) sigue recibiendo el ejecutable vigente.
    await manager.setSettings({ fps: 30 });
    expect(obs.ultimoGameExe).toBe('valorant.exe');

    // La rotación dentro del perfil de juego religa el audio con el exe del lookup.
    await manager.setRunningGames([{ name: 'Counter-Strike 2', executable: 'cs2.exe' }]);
    expect(obs.ultimoGameAudioTarget).toBe('cs2.exe');
  });

  it("modo 'desktop': rotar de juego no religa audio (no hay fuente por proceso)", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'desktop' });
    await manager.initialize();

    await manager.setGameDetected('Valorant');
    const buildsEnJuego = obs.buildCount;

    await manager.setRunningGames([{ name: 'Counter-Strike 2', executable: 'cs2.exe' }]);
    expect(obs.buildCount).toBe(buildsEnJuego);
    expect(obs.updateGameAudioCount).toBe(0);
  });

  it("modo 'apps' pero sin audio de juego: rotar de juego no religa audio", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: false });
    await manager.initialize();

    await manager.setGameDetected('Valorant');
    const buildsEnJuego = obs.buildCount;

    await manager.setRunningGames([{ name: 'Counter-Strike 2', executable: 'cs2.exe' }]);
    expect(obs.buildCount).toBe(buildsEnJuego);
    expect(obs.updateGameAudioCount).toBe(0);
  });

  it('push-to-talk: la tecla pulsada abre el mic y al soltarla se cierra', async () => {
    const manager = crear({ micEnabled: true, pttEnabled: true });
    await manager.initialize();

    manager.setMicHeld(true);
    expect(obs.micMuted).toBe(false);
    manager.setMicHeld(false);
    expect(obs.micMuted).toBe(true);
  });

  it('push-to-talk: con el mic desactivado la tecla no lo abre', async () => {
    const manager = crear({ micEnabled: false, pttEnabled: true });
    await manager.initialize();

    manager.setMicHeld(true);
    expect(obs.micMuted).toBe(true);
  });

  it('sin push-to-talk el mute solo depende de micEnabled', async () => {
    const manager = crear({ micEnabled: true, pttEnabled: false });
    await manager.initialize();

    manager.setMicHeld(false); // sin PTT la tecla no debe cerrar el mic
    expect(obs.micMuted).toBe(false);
  });

  it('el estado del PTT sobrevive a un rebuild (guardar ajustes con la tecla pulsada)', async () => {
    const manager = crear({ micEnabled: true, pttEnabled: true });
    await manager.initialize();
    manager.setMicHeld(true);

    await manager.setSettings({ fps: 30 }); // rebuild: buildPipeline resetea el mute
    expect(obs.micMuted).toBe(false); // re-aplicado: la tecla sigue pulsada
  });

  it('getAudioDevices devuelve [] mientras libobs no está inicializado', () => {
    const manager = crear();
    expect(manager.getAudioDevices()).toEqual([]);
  });

  it('modo auto: al cambiar de juego, el clip que termina se etiqueta con el juego ANTERIOR', async () => {
    const manager = crear({ recordingMode: 'auto', bufferMode: 'always' });
    await manager.initialize();
    const guardados: ClipSavedInfo[] = [];
    manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

    await manager.setRunningGames([{ name: 'Terraria', executable: 'terraria.exe' }]);
    expect(manager.getStatus().state).toBe('recording');

    await manager.setRunningGames([
      { name: 'Terraria', executable: 'terraria.exe' },
      { name: 'Valorant', executable: 'valorant.exe' },
    ]);
    await manager.switchGame('Valorant');

    expect(guardados).toHaveLength(1);
    expect(guardados[0].game).toBe('Terraria'); // la sesión cortada era de Terraria
    expect(manager.getStatus()).toMatchObject({ state: 'recording', detectedGame: 'Valorant' });
  });

  it('modo auto: tras un corte manual, cambiar de juego reanuda la grabación de sesión', async () => {
    const manager = crear({ recordingMode: 'auto', bufferMode: 'always' });
    await manager.initialize();
    await manager.setRunningGames([
      { name: 'Terraria', executable: 'terraria.exe' },
      { name: 'Valorant', executable: 'valorant.exe' },
    ]);
    expect(manager.getStatus().state).toBe('recording');

    await manager.stopRecording(); // el usuario corta a mano; el juego sigue abierto
    expect(manager.getStatus().state).toBe('buffering');

    await manager.switchGame('Valorant');
    expect(manager.getStatus().state).toBe('recording'); // la sesión del nuevo juego arranca
  });

  it('con forceWindowCapture el cambio de juego re-apunta también el video', async () => {
    const manager = crear({ bufferMode: 'always', forceWindowCapture: true });
    await manager.initialize();
    await manager.setRunningGames([
      { name: 'Terraria', executable: 'terraria.exe' },
      { name: 'Valorant', executable: 'valorant.exe' },
    ]);

    await manager.switchGame('Valorant');
    expect(obs.ultimoGameCaptureTarget).toBe('valorant.exe');
  });

  it('gameExecutableForName (fallback) mapea el nombre a un ejecutable conocido, o null', () => {
    // Es un fallback lossy (varios exes por juego): el camino principal es el ejecutable
    // que emite el detector.
    expect(gameExecutableForName('Valorant')).toBe('valorant.exe');
    expect(gameExecutableForName('Juego Inexistente')).toBeNull();
    expect(gameExecutableForName(null)).toBeNull();
  });

  const cs2 = { name: 'Counter-Strike 2', executable: 'cs2.exe' };
  const rl = { name: 'Rocket League', executable: 'rocketleague.exe' };

  describe("modo 'off'", () => {
    it('no arranca el buffer en la init aunque bufferMode sea always', async () => {
      const manager = crear({ recordingMode: 'off', bufferMode: 'always' });
      await manager.initialize();
      expect(manager.getStatus().state).toBe('idle');
      expect(obs.bufferActivo).toBe(false);
    });

    it('tampoco bufferiza al aparecer un juego', async () => {
      const manager = crear({ recordingMode: 'off', bufferMode: 'game' });
      await manager.initialize();
      await manager.setRunningGames([cs2]);
      expect(manager.getStatus()).toMatchObject({ state: 'idle', detectedGame: 'Counter-Strike 2' });
      expect(obs.bufferActivo).toBe(false);
    });

    it('startRecording y saveReplay son no-op (devuelven el status sin tocar libobs)', async () => {
      const manager = crear({ recordingMode: 'off', bufferMode: 'always' });
      await manager.initialize();

      await manager.startRecording();
      expect(manager.getStatus().state).toBe('idle');
      expect(obs.grabando).toBe(false);

      await manager.saveReplay();
      expect(obs.llamadas).not.toContain('saveReplay');
      expect(obs.llamadas).not.toContain('startRecording');
    });
  });

  describe("modo 'auto'", () => {
    it('arranca la grabación cuando aparece un juego y la corta cuando la lista se vacía', async () => {
      const manager = crear({ recordingMode: 'auto', bufferMode: 'always' });
      await manager.initialize();
      const guardados: ClipSavedInfo[] = [];
      manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

      await manager.setRunningGames([cs2]);
      expect(manager.getStatus().state).toBe('recording');
      expect(obs.grabando).toBe(true);

      await manager.setRunningGames([]);
      expect(manager.getStatus()).toMatchObject({ state: 'buffering', detectedGame: null });
      expect(obs.grabando).toBe(false);
      // La sesión cerrada deja un clip de grabación etiquetado con el juego que la generó.
      expect(guardados).toEqual([
        { filePath: 'C:\\v\\clip.mp4', source: 'recording', game: 'Counter-Strike 2' },
      ]);
    });

    it('al cambiar de juego activo corta y arranca una grabación nueva (un clip por sesión)', async () => {
      const manager = crear({ recordingMode: 'auto', bufferMode: 'always' });
      await manager.initialize();
      const guardados: ClipSavedInfo[] = [];
      manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

      await manager.setRunningGames([cs2, rl]); // activo = Counter-Strike 2, grabando
      expect(manager.getStatus().detectedGame).toBe('Counter-Strike 2');
      expect(obs.grabando).toBe(true);

      await manager.switchGame(); // rota a Rocket League
      expect(manager.getStatus()).toMatchObject({ state: 'recording', detectedGame: 'Rocket League' });
      expect(obs.grabando).toBe(true);
      // El corte de la sesión anterior guardó un clip del juego ANTERIOR (no del nuevo).
      expect(guardados).toEqual([
        { filePath: 'C:\\v\\clip.mp4', source: 'recording', game: 'Counter-Strike 2' },
      ]);
    });

    it('modo game: al vaciarse la lista corta la grabación y detiene el buffer', async () => {
      const manager = crear({ recordingMode: 'auto', bufferMode: 'game' });
      await manager.initialize();
      expect(manager.getStatus().state).toBe('idle');

      await manager.setRunningGames([cs2]);
      expect(manager.getStatus().state).toBe('recording');
      expect(obs.bufferActivo).toBe(true); // el buffer acompaña a la sesión

      await manager.setRunningGames([]);
      expect(manager.getStatus().state).toBe('idle'); // sin juego, buffer detenido
      expect(obs.bufferActivo).toBe(false);
    });
  });

  describe('switchGame', () => {
    it('rota el juego activo y religa el audio (modo apps) sin reconstruir', async () => {
      const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
      await manager.initialize();

      // Entrar al perfil de juego reconstruye una vez; el pipeline nuevo ya apunta al juego.
      await manager.setRunningGames([cs2, rl]);
      expect(manager.getStatus().detectedGame).toBe('Counter-Strike 2');
      expect(obs.ultimoGameExe).toBe('cs2.exe');
      const buildsEnJuego = obs.buildCount;

      await manager.switchGame();
      expect(manager.getStatus().detectedGame).toBe('Rocket League');
      expect(obs.ultimoGameAudioTarget).toBe('rocketleague.exe');

      await manager.switchGame(); // vuelve al primero (orden estable)
      expect(manager.getStatus().detectedGame).toBe('Counter-Strike 2');
      expect(obs.ultimoGameAudioTarget).toBe('cs2.exe');

      // Las rotaciones se quedan en el perfil de juego: ningún rebuild, el buffer sobrevive.
      expect(obs.buildCount).toBe(buildsEnJuego);
    });

    it('con 0 o 1 juegos es no-op', async () => {
      const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
      await manager.initialize();

      const antes = await manager.switchGame(); // sin juegos
      expect(antes.detectedGame).toBeNull();

      await manager.setRunningGames([cs2]);
      const count = obs.updateGameAudioCount;
      await manager.switchGame(); // un solo juego
      expect(manager.getStatus().detectedGame).toBe('Counter-Strike 2');
      expect(obs.updateGameAudioCount).toBe(count); // no religó nada
    });

    it('el juego activo se conserva si sigue corriendo cuando la lista cambia', async () => {
      const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
      await manager.initialize();

      await manager.setRunningGames([cs2, rl]);
      await manager.switchGame(); // activo = Rocket League
      expect(manager.getStatus().detectedGame).toBe('Rocket League');

      // Aparece un tercero, pero el activo sigue corriendo: no debe cambiar.
      await manager.setRunningGames([cs2, rl, { name: 'Valorant', executable: 'valorant.exe' }]);
      expect(manager.getStatus().detectedGame).toBe('Rocket League');

      // El activo deja de correr: pasa al primero disponible.
      await manager.setRunningGames([cs2]);
      expect(manager.getStatus().detectedGame).toBe('Counter-Strike 2');
    });
  });

  describe('colocación del clip guardado (carpeta por juego)', () => {
    /** Simula el archivo que libobs acaba de escribir en la carpeta de salida. */
    function archivoDeLibobs(nombre = '2026-07-11 19-14-42.mp4'): string {
      const salida = join(dir, 'salida');
      mkdirSync(salida, { recursive: true });
      const file = join(salida, nombre);
      writeFileSync(file, 'video');
      return file;
    }

    it('con juego detectado, el clip termina en la carpeta del juego con su nombre', async () => {
      const manager = crear({ recordingMode: 'manual' });
      await manager.initialize();
      await manager.setRunningGames([{ name: 'Terraria', executable: 'Terraria.exe' }]);
      const crudo = archivoDeLibobs();
      obs.archivoGrabacion = crudo;
      const guardados: ClipSavedInfo[] = [];
      manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

      await manager.startRecording();
      await manager.stopRecording();

      const final = guardados[0].filePath;
      expect(final).toMatch(/\\Terraria\\Terraria \d{4}\.\d{2}\.\d{2} - \d{2}\.\d{2}\.\d{2}\.\d{2}\.mp4$/);
      expect(existsSync(final)).toBe(true);
      expect(existsSync(crudo)).toBe(false); // se movió, no se copió
      expect(manager.getStatus().lastClipPath).toBe(final); // el status apunta al definitivo
    });

    it('sin juego, el clip va a Desktop', async () => {
      const manager = crear({ recordingMode: 'manual' });
      await manager.initialize();
      obs.archivoGrabacion = archivoDeLibobs();
      const guardados: ClipSavedInfo[] = [];
      manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

      await manager.startRecording();
      await manager.stopRecording();

      expect(guardados[0].filePath).toMatch(/\\Desktop\\Desktop \d{4}\.\d{2}\.\d{2} - .+\.mp4$/);
    });

    it('el clip retroactivo también cae en la carpeta del juego activo', async () => {
      const manager = crear({ bufferMode: 'always' });
      await manager.initialize();
      await manager.setRunningGames([{ name: 'Terraria', executable: 'Terraria.exe' }]);
      obs.archivoReplay = archivoDeLibobs('Replay 2026-07-11.mp4');
      const guardados: ClipSavedInfo[] = [];
      manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

      await manager.saveReplay();

      expect(guardados[0].filePath).toContain(join('salida', 'Terraria', 'Terraria '));
      expect(guardados[0].source).toBe('replay');
    });

    it('al cambiar de juego, el clip de la sesión que cierra va a la carpeta del juego VIEJO', async () => {
      const manager = crear({ recordingMode: 'auto', bufferMode: 'always' });
      await manager.initialize();
      await manager.setRunningGames([{ name: 'Terraria', executable: 'Terraria.exe' }]);
      obs.archivoGrabacion = archivoDeLibobs();
      const guardados: ClipSavedInfo[] = [];
      manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

      // Aparece otro juego y el auto-switcher lo activa: la sesión de Terraria se cierra.
      await manager.setRunningGames([
        { name: 'Counter-Strike 2', executable: 'cs2.exe' },
      ]);

      expect(guardados[0].filePath).toContain(join('salida', 'Terraria', 'Terraria '));
      expect(guardados[0].game).toBe('Terraria');
    });

    it('si el archivo no se puede mover, el clip conserva su ruta original', async () => {
      const manager = crear({ recordingMode: 'manual' });
      await manager.initialize();
      obs.archivoGrabacion = 'C:\\v\\no-existe.mp4'; // libobs devolvió algo que no está
      const guardados: ClipSavedInfo[] = [];
      manager.on('clip-saved', (info: ClipSavedInfo) => guardados.push(info));

      await manager.startRecording();
      await manager.stopRecording();

      expect(guardados[0].filePath).toBe('C:\\v\\no-existe.mp4');
    });
  });
});
