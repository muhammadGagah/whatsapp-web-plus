import { getLanguage, t } from './settings-state.js';
import { getStickerConfig, decryptStickerCredential, normalizeStickerEndpoint, STICKER_CHANGED, STICKER_STORAGE } from './sticker-store.js';
import { requestStickerTransport } from './sticker-transport.js';
import { announce } from './chat-accessibility.js';

let activeAgreement = null;
export function makeStickerAgreementRequest(config, key) {
  if (config.provider !== 'cloudflare' || config.providers.cloudflare.model !== '@cf/meta/llama-3.2-11b-vision-instruct') throw new Error('stickerInvalidConfig');
  return { version: 1, id: crypto.randomUUID(), provider: 'cloudflare', purpose: 'model-agreement',
    endpoint: normalizeStickerEndpoint('cloudflare', config.providers.cloudflare.accountId),
    key, body: { prompt: 'agree' }, expiresAt: Date.now() + 45000 };
}

export function openStickerAgreement(config, restoreTarget = document.activeElement, {preview = false, parentDialog = null} = {}) {
  const openDialog = document.querySelector('dialog[open]');
  if (activeAgreement?.open || (openDialog && !(preview && openDialog === parentDialog))) return false;
  if (config.provider !== 'cloudflare') return false;
  if (!preview && config.providers.cloudflare.model !== '@cf/meta/llama-3.2-11b-vision-instruct') return false;
  const fingerprint = JSON.stringify(config);
  const language = getLanguage();
  const dialog = document.createElement('dialog');
  dialog.id = 'wa-plus-sticker-agreement';
  dialog.className = 'wa-plus-custom-text-dialog';
  dialog.lang = language;
  dialog.style.maxHeight = 'calc(100vh - 2rem)';
  dialog.style.overflow = 'auto';
  dialog.setAttribute('aria-labelledby', 'wa-plus-sticker-agreement-title');
  const title = document.createElement('h2');
  title.id = 'wa-plus-sticker-agreement-title';
  title.textContent = t(preview ? 'stickerAgreementPreviewTitle' : 'stickerAgreementTitle');
  if (preview) title.tabIndex = -1;
  const explanation = document.createElement('p');
  explanation.id = 'wa-plus-sticker-agreement-explanation';
  explanation.textContent = t(preview ? 'stickerAgreementPreviewHelp' : 'stickerAgreementExplanation');
  if (preview) dialog.setAttribute('aria-describedby', explanation.id);
  const account = document.createElement('p');
  account.style.overflowWrap = 'anywhere';
  account.textContent = `${t('stickerAccountId')}: ${config.providers.cloudflare.accountId}`;
  account.hidden = preview;
  const links = document.createElement('p');
  for (const [key, file] of [['stickerAgreementLicense', 'LICENSE'], ['stickerAgreementPolicy', 'USE_POLICY.md']]) {
    const link = document.createElement('a');
    link.textContent = t(key);
    link.href = `https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/${file}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.append(link, document.createElement('br'));
  }
  const requirement = document.createElement('p');
  requirement.id = 'wa-plus-sticker-agreement-required';
  requirement.textContent = t('stickerAgreementRequired');
  const consentLabel = document.createElement('label');
  const consent = document.createElement('input');
  consent.type = 'checkbox';
  consent.required = true;
  consent.style.width = 'auto';
  consent.setAttribute('aria-describedby', requirement.id);
  consent.id = 'wa-plus-sticker-agreement-consent';
  consentLabel.htmlFor = consent.id;
  consentLabel.append(consent, document.createTextNode(t('stickerAgreementConsent')));
  const regionLabel = document.createElement('label');
  regionLabel.style.display = 'block';
  const region = document.createElement('input');
  region.type = 'checkbox';
  region.required = true;
  region.style.width = 'auto';
  region.setAttribute('aria-describedby', requirement.id);
  region.id = 'wa-plus-sticker-agreement-region';
  regionLabel.htmlFor = region.id;
  regionLabel.append(region, document.createTextNode(t('stickerAgreementRegion')));
  const feedback = document.createElement('p');
  feedback.tabIndex = -1;
  feedback.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'wa-plus-custom-text-dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.textContent = t(preview ? 'stickerAgreementClose' : 'cancel');
  const accept = document.createElement('button');
  accept.type = 'button'; accept.textContent = t('stickerAgreementAccept');
  accept.disabled = true;
  actions.append(cancel, accept);
  dialog.append(title, explanation, account, links, requirement, consentLabel, regionLabel, feedback, actions);
  document.body.append(dialog);
  activeAgreement = dialog;
  let busy = false, completed = false, controller = null, timer = null;
  const valid = () => dialog.open && getLanguage() === language && (preview || JSON.stringify(getStickerConfig()) === fingerprint);
  const update = () => { accept.disabled = busy || completed || !consent.checked || !region.checked; };
  consent.addEventListener('change', update);
  region.addEventListener('change', update);
  const showFeedback = key => {
    feedback.textContent = t(key); feedback.hidden = false;
    if (document.activeElement === feedback) cancel.focus();
    feedback.focus();
  };
  const invalidate = () => { controller?.abort(); if (dialog.open) dialog.close(); };
  const storage = event => { if (!event.key || [STICKER_STORAGE, 'wa-plus-language'].includes(event.key)) invalidate(); };
  window.addEventListener(STICKER_CHANGED, invalidate);
  window.addEventListener('wa-plus-language-changed', invalidate);
  window.addEventListener('storage', storage);
  window.addEventListener('pagehide', invalidate);
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    controller?.abort(); clearTimeout(timer);
    window.removeEventListener(STICKER_CHANGED, invalidate);
    window.removeEventListener('wa-plus-language-changed', invalidate);
    window.removeEventListener('storage', storage);
    window.removeEventListener('pagehide', invalidate);
    activeAgreement = null; dialog.remove();
    const candidates = [restoreTarget,
      ...document.querySelectorAll('#main [tabindex="0"]'),
      ...document.querySelectorAll('#pane-side [tabindex="0"]')];
    for (const target of candidates) {
      if (!target?.isConnected || target.disabled || !target.getClientRects?.().length ||
          target.closest?.('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]')) continue;
      target.focus({preventScroll:true});
      if (document.activeElement === target) break;
    }
    if (!preview && completed && getLanguage() === language && JSON.stringify(getStickerConfig()) === fingerprint) {
      announce(t('stickerAgreementSuccess'));
    }
  });
  accept.addEventListener('click', async event => {
    if (!event.isTrusted || busy || completed || !consent.checked || !region.checked || !valid()) return;
    if (preview) {
      completed = true;
      consent.disabled = region.disabled = true;
      update();
      showFeedback('stickerAgreementPreviewDone');
      return;
    }
    busy = true; update(); consent.disabled = region.disabled = true;
    cancel.textContent = t('stickerAgreementClose');
    showFeedback('stickerAgreementSending');
    const attempt = new AbortController();
    controller = attempt;
    timer = setTimeout(() => attempt.abort(), 45000);
    let key = '', request, rejectAborted;
    const aborted = new Promise((resolve, reject) => {
      rejectAborted = () => reject(new Error('stickerAgreementTimeout'));
      attempt.signal.addEventListener('abort', rejectAborted, {once:true});
    });
    try {
      const response = await Promise.race([aborted, (async () => {
        key = await decryptStickerCredential('cloudflare', config.providers.cloudflare);
        try {
          attempt.signal.throwIfAborted();
          if (!valid()) return;
          request = makeStickerAgreementRequest(config, key);
        } finally { key = ''; }
        return requestStickerTransport(request, attempt.signal);
      })()]);
      if (!valid()) { invalidate(); return; }
      if (response?.status === 403 && response?.body?.errors?.some?.(error => error?.code === 5016)) throw new Error('stickerAgreementFailed');
      if (response?.status === 401 || response?.status === 403) throw new Error('stickerAuthError');
      if (response?.status === 429) throw new Error('stickerQuotaError');
      if (!(response?.status >= 200 && response.status < 300) || response?.body?.success !== true) throw new Error('stickerAgreementFailed');
      completed = true;
      dialog.close();
    } catch (error) {
      if (!valid()) { invalidate(); return; }
      const allowed = ['stickerAuthError', 'stickerQuotaError', 'stickerKeyUnreadable', 'stickerTransportMissing', 'stickerAgreementFailed'];
      showFeedback(attempt.signal.aborted ? 'stickerAgreementTimeout' : allowed.includes(error.message) ? error.message : 'stickerAgreementFailed');
    } finally {
      attempt.signal.removeEventListener('abort', rejectAborted);
      clearTimeout(timer); key = ''; if (request) request.key = '';
      busy = false; consent.disabled = region.disabled = completed;
      if (!completed) cancel.textContent = t('cancel');
      update();
    }
  });
  dialog.showModal(); (preview ? title : cancel).focus();
  return true;
}
