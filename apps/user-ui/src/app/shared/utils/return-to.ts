const RETURN_TO_KEY = 'mlimalink:return-to';

/** Remembers a page on this site to come back to after logging in. */
export function rememberReturnTo(path: string) {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    // Storage can be blocked; login then lands on the home page.
  }
}

/** The remembered page, once, or undefined. Only same-site paths are returned. */
export function takeReturnTo(): string | undefined {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return path?.startsWith('/') && !path.startsWith('//') ? path : undefined;
  } catch {
    return undefined;
  }
}
