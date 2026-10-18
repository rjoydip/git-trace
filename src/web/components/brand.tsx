/**
 * The GitTrace mark: two commits on the main rail and a third on a branch that
 * merges back into it. Drawn once here and mirrored by `public/favicon.svg`, so
 * the tab icon and the in-app logo cannot drift apart.
 */
export function GitTraceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 7.3v9.4" />
      <path d="M8.3 12h7.4" />
      <circle cx="6" cy="5" r="2.3" />
      <circle cx="6" cy="19" r="2.3" />
      <circle cx="18" cy="12" r="2.3" />
    </svg>
  );
}
