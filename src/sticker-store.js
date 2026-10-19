import { readSetting, writeSetting } from './settings-state.js';

export const STICKER_STORAGE = 'wa-plus-sticker-config-v1';
export const STICKER_ENABLED = 'wa-plus-read-sticker';
export const STICKER_CHANGED = 'wa-plus-sticker-settings-changed';
const DB_NAME = 'wa-plus-sticker-keys';
const defaults = () => ({version: 1, provider: 'gemini', providers: {
  gemini: {model: 'gemini-3.5-flash-lite'}, groq: {model: 'qwen/qwen3.8-27b'}, custom: {model: '', baseUrl: ''}, cloudflare: {model: '@cf/meta/llama-3.2-11b-vision-instruct', accountId: ''}
}});
const fail = key => { throw new Error(key); };
export function isReadStickerEnabled() { return readSetting(STICKER_ENABLED, 'false') === 'true'; }
export function setReadStickerEnabled(value) {
  if (!writeSetting(STICKER_ENABLED, String(!!value))) return false;
  window.dispatchEvent(new Event(STICKER_CHANGED));
  return true;
}
export function getStickerConfig() {
  try {
    const value = JSON.parse(readSetting(STICKER_STORAGE, 'null'));
    if (value?.version !== 1 || !['gemini','groq','custom','cloudflare'].includes(value.provider)) return defaults();
    const result = defaults();
    result.provider = value.provider;
    for (const name of Object.keys(result.providers)) {
      const p = value.providers?.[name];
      if (p && typeof p === 'object') result.providers[name] = {
        model: typeof p.model === 'string' ? p.model : result.providers[name].model,
        ...(name === 'cloudflare' ? {accountId: typeof p.accountId === 'string' ? p.accountId : ''} : {}),
        ...(name === 'custom' ? {baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : ''} : {}),
        ...(p.credential ? {credential: p.credential} : {})
      };
    }
    return result;
  } catch { return defaults(); }
}
export function normalizeStickerEndpoint(provider, baseUrl = '', model = '@cf/meta/llama-3.2-11b-vision-instruct') {
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
  if (provider === 'groq') return 'https://api.groq.com/openai/v1/chat/completions';
  if (provider === 'cloudflare') {
    if (!/^[a-f0-9]{32}$/i.test(baseUrl.trim())) return fail('stickerAccountRequired');
    if (typeof model !== 'string' || model.length > 160 || !/^@(cf|hf)\/[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) return fail('stickerInvalidConfig');
    return `https://api.cloudflare.com/client/v4/accounts/${baseUrl.trim().toLowerCase()}/ai/run/${model}`;
  }
  if (provider !== 'custom') return fail('stickerInvalidConfig');
  let url;
  try { url = new URL(baseUrl.trim()); } catch { return fail('stickerInvalidConfig'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port && url.port !== '443') return fail('stickerInvalidConfig');
  let path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/chat/completions')) path += path.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
  url.pathname = path;
  return url.href;
}
export function hasStickerCredential(provider, endpoint) {
  const profile=getStickerConfig().providers[provider];
  if(!profile?.credential)return false;
  if(endpoint!==undefined){try{return profile.credential.endpoint===normalizeStickerEndpoint(provider,endpoint);}catch{return false;}}
  return true;
}
function openKeys() {
  return new Promise((resolve,reject) => {
    if (!globalThis.crypto?.subtle || !globalThis.indexedDB) return reject(new Error('stickerStorageError'));
    const request = indexedDB.open(DB_NAME, 1);
    let finished=false;
    const timer=setTimeout(()=>{finished=true;reject(new Error('stickerStorageError'));},5000);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onerror = request.onblocked = () => {finished=true;clearTimeout(timer);reject(new Error('stickerStorageError'));};
    request.onsuccess = () => {clearTimeout(timer);if(finished)request.result.close();else resolve(request.result);};
  });
}
async function storedKey(id, create = false) {
  const candidate = create ? {id: crypto.randomUUID(), key: await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])} : null;
  const db = await openKeys();
  try {
    return await new Promise((resolve,reject) => {
      const tx = db.transaction('keys', create ? 'readwrite' : 'readonly');
      const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(new Error('stickerStorageError'));},5000);
      const store = tx.objectStore('keys');
      let result;
      const read = store.get(create ? 'active' : id);
      read.onsuccess = () => {
        result = read.result;
        const insert = () => {
          result = candidate;
          store.put(candidate, candidate.id);
          store.put(candidate, 'active');
        };
        if (!result && candidate) insert();
        else if(result && candidate){
          const verify=store.get(result.id);
          verify.onsuccess=()=>{if(!verify.result)insert();else result=verify.result;};
        }
      };
      tx.oncomplete = () => {clearTimeout(timer);result ? resolve(result) : reject(new Error('stickerKeyUnreadable'));};
      tx.onerror = tx.onabort = () => {clearTimeout(timer);reject(new Error('stickerStorageError'));};
    });
  } finally { db.close(); }
}
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
function decode(text, max) {
  if (typeof text !== 'string' || text.length > max || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return fail('stickerKeyUnreadable');
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}
const aad = (provider, endpoint, keyId) => new TextEncoder().encode(JSON.stringify([1, provider, endpoint, keyId]));
export async function decryptStickerCredential(provider, profile) {
  try {
    const endpoint = normalizeStickerEndpoint(provider, profile.accountId || profile.baseUrl);
    const e = profile.credential;
    if (!e || e.version !== 1 || e.provider !== provider || e.endpoint !== endpoint || typeof e.keyId !== 'string' || e.keyId.length > 80) return fail('stickerKeyUnreadable');
    const iv = decode(e.iv, 24), ciphertext = decode(e.ciphertext, 12000);
    if (iv.length !== 12 || ciphertext.length < 17) return fail('stickerKeyUnreadable');
    const record = await storedKey(e.keyId);
    const bytes = await crypto.subtle.decrypt({name:'AES-GCM', iv, additionalData:aad(provider,endpoint,e.keyId), tagLength:128}, record.key, ciphertext);
    const key = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if (!key.trim() || key.length > 8192) return fail('stickerKeyUnreadable');
    return key;
  } catch { return fail('stickerKeyUnreadable'); }
}
async function saveUnlocked(input) {
  const before = readSetting(STICKER_STORAGE, '');
  const config = getStickerConfig();
  const {provider} = input;
  // Keep the original account-bound credential context so changing models does not invalidate saved tokens.
  const endpoint = normalizeStickerEndpoint(provider,input.accountId || input.baseUrl);
  const model = provider === 'gemini' ? 'gemini-3.5-flash-lite' : input.model?.trim() ?? (provider === 'cloudflare' ? config.providers.cloudflare.model : '');
  if (!model || model.length > 160 || /[\s\x00-\x1f]/.test(model)) return fail('stickerInvalidConfig');
  if (provider === 'cloudflare') normalizeStickerEndpoint(provider, input.accountId, model);
  const key = input.key?.trim() || '';
  const profile = {model, ...(provider === 'cloudflare' ? {accountId: input.accountId.trim().toLowerCase()} : {}), ...(provider === 'custom' ? {baseUrl:endpoint} : {})};
  if (key) {
    if (key.length > 8192 || /^[*•]+$/.test(key) || /[\r\n]/.test(key)) return fail('stickerInvalidConfig');
    try {
      const record = await storedKey('', true);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(provider,endpoint,record.id),tagLength:128},record.key,new TextEncoder().encode(key));
      profile.credential = {version:1,provider,endpoint,keyId:record.id,iv:encode(iv),ciphertext:encode(ciphertext)};
    } catch { return fail('stickerStorageError'); }
  } else {
    const existing = config.providers[provider];
    if (!existing?.credential) return fail('stickerConfigureFirst');
    if (normalizeStickerEndpoint(provider, existing.accountId || existing.baseUrl) !== endpoint) return fail('stickerConfigureFirst');
    await decryptStickerCredential(provider,existing);
    profile.credential = existing.credential;
  }
  if (readSetting(STICKER_STORAGE,'') !== before) return fail('stickerStorageError');
  config.providers[provider] = profile;
  config.provider = provider;
  if (!writeSetting(STICKER_STORAGE,JSON.stringify(config))) return fail('stickerStorageError');
  window.dispatchEvent(new Event(STICKER_CHANGED));
}
export async function saveStickerConfig(input) {
  if (globalThis.navigator?.locks) return withConfigLock(()=>saveUnlocked(input));
  return saveUnlocked(input);
}
export async function deleteStickerCredential(provider) {
  const perform = () => {
    const config = getStickerConfig();
    if (!config.providers[provider]) return fail('stickerInvalidConfig');
    delete config.providers[provider].credential;
    if (!writeSetting(STICKER_STORAGE,JSON.stringify(config))) return fail('stickerStorageError');
    window.dispatchEvent(new Event(STICKER_CHANGED));
  };
  if (globalThis.navigator?.locks) return withConfigLock(perform);
  return perform();
}

async function withConfigLock(action) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{return await navigator.locks.request('wa-plus-sticker-config',{signal:controller.signal},()=>{clearTimeout(timer);return action();});}
  catch(error){if(error.name==='AbortError')return fail('stickerStorageError');throw error;}
  finally{clearTimeout(timer);}
}
