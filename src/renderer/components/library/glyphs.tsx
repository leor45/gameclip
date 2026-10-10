// Glifos de la Biblioteca (SVG con currentColor: toman el color del botón).

export function FolderGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.5 3h4.3l1.4 1.5h7.3v8.5h-13V3zm1.5 3v5.5h10V6H3z"
      />
    </svg>
  );
}

export function TrashGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 1h4l.5 1H14v2H2V2h3.5L6 1zm-2.5 4h9L12 15H4L3.5 5zm3 2v6h1V7h-1zm2.5 0v6h1V7h-1z"
      />
    </svg>
  );
}

export function SearchGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
