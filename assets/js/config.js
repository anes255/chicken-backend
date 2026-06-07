/* API base URL. When the frontend is served from the same host as the API
 * during local dev, set this to the backend port. In production set it to the
 * deployed backend URL (e.g. https://chicken-xxxx.onrender.com). */
window.API_BASE = (function () {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:4000';
  }
  // ↓↓↓ CHANGE THIS to your deployed backend URL after deploying the `chicken` repo.
  return 'https://chicken-backend.onrender.com';
})();
