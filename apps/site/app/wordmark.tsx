// The house mark and the name, used in the running head and the docs nav.
export function Wordmark() {
  return (
    <span className="wordmark">
      <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 15 16 6l10 9M8 14v12h16V14M8 20h16" />
        <circle className="mark-dot" cx="13" cy="24" r="2.2" />
      </svg>
      Parlour
    </span>
  );
}
