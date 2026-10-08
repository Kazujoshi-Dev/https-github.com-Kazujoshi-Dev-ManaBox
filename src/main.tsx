import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource-variable/geist';
import './index.css';
import { reloadAfterChunkError } from './utils/lazyWithReload';

// Po wdrożeniu nowej wersji stare pliki JS znikają z serwera; zamiast błędu przeładowujemy stronę.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadAfterChunkError()) event.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
