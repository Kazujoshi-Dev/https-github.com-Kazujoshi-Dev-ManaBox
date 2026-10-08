import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource-variable/geist';
import './index.css';
import { reloadAfterChunkError } from './utils/lazyWithReload';
import { installApiLanguageHeader, prepareLanguage } from './i18n';

installApiLanguageHeader();

// Po wdrożeniu nowej wersji stare pliki JS znikają z serwera; zamiast błędu przeładowujemy stronę.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadAfterChunkError()) event.preventDefault();
});

// Wersja angielska: najpierw słownik, potem pierwszy render (bez mignięcia polskiego tekstu)
prepareLanguage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
