// The house mark and the name, used in the running head and the docs nav. The
// geometry is the icon's, from packages/design/src/icon.ts.
export function Wordmark() {
  return (
    <span className="wordmark">
      <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 15 16 6l10 9M8 13.2V26h16V13.2M8 20h16" />
        <circle className="mark-dot" cx="16" cy="14.5" r="2.4" />
      </svg>
      Parlour
    </span>
  );
}
