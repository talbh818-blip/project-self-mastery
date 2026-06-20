import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { dbgIncBoot, dbgLog } from './lib/debug';

// When a new service worker takes control (after a deploy), reload the page
// once so the user immediately gets the new bundle. Without this, the user
// could keep seeing the old cached JS until they manually unregister the SW.
// `controllerchange` only fires when the active SW changes — i.e. exactly
// when there's actually something new to pick up.
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

dbgIncBoot();
dbgLog('APP BOOT — full page load');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
