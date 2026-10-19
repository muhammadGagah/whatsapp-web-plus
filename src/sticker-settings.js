import { announce } from './chat-accessibility.js';
import { openStickerAgreement } from './sticker-agreement.js';
import { getLanguage, t } from './settings-state.js';
import {
  getStickerConfig, hasStickerCredential, saveStickerConfig, deleteStickerCredential, normalizeStickerEndpoint
} from './sticker-store.js';

let activeDialog = null;
const SAVE_ERRORS = new Set([
  'stickerStorageError', 'stickerKeyUnreadable', 'stickerInvalidConfig',
  'stickerAccountRequired', 'stickerKeyRequired', 'stickerInvalidEndpoint', 'stickerModelRequired', 'stickerConfigureFirst'
]);

// The existing native-dialog lifecycle provides modality, Escape and focus containment.
// Feedback is focused text, never a second live region alongside announce().
export function openStickerSettings(restoreFocus) {
  if (activeDialog?.open) return;
  const config = getStickerConfig();
  const drafts = Object.fromEntries(Object.entries(config.providers).map(([name, value]) => [name, { ...value }]));
  let selected = config.provider;
  let busy = false;
  const dialog = document.createElement('dialog');
  dialog.id = 'wa-plus-sticker-dialog';
  dialog.className = 'wa-plus-custom-text-dialog wa-plus-sticker-dialog';
  dialog.lang = getLanguage();
  dialog.dir = 'ltr';
  dialog.setAttribute('aria-labelledby', 'wa-plus-sticker-title');
  const style = document.createElement('style');
  style.textContent = `
    .wa-plus-sticker-dialog { max-height: calc(100vh - 2rem); overflow: auto; }
    .wa-plus-sticker-dialog select { width: 100%; padding: .5rem; min-height: 2.75rem;
      box-sizing: border-box; background: Field; color: FieldText; font: inherit; border: 1px solid ButtonBorder; }
    .wa-plus-sticker-dialog select:focus, .wa-plus-sticker-feedback:focus { outline: 2px solid Highlight; outline-offset: 2px; }
    .wa-plus-sticker-field { margin-block: 1.5rem; }
    .wa-plus-sticker-dialog [hidden] { display: none !important; }
    .wa-plus-sticker-dialog p { overflow-wrap: anywhere; }
  `;
  const form = document.createElement('form');
  form.noValidate = true;
  const title = document.createElement('h2');
  title.id = 'wa-plus-sticker-title';
  title.textContent = t('stickerSettingsTitle');
  function paragraph(key, id) {
    const element = document.createElement('p');
    element.textContent = t(key);
    if (id) element.id = id;
    return element;
  }
  function field(name, key, type = 'text') {
    const group = document.createElement('div');
    group.className = 'wa-plus-sticker-field';
    const label = document.createElement('label');
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    input.id = `wa-plus-sticker-${name}`;
    label.setAttribute('for', input.id);
    label.textContent = t(key);
    if (type !== 'select') input.type = type;
    group.append(label, input);
    return { group, input, label };
  }
  const provider = field('provider', 'stickerProvider', 'select');
  for (const [value, key] of [['gemini', 'stickerGemini'], ['groq', 'stickerGroq'], ['cloudflare', 'stickerCloudflare'], ['custom', 'stickerCustom']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = t(key);
    provider.input.append(option);
  }
  provider.input.value = selected;
  const account = field('account', 'stickerAccountId');
  account.input.autocomplete = 'off';
  account.input.spellcheck = false;
  const accountHelp = paragraph('stickerCloudflareHelp', 'wa-plus-sticker-account-help');
  account.input.setAttribute('aria-describedby', accountHelp.id);
  account.group.append(accountHelp);
  const model = field('model', 'stickerModel');
  model.input.required = true;
  const modelHelp = paragraph('stickerGroqHelp', 'wa-plus-sticker-model-help');
  model.input.setAttribute('aria-describedby', modelHelp.id);
  model.group.append(modelHelp);
  const endpoint = field('endpoint', 'stickerBaseUrl', 'url');
  const endpointHelp = paragraph('stickerBaseUrlHelp', 'wa-plus-sticker-endpoint-help');
  endpoint.input.setAttribute('aria-describedby', endpointHelp.id);
  endpoint.input.autocomplete = 'off';
  endpoint.group.append(endpointHelp);
  const credential = field('key', 'stickerApiKey', 'password');
  credential.input.autocomplete = 'new-password';
  credential.input.spellcheck = false;
  credential.input.setAttribute('autocapitalize', 'none');
  const credentialStatus = paragraph('stickerKeyMissing', 'wa-plus-sticker-key-status');
  const credentialHelp = paragraph('stickerKeyHelp', 'wa-plus-sticker-key-help');
  credential.input.setAttribute('aria-describedby', `${credentialStatus.id} ${credentialHelp.id}`);
  credential.group.append(credentialStatus, credentialHelp);
  const feedback = paragraph('stickerSaving', 'wa-plus-sticker-feedback');
  feedback.className = 'wa-plus-sticker-feedback';
  feedback.setAttribute('tabindex', '-1');
  feedback.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'wa-plus-custom-text-dialog-actions';
  function button(key, type = 'button') {
    const element = document.createElement('button');
    element.type = type;
    element.textContent = t(key);
    actions.append(element);
    return element;
  }
  const preview = button('stickerAgreementPreview');
  preview.setAttribute('aria-haspopup', 'dialog');
  preview.addEventListener('click', () => {
    if (busy || selected !== 'cloudflare') return;
    openStickerAgreement({...config, provider:'cloudflare'}, preview, {preview:true, parentDialog:dialog});
  });
  const remove = button('stickerDeleteKey');
  const cancel = button('cancel');
  const save = button('save', 'submit');
  form.append(title, paragraph('stickerPrivacyHelp'), paragraph('stickerTransportHelp'), paragraph('stickerShortcutHelp'), provider.group,
    account.group, model.group, endpoint.group, credential.group, feedback, actions);
  dialog.append(style, form);
  document.body.append(dialog);
  activeDialog = dialog;

  const fields = [provider.input, account.input, model.input, endpoint.input, credential.input];
  const descriptions = new Map(fields.map(input => [input, input.getAttribute('aria-describedby') || '']));
  function clearFeedback() {
    feedback.hidden = true;
    feedback.textContent = '';
    save.removeAttribute('aria-describedby');
    for (const input of fields) {
      input.removeAttribute('aria-invalid');
      const description = descriptions.get(input);
      if (description) input.setAttribute('aria-describedby', description);
      else input.removeAttribute('aria-describedby');
    }
  }
  function showFeedback(key, input) {
    feedback.lang = getLanguage();
    const text = t(key);
    feedback.textContent = text;
    feedback.hidden = false;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${descriptions.get(input)} ${feedback.id}`.trim());
    }
    if (document.activeElement === feedback) {
      // Native modal dialogs can make an outside live region inert. Give the
      // updated message a fresh focus event instead of announcing it twice.
      const target = input || save;
      if (!input) save.setAttribute('aria-describedby', feedback.id);
      target.focus({ preventScroll: false });
    } else {
      feedback.focus({ preventScroll: false });
    }
  }
  function refreshCredentialStatus() {
    const stored = hasStickerCredential(selected, selected === 'cloudflare' ? account.input.value : selected === 'custom' ? endpoint.input.value : undefined);
    credentialStatus.textContent = t(stored ? 'stickerKeyStored' : 'stickerKeyMissing');
    credential.input.required = !stored;
    remove.setAttribute('aria-disabled', String(busy || !hasStickerCredential(selected)));
  }
  function populate() {
    preview.hidden = selected !== 'cloudflare';
    model.input.value = drafts[selected]?.model || '';
    model.input.readOnly = selected === 'gemini';
    account.group.hidden = selected !== 'cloudflare';
    account.input.required = selected === 'cloudflare';
    account.input.value = drafts[selected]?.accountId || '';
    credential.label.textContent = t(selected === 'cloudflare' ? 'stickerApiToken' : 'stickerApiKey');
    modelHelp.hidden = ['gemini', 'cloudflare'].includes(selected);
    modelHelp.textContent = modelHelp.hidden ? '' : t(selected === 'groq' ? 'stickerGroqHelp' : 'stickerCustomHelp');
    const modelDescription = modelHelp.hidden ? '' : modelHelp.id;
    descriptions.set(model.input, modelDescription);
    if (modelDescription) model.input.setAttribute('aria-describedby', modelDescription);
    else model.input.removeAttribute('aria-describedby');
    endpoint.group.hidden = selected !== 'custom';
    endpoint.input.required = selected === 'custom';
    endpoint.input.value = drafts[selected]?.baseUrl || '';
    credential.input.value = '';
    refreshCredentialStatus();
  }
  function setBusy(value) {
    busy = value;
    fields.forEach(input => { input.disabled = value; });
    for (const control of [save, cancel, remove, preview]) control.setAttribute('aria-disabled', String(value));
    save.textContent = t(value ? 'stickerSaving' : 'save');
    refreshCredentialStatus();
  }
  function knownError(error) {
    // Never expose raw provider, storage, or exception text to the DOM.
    const code = error?.message;
    return SAVE_ERRORS.has(code) ? code : 'stickerStorageError';
  }
  provider.input.addEventListener('change', () => {
    drafts[selected] = { model: model.input.value, accountId: account.input.value, baseUrl: endpoint.input.value };
    selected = provider.input.value;
    clearFeedback();
    populate();
  });
  endpoint.input.addEventListener('input', refreshCredentialStatus);
  account.input.addEventListener('input', refreshCredentialStatus);
  fields.forEach(input => input.addEventListener('input', clearFeedback));
  cancel.addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => {
    if (busy) {
      event.preventDefault();
      save.focus({ preventScroll: false });
    }
  });
  dialog.addEventListener('close', () => {
    credential.input.value = '';
    activeDialog = null;
    dialog.remove();
    restoreFocus?.();
  });
  remove.addEventListener('click', async () => {
    if (busy || !hasStickerCredential(selected)) return;
    clearFeedback();
    setBusy(true);
    try {
      await deleteStickerCredential(selected);
      credential.input.value = '';
      showFeedback('stickerKeyDeleted');
    } catch (error) {
      showFeedback(knownError(error));
    } finally {
      setBusy(false);
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    clearFeedback();
    if (!model.input.value.trim()) { showFeedback('stickerModelRequired', model.input); return; }
    if (selected === 'cloudflare' && !/^[a-f0-9]{32}$/i.test(account.input.value.trim())) {
      showFeedback('stickerAccountRequired', account.input); return;
    }
    if (selected === 'cloudflare') {
      try { normalizeStickerEndpoint(selected, account.input.value, model.input.value.trim()); }
      catch { showFeedback('stickerCloudflareModelInvalid', model.input); return; }
    }
    if (selected === 'custom') {
      try {
        const url = new URL(endpoint.input.value.trim());
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
      } catch { showFeedback('stickerInvalidEndpoint', endpoint.input); return; }
    }
    const key = credential.input.value.trim();
    if (!key && credential.input.required) { showFeedback('stickerKeyRequired', credential.input); return; }
    if (/^[*•●]+$/.test(key)) { showFeedback('stickerKeyRequired', credential.input); return; }
    setBusy(true);
    try {
      await saveStickerConfig({ provider: selected, accountId: account.input.value.trim(), model: model.input.value.trim(), baseUrl: endpoint.input.value.trim(), key });
      dialog.close();
      announce(t('stickerSettingsSaved'));
    } catch (error) {
      const code = knownError(error);
      setBusy(false);
      if (code === 'stickerKeyUnreadable') {
        credential.input.required = true;
        credentialStatus.textContent = t('stickerKeyUnreadable');
      }
      showFeedback(code, /Key|Credential|ConfigureFirst/.test(code) ? credential.input : undefined);
    }
  });
  populate();
  dialog.showModal();
  provider.input.focus({ preventScroll: true });
}
