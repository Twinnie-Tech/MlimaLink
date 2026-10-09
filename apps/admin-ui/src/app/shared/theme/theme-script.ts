export const THEME_STORAGE_KEY = 'mlimalink-theme';

/**
 * Runs in <head> before the first paint, so a saved (or system) dark
 * preference never flashes the light theme.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
