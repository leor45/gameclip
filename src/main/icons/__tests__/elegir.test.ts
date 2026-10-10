import { describe, expect, it } from 'vitest';
import {
  buscarPorNombre,
  claveCompacta,
  elegirArchivoLogo,
  elegirEjecutable,
  esRutaStore,
  familiaDeAlias,
  logoDelManifiesto,
  validarEjecutable,
  validarNombreJuego,
} from '../elegir';

describe('validación de la entrada del IPC', () => {
  it('nombre de juego: string no vacío y razonable', () => {
    expect(validarNombreJuego('  ARC Raiders ')).toBe('ARC Raiders');
    expect(validarNombreJuego('')).toBeNull();
    expect(validarNombreJuego('   ')).toBeNull();
    expect(validarNombreJuego(42)).toBeNull();
    expect(validarNombreJuego(null)).toBeNull();
    expect(validarNombreJuego({ name: 'x' })).toBeNull();
    expect(validarNombreJuego('a'.repeat(261))).toBeNull();
    expect(validarNombreJuego('juego\u0000raro')).toBeNull();
  });

  it('ejecutable: solo el nombre, nunca una ruta', () => {
    expect(validarEjecutable('Discord.exe')).toBe('discord');
    expect(validarEjecutable('Spotify')).toBe('spotify');
    expect(validarEjecutable('C:\\Windows\\System32\\cmd.exe')).toBeNull();
    expect(validarEjecutable('..\\..\\x.exe')).toBeNull();
    expect(validarEjecutable('carpeta/x.exe')).toBeNull();
    expect(validarEjecutable('C:x.exe')).toBeNull();
    expect(validarEjecutable('*.exe')).toBeNull();
    expect(validarEjecutable('..')).toBeNull();
    expect(validarEjecutable('')).toBeNull();
    expect(validarEjecutable(undefined)).toBeNull();
    expect(validarEjecutable('x'.repeat(300))).toBeNull();
  });
});

describe('elegirEjecutable (el exe que representa al juego)', () => {
  const dir = 'G:\\SteamLibrary\\steamapps\\common\\Juego';

  it('prefiere el que coincide con el nombre del juego frente a launchers, EAC y crash', () => {
    const rutas = [
      `${dir}\\JuegoLauncher.exe`,
      `${dir}\\Juego_EAC.exe`,
      `${dir}\\CrashReportClient.exe`,
      `${dir}\\Tools\\Server.exe`,
      `${dir}\\Monster Hunter Wilds.exe`,
    ];
    expect(elegirEjecutable('Monster Hunter Wilds', rutas)).toBe(`${dir}\\Monster Hunter Wilds.exe`);
  });

  it('el exe visto en ejecución / del índice manda sobre el parecido del nombre', () => {
    const rutas = [
      `${dir}\\Fortnite.exe`,
      `${dir}\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe`,
    ];
    expect(
      elegirEjecutable('Fortnite', rutas, { preferidas: ['fortniteclient-win64-shipping'] }),
    ).toBe(rutas[1]);
  });

  it('sin parecido ni preferencias: el Shipping y luego el menos profundo', () => {
    const rutas = [`${dir}\\Bin\\Win64\\pioneergame-Win64-Shipping.exe`, `${dir}\\Bin\\otro.exe`];
    expect(elegirEjecutable('ARC Raiders', rutas)).toBe(rutas[0]);
    expect(elegirEjecutable('ARC Raiders', [`${dir}\\a\\b\\x.exe`, `${dir}\\y.exe`])).toBe(
      `${dir}\\y.exe`,
    );
  });

  it('un secundario se elige si es lo único que hay; sin rutas, null', () => {
    expect(elegirEjecutable('Juego', [`${dir}\\JuegoServer.exe`])).toBe(`${dir}\\JuegoServer.exe`);
    expect(elegirEjecutable('Juego', [])).toBeNull();
  });
});

