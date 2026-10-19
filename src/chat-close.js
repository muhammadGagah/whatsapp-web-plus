import { SELECTORS } from './config.js';
import { announce, isChatMainActive } from './chat-accessibility.js';
import { t } from './settings-state.js';

function getOpenConversation() {
  const main = document.querySelector(SELECTORS.main);
  return isChatMainActive(main) ? main : null;
}

export function createChatCloseTracker(getConversation, notify, clock = globalThis) {
  let timer = null;
  let generation = 0;
  let focusGeneration = 0;
  let focusQuietFor = 0;
  const onFocus = () => {
    focusGeneration++;
    focusQuietFor = 0;
  };
  const cancel = () => {
    generation++;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  const onKeydown = event => {
    if (event.repeat && event.key === 'Escape') return;
    cancel();
    if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.shiftKey ||
        event.metaKey || event.isComposing) return;
    const origin = getConversation();
    if (!origin) return;
    const request = generation;
    let elapsed = 0;
    let absentFor = 0;
    focusQuietFor = 0;
    const check = () => {
      timer = null;
      if (generation !== request) return;
      const current = getConversation();
      if (current && current !== origin) return;
      elapsed += 100;
      focusQuietFor += 100;
      absentFor = current ? 0 : absentFor + 100;
      // Community closure restores focus several times; speak after it settles.
      if (absentFor >= 1300 && focusQuietFor >= 900) {
        const settledFocus = focusGeneration;
        notify(() => generation === request && focusGeneration === settledFocus && !getConversation());
        return;
      }
      if (elapsed < 4000) timer = clock.setTimeout(check, 100);
    };
    timer = clock.setTimeout(check, 100);
  };
  return { onKeydown, onFocus, cancel };
}

let closeTracker = null;
export function startChatCloseAnnouncements() {
  if (closeTracker) return;
  closeTracker = createChatCloseTracker(getOpenConversation,
    guard => announce(t('chatNowClosed'), guard));
  window.addEventListener('keydown', closeTracker.onKeydown, true);
  document.addEventListener('focusin', closeTracker.onFocus, true);
  window.addEventListener('pointerdown', closeTracker.cancel, true);
  window.addEventListener('pagehide', closeTracker.cancel, true);
}
