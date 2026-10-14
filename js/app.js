// Entry point: loads data and progress, renders the current tab, registers the service worker.
import { h, mount, toast, closeTopSheet } from './ui.js';
import { load, save, flush, onChange, applyFreezes, requestPersist, S } from './store.js';
import { loadData } from './data.js';
import { headerBar, learnView, practiceView, wordsView, profileView, settingsView, applyTheme, setRerender } from './views.js';
import { unlockAudio } from './audio.js';
import { sessionActive } from './session.js';
import { autoSync } from './sync.js';

const TABS = [
  ['learn', '🗺️', 'Learn', learnView],
  ['practice', '🎮', 'Practice', practiceView],
  ['words', '📖', 'Words', wordsView],
  ['me', '🦊', 'Profile', profileView],
];
const VIEWS = { ...Object.fromEntries(TABS.map(([id, , , fn]) => [id, fn])), settings: settingsView };

const route = () => {
  const r = location.hash.replace('#', '');
  return VIEWS[r] ? r : 'learn';
};

function renderHeader() {
  mount(document.getElementById('hdr'), headerBar());
}

function renderTabs() {
  const cur = route();
  mount(
    document.getElementById('tabs'),
    TABS.map(([id, icon, label]) =>
      h(
        'a.tab' + (cur === id ? '.sel' : ''),
        { href: '#' + id, 'aria-current': cur === id ? 'page' : null },
        h('span.tab-icon', id === 'me' ? S.avatar : icon),
        h('span.tab-label', label),
      ),
    ),
  );
}

let lastRoute = null;
function render() {
  const r = route();
  const main = document.getElementById('main');
  const y = r === lastRoute ? main.scrollTop : 0;
  mount(main, VIEWS[r]());
  if (r === lastRoute) main.scrollTop = y;
  else main.scrollTop = 0;
  lastRoute = r;
  renderHeader();
  renderTabs();
}

function backupReminder() {
  // Gentle nudge once a week if the learner has real progress and no backup/sync.
  const last = Math.max(S.lastBackup, S.lastSync);
  const words = Object.keys(S.words).length;
  if (words < 30 || Date.now() - last < 7 * 86400000) return;
  if (sessionStorage.getItem('sq-reminded')) return;
  sessionStorage.setItem('sq-reminded', '1');
  toast('💾 Tip: back up your progress in Settings so it can never get lost.', 5000);
}

async function boot() {
  load();
  applyTheme();
  const saved = applyFreezes();
  if (saved) save(true);
  setRerender(render);
  try {
    await loadData();
  } catch (e) {
    mount(document.getElementById('main'), h('div.pad', h('h2', 'Could not load the word list'), h('p', 'Check your connection and reload the page.')));
    return;
  }
  window.addEventListener('hashchange', () => {
    closeTopSheet();
    render();
  });
  // Header reflects XP/coins live.
  onChange(() => !sessionActive() && renderHeader());
  render();
  document.getElementById('splash')?.remove();
  if (saved) toast(`🧊 A streak freeze saved your streak (${saved} day${saved > 1 ? 's' : ''})`, 4000);
  setTimeout(backupReminder, 4000);
  autoSync();

  const firstGesture = () => {
    unlockAudio();
    requestPersist();
    window.removeEventListener('pointerdown', firstGesture);
  };
  window.addEventListener('pointerdown', firstGesture);

  // Save immediately when the app is hidden or closed.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);

  // Re-render when the day changes while the app stays open.
  let day = new Date().getDate();
  setInterval(() => {
    if (new Date().getDate() !== day) {
      day = new Date().getDate();
      if (!sessionActive()) render();
    }
  }, 60000);

  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      // Phones often resume the app from the background instead of reloading it, so check for a new
      // app version and refresh the cached word list whenever it comes back to the foreground.
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 10 * 60000) return;
        lastCheck = Date.now();
        reg.update().catch(() => {});
        fetch('data/vocab.json').catch(() => {});
      });
      const offer = (w) => {
        if (!w) return;
        const btn = h('button.btn.small', { type: 'button', onclick: () => w.postMessage('skipWaiting') }, 'Update');
        toast(h('span', '✨ A new version is ready. ', btn), 10000);
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => nw.state === 'installed' && navigator.serviceWorker.controller && offer(nw));
      });
    })
    .catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || sessionActive()) return;
    reloaded = true;
    location.reload();
  });
}

boot();
