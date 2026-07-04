/**
 * Browser cookie utilities for NitroChat.
 */

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  const isSecure = typeof location !== 'undefined' && location.protocol === 'https:';
  // Use Lax SameSite to allow it to be sent on top-level redirect navigation back to the app
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${isSecure ? '; Secure' : ''}`;
}

export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  const isSecure = typeof location !== 'undefined' && location.protocol === 'https:';
  document.cookie = `${name}=; path=/; max-age=-1; SameSite=Lax${isSecure ? '; Secure' : ''}`;
}
