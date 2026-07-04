// Quick test to verify MongoDB connection and persistence config
// Run this in browser console after logging in


// Check config
fetch('/api/config')
    .then((r) => r.json())
    .catch((err) => console.error('config fetch failed:', err));

// Check if user is authenticated
const storage = localStorage.getItem('nitrochat-oauth-storage');

// Check MongoDB env vars (server-side only, won't work from browser)
