/* =========================================================================
 *  API endpoint configuration
 *  -------------------------------------------------------------------------
 *  BACKEND_URL points at the deployed backend (the `chicken` repo on Render).
 *  Local development (localhost) automatically targets http://localhost:4000.
 * ========================================================================= */
const BACKEND_URL = 'https://chicken-xox5.onrender.com'; // ← deployed backend (Render)

window.API_BASE = (function () {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4000';
  return BACKEND_URL.replace(/\/$/, '');
})();
