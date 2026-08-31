import './styles.css';
import { loadBakedPacks } from './content/baked';
import { addPackCategory } from './game/library';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const app = new App(root);

// Baked packs are optional, so the game renders immediately from its shipped
// content and folds any it finds in afterwards rather than blocking on a fetch
// that will usually 404.
void loadBakedPacks().then((packs) => {
  if (packs.length === 0) return;
  for (const pack of packs) addPackCategory(pack);
  app.contentChanged();
});

// Register the service worker only for a real build; in dev the cached shell
// would happily serve a stale module graph. It lives in public/ so it ships as
// a plain file at the app's own scope rather than being bundled.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Offline support is a bonus; a refused registration must not break play.
    });
  });
}
