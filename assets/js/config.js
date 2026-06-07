/* =========================================================================
 *  API endpoint configuration
 *  -------------------------------------------------------------------------
 *  After you deploy the backend (`chicken` repo) to Vercel, copy its URL
 *  (e.g. https://chicken-xxxx.vercel.app) and paste it below as BACKEND_URL.
 *  Local development (localhost) automatically targets http://localhost:4000.
 * ========================================================================= */
const BACKEND_URL = 'https://chicken-backend.vercel.app'; // ← CHANGE THIS to your deployed backend URL

window.API_BASE = (function () {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4000';
  return BACKEND_URL.replace(/\/$/, '');
})();
