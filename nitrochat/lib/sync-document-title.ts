/** Client-safe: update tab title after `/api/config` branding merge. */
export function syncDocumentTitle(name: string | undefined): void {
  if (typeof document === 'undefined') return;
  const title = name?.trim();
  if (title) document.title = title;
}
