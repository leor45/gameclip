import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AudioDeviceInfo, CaptureSettings, EncoderInfo } from '@shared/capture';
import { CaptureManager, gameExecutableForName } from '../capture/manager';
import type { CaptureBackend, ClipSavedInfo } from '../capture/manager';
import { SettingsStore } from '../capture/settings-store';

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
    _screen: { width: number; height: number },
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
  saveReplay(): Promise<string> {
    this.llamadas.push('saveReplay');
    return Promise.resolve('C:\\v\\replay.mp4');
  }
  startRecording(): Promise<void> {
    this.llamadas.push('startRecording');
    this.grabando = true;
    return Promise.resolve();
  }
  stopRecording(): Promise<string> {
    this.llamadas.push('stopRecording');
    this.grabando = false;
    return Promise.resolve('C:\\v\\clip.mp4');
  }
  shutdown(): void {
    this.llamadas.push('shutdown');
  }
}

describe('CaptureManager (modos de buffer y detección de juegos)', () => {
  let dir: string;
  let obs: FakeObs;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gameclip-capture-'));
    obs = new FakeObs();
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
        primaryDisplay: { width: 1920, height: 1080 },
      },
      obs,
    );
  }

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

  it("modo 'apps' con audio de juego: el cambio de juego religa la fuente SIN reconstruir (el buffer sobrevive)", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
    await manager.initialize();
    const buildsTrasInit = obs.buildCount;

    // El detector emite el ejecutable real; se religa en caliente sin perder el buffer.
    await manager.setGameDetected('Counter-Strike 2', 'cs2.exe');
    expect(obs.buildCount).toBe(buildsTrasInit); // sin rebuild: el buffer conserva su contenido
    expect(obs.ultimoGameAudioTarget).toBe('cs2.exe');
    expect(manager.getStatus().state).toBe('buffering');
    expect(obs.bufferActivo).toBe(true);

    await manager.setGameDetected(null);
    expect(obs.ultimoGameAudioTarget).toBeNull();
  });

  it('sin ejecutable del detector cae al lookup inverso por nombre', async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
    await manager.initialize();

    await manager.setGameDetected('Valorant');
    expect(obs.ultimoGameAudioTarget).toBe('valorant.exe');

    // Un rebuild posterior (guardar ajustes) recibe el ejecutable vigente.
    await manager.setSettings({ fps: 30 });
    expect(obs.ultimoGameExe).toBe('valorant.exe');
  });

  it("modo 'desktop': cambiar el juego NO religa audio ni reconstruye", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'desktop' });
    await manager.initialize();
    const buildsTrasInit = obs.buildCount;

    await manager.setGameDetected('Valorant');
    expect(obs.buildCount).toBe(buildsTrasInit);
    expect(obs.updateGameAudioCount).toBe(0);
  });

  it("modo 'apps' pero sin audio de juego: cambiar el juego no toca el pipeline", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: false });
    await manager.initialize();
    const buildsTrasInit = obs.buildCount;

    await manager.setGameDetected('Valorant');
    expect(obs.buildCount).toBe(buildsTrasInit);
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
      // La sesión cerrada deja un clip de grabación.
      expect(guardados).toEqual([
        { filePath: 'C:\\v\\clip.mp4', source: 'recording', game: null },
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
      // El corte de la sesión anterior guardó un clip (juego = el activo al cortar).
      expect(guardados).toEqual([
        { filePath: 'C:\\v\\clip.mp4', source: 'recording', game: 'Rocket League' },
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
      const buildsTrasInit = obs.buildCount;

      await manager.setRunningGames([cs2, rl]);
      expect(manager.getStatus().detectedGame).toBe('Counter-Strike 2');
      expect(obs.ultimoGameAudioTarget).toBe('cs2.exe');

      await manager.switchGame();
      expect(manager.getStatus().detectedGame).toBe('Rocket League');
      expect(obs.ultimoGameAudioTarget).toBe('rocketleague.exe');

      await manager.switchGame(); // vuelve al primero (orden estable)
      expect(manager.getStatus().detectedGame).toBe('Counter-Strike 2');
      expect(obs.ultimoGameAudioTarget).toBe('cs2.exe');

      expect(obs.buildCount).toBe(buildsTrasInit); // ningún rebuild: el buffer sobrevive
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
});