describe('apps de Microsoft Store', () => {
  it('reconoce rutas de WindowsApps (reales y alias)', () => {
    expect(esRutaStore('C:\\Program Files\\WindowsApps\\Pkg_1.0_x64__abc\\App.exe')).toBe(true);
    expect(
      esRutaStore('C:\\Users\\Leo\\AppData\\Local\\Microsoft\\WindowsApps\\Spotify.exe'),
    ).toBe(true);
    expect(esRutaStore('D:\\Juegos\\Juego.exe')).toBe(false);
  });

  it('saca la familia del paquete de un alias de ejecución', () => {
    expect(
      familiaDeAlias(
        'C:\\Users\\Leo\\AppData\\Local\\Microsoft\\WindowsApps\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0\\Spotify.exe',
      ),
    ).toBe('SpotifyAB.SpotifyMusic_zpdnekdrzrea0');
    // El alias suelto de la raíz no dice el paquete.
    expect(
      familiaDeAlias('C:\\Users\\Leo\\AppData\\Local\\Microsoft\\WindowsApps\\Spotify.exe'),
    ).toBeNull();
    expect(familiaDeAlias('C:\\Program Files\\WindowsApps\\Pkg_1.0_x64__abc\\App.exe')).toBeNull();
  });

  it('lee el logo del manifiesto: Square44x44Logo, luego Square150x150Logo, luego <Logo>', () => {
    const completo = `<Package><Properties><Logo>Assets\\StoreLogo.png</Logo></Properties>
      <Applications><Application><uap:VisualElements DisplayName="X"
        Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png"/>
      </Application></Applications></Package>`;
    expect(logoDelManifiesto(completo)).toBe('Assets\\Square44x44Logo.png');
    expect(logoDelManifiesto('<a Square150x150Logo="Img\\Big.png"/>')).toBe('Img\\Big.png');
    expect(logoDelManifiesto('<Logo> Assets\\StoreLogo.png </Logo>')).toBe('Assets\\StoreLogo.png');
    expect(logoDelManifiesto('<Package/>')).toBeNull();
    // Nada fuera del paquete.
    expect(logoDelManifiesto('<a Square44x44Logo="..\\..\\x.png"/>')).toBeNull();
    expect(logoDelManifiesto('<a Square44x44Logo="C:\\x.png"/>')).toBeNull();
  });

  it('elige el PNG real: targetsize-64 sin placa antes que escalas y temas claros', () => {
    const archivos = [
      'Square44x44Logo.scale-100.png',
      'Square44x44Logo.scale-200.png',
      'Square44x44Logo.targetsize-16.png',
      'Square44x44Logo.targetsize-64.png',
      'Square44x44Logo.targetsize-64_altform-unplated.png',
      'Square44x44Logo.targetsize-64_altform-lightunplated.png',
      'Square44x44Logo.targetsize-256_altform-unplated.png',
      'Square150x150Logo.scale-200.png',
      'otra.png',
    ];
    expect(elegirArchivoLogo('Square44x44Logo.png', archivos)).toBe(
      'Square44x44Logo.targetsize-64_altform-unplated.png',
    );
    // Solo escalas: la que más se acerca a 64 por arriba (44 × 2 = 88).
    expect(
      elegirArchivoLogo('Square44x44Logo.png', [
        'Square44x44Logo.scale-100.png',
        'Square44x44Logo.scale-200.png',
        'Square44x44Logo.scale-400.png',
      ]),
    ).toBe('Square44x44Logo.scale-200.png');
    // El nombre sin calificar también vale; nada que cuadre → null.
    expect(elegirArchivoLogo('StoreLogo.png', ['StoreLogo.png'])).toBe('StoreLogo.png');
    expect(elegirArchivoLogo('StoreLogo.png', ['Otro.png'])).toBeNull();
  });
});

describe('buscarPorNombre', () => {
  const j = (...nombres: string[]) => nombres.map((name) => ({ name }));

  it('claveCompacta deja solo letras y números en minúsculas', () => {
    expect(claveCompacta('Avatar: Frontiers of Pandora')).toBe('avatarfrontiersofpandora');
    expect(claveCompacta('Avatar  Frontiers of Pandora')).toBe('avatarfrontiersofpandora');
    expect(claveCompacta('Stellar Blade™')).toBe('stellarblade');
  });

  it('igualdad exacta antes que compacta, y compacta antes que edición', () => {
    expect(buscarPorNombre('Hades', j('Hades II', 'Hades'))?.name).toBe('Hades');
    expect(buscarPorNombre('Avatar  Frontiers of Pandora', j('Avatar: Frontiers of Pandora'))?.name).toBe(
      'Avatar: Frontiers of Pandora',
    );
  });

  it('acepta un sufijo de edición conocido con un único candidato', () => {
    const r = buscarPorNombre('FINAL FANTASY VII REMAKE', j('FINAL FANTASY VII REMAKE INTERGRADE'));
    expect(r?.name).toBe('FINAL FANTASY VII REMAKE INTERGRADE');
    expect(buscarPorNombre('The Witcher 3: Wild Hunt', j('The Witcher 3: Wild Hunt - Game of the Year Edition'))?.name).toBe(
      'The Witcher 3: Wild Hunt - Game of the Year Edition',
    );
    expect(buscarPorNombre('Dark Souls', j('DARK SOULS™: REMASTERED'))?.name).toBe('DARK SOULS™: REMASTERED');
  });

  it('nunca secuelas ni sufijos desconocidos', () => {
    expect(buscarPorNombre('Hades', j('Hades II'))).toBeNull();
    expect(buscarPorNombre('Dark Souls', j('DARK SOULS III'))).toBeNull();
    expect(buscarPorNombre('Elden Ring', j('ELDEN RING NIGHTREIGN'))).toBeNull();
    expect(buscarPorNombre('Doom', j('Doom Eternal'))).toBeNull();
  });

  it('dos candidatos con edición: ambiguo → null', () => {
    expect(buscarPorNombre('Juego', j('Juego Remastered', 'Juego Definitive Edition'))).toBeNull();
  });

  it('nombre vacío o sin letras → null', () => {
    expect(buscarPorNombre('™', j('Algo'))).toBeNull();
  });
});
