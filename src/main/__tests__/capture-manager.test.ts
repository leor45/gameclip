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

  it('buildPipeline recibe el ejecutable del juego detectado (lookup inverso)', async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
    await manager.initialize();
    expect(obs.ultimoGameExe).toBeNull(); // sin juego al inicializar

    await manager.setGameDetected('Valorant');
    expect(obs.ultimoGameExe).toBe('valorant.exe');
  });

  it("modo 'apps' con audio de juego: cambiar el juego reconstruye el pipeline (religa la fuente)", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: true });
    await manager.initialize();
    const buildsTrasInit = obs.buildCount;

    await manager.setGameDetected('Valorant');
    expect(obs.buildCount).toBe(buildsTrasInit + 1);
    expect(obs.ultimoGameExe).toBe('valorant.exe');
    // El rebuild deja el buffer corriendo (bufferMode 'always').
    expect(manager.getStatus().state).toBe('buffering');
    expect(obs.bufferActivo).toBe(true);
  });

  it("modo 'desktop': cambiar el juego NO reconstruye el pipeline", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'desktop' });
    await manager.initialize();
    const buildsTrasInit = obs.buildCount;

    await manager.setGameDetected('Valorant');
    expect(obs.buildCount).toBe(buildsTrasInit);
  });

  it("modo 'apps' pero sin audio de juego: cambiar el juego NO reconstruye el pipeline", async () => {
    const manager = crear({ bufferMode: 'always', audioMode: 'apps', gameAudioEnabled: false });
    await manager.initialize();
    const buildsTrasInit = obs.buildCount;

    await manager.setGameDetected('Valorant');
    expect(obs.buildCount).toBe(buildsTrasInit);
  });

  it('getAudioDevices devuelve [] mientras libobs no está inicializado', () => {
    const manager = crear();
    expect(manager.getAudioDevices()).toEqual([]);
  });

  it('gameExecutableForName mapea el nombre legible a un ejecutable conocido, o null', () => {
    expect(gameExecutableForName('Valorant')).toBe('valorant.exe');
    expect(gameExecutableForName('Counter-Strike 2')).toBe('csgo.exe');
    expect(gameExecutableForName('Juego Inexistente')).toBeNull();
    expect(gameExecutableForName(null)).toBeNull();
  });
});
