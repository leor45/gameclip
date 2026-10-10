import GameIcon from '../GameIcon';

/** Línea del juego de un clip: icono + nombre; sin juego, el monitor de Escritorio. */
export default function GameLine({ game, className }: { game: string | null; className?: string }) {
  const nombre = game ?? 'Escritorio';
  return (
    <span className={['clip-game', className].filter(Boolean).join(' ')} title={nombre}>
      <GameIcon game={game} />
      <span className="clip-game-name">{nombre}</span>
    </span>
  );
}
