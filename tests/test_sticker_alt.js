const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { document, Element } = parseHTML('<html><body><main><div class="focusable-list-item"><span data-testid="author" aria-label="Sender">Sender</span><span data-testid="sticker-container"><button><img alt="A laughing cup"></button><button><img alt="A laughing cup"></button></span><div data-testid="msg-meta"><span>22.58</span><svg><title>status-icon</title></svg></div></div></main></body></html>');
let language = 'id';
const context = vm.createContext({
 document, Element, ownedAttributes: new WeakMap(),
 _origSetAttribute: Element.prototype.setAttribute,
 _origRemoveAttribute: Element.prototype.removeAttribute,
 SELECTORS: {conversationMessages:'main'}, OWNERS: {stickerMessageName:'sticker-name'},
 cleanString: value => String(value).replace(/\s+/g,' ').trim(),
 prepareNamedAttribute: (el, name, value) => value,
 getDeliveryStatusKey: value => /^(read|dibaca)$/i.test(String(value).trim()) ? 'deliveryRead' : '',
 translateDeliveryStatus: (value, host) => (host || language) === 'id' ? 'Dibaca' : 'Read',
 getSupportedLanguage: value => ['en', 'id'].includes(value) ? value : '',
 tForLanguage: (key, host) => host === 'id' ? 'stiker' : 'sticker',
 t: () => language === 'id' ? 'stiker' : 'sticker'
});
vm.runInContext(fs.readFileSync('src/owned-attributes.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
const source=fs.readFileSync('src/chat-accessibility.js','utf8');
vm.runInContext(source.slice(source.indexOf('export function refreshStickerMessageNames('),source.indexOf('export function refreshMessageMentionNames(')).replace('export ',''),context);
const item=document.querySelector('.focusable-list-item');
const refresh=()=>context.refreshStickerMessageNames(document);
refresh();
assert.equal(item.getAttribute('aria-label'),'Sender stiker: A laughing cup 22.58');
refresh();
assert.equal(item.getAttribute('aria-label'),'Sender stiker: A laughing cup 22.58');
language='en';refresh();
assert.equal(item.getAttribute('aria-label'),'Sender sticker: A laughing cup 22.58');
item.querySelectorAll('img').forEach(img=>img.setAttribute('alt','Updated cup'));refresh();
assert.equal(item.getAttribute('aria-label'),'Sender sticker: Updated cup 22.58');
const privacySource = fs.readFileSync('src/privacy.js', 'utf8');
Object.assign(context, {
  privacyAttributes: new Map(), senderDeviceLabels: new Map(), messageCaptionLabels: new Map(),
  isPrivacyMode: false, isSenderDeviceMessageLabel: () => true,
  getMessageContextInstructionRegex: () => /never-match-this/,
  isSenderDeviceAnnouncementEnabled: () => false
});
vm.runInContext(privacySource.slice(privacySource.indexOf('export function cleanNamedAttribute('), privacySource.indexOf('function maskPhoneAuthorText(')).replace('export ', ''), context);
context.prepareNamedAttribute = (el, name, value) => `${value} Android`;
context.cleanNamedAttribute(item, 'aria-label');
context.isOwnedMutation(item, 'aria-label');
context.prepareNamedAttribute = (el, name, value) => value;
item.querySelectorAll('img').forEach(img => img.setAttribute('alt', 'New description'));
refresh();
assert.equal(item.getAttribute('aria-label'), 'Sender sticker: New description 22.58');
item.querySelectorAll('img').forEach(img => img.setAttribute('alt', 'Updated cup'));
refresh();
item.setAttribute('aria-labelledby','native-label');refresh();
assert.equal(item.getAttribute('aria-label'),null);
item.removeAttribute('aria-labelledby');refresh();
assert.ok(item.getAttribute('aria-label').includes('Updated cup'));
item.setAttribute('aria-label','Native message');refresh();
assert.equal(item.getAttribute('aria-label'),'Native message');
item.removeAttribute('aria-label');refresh();
const sticker=item.querySelector('[data-testid="sticker-container"]');
sticker.setAttribute('data-testid','quoted-message');refresh();
assert.equal(item.getAttribute('aria-label'),null);
sticker.setAttribute('data-testid','sticker-container');
sticker.setAttribute('aria-hidden','true');refresh();
assert.equal(item.getAttribute('aria-label'),null);
sticker.removeAttribute('aria-hidden');refresh();
assert.ok(item.getAttribute('aria-label'));
// An outgoing sticker keeps its delivery status from the status icon.
const meta=item.querySelector('[data-testid="msg-meta"]');
const statusIcon=document.createElement('span');statusIcon.setAttribute('aria-label',' Read ');meta.appendChild(statusIcon);
refresh();
assert.ok(item.getAttribute('aria-label').endsWith('22.58 Read'),item.getAttribute('aria-label'));
language='id';refresh();
assert.ok(item.getAttribute('aria-label').endsWith('22.58 Dibaca'));
// WhatsApp's page language wins, so the prefix and status never mix languages.
language='en';document.documentElement.setAttribute('lang','id');refresh();
assert.equal(item.getAttribute('aria-label'),'Sender stiker: Updated cup 22.58 Dibaca');
document.documentElement.removeAttribute('lang');
language='en';statusIcon.remove();refresh();
assert.ok(item.getAttribute('aria-label').endsWith('22.58'));
// Privacy mode hides a phone-number author itself; the label still names the (masked) sender.
const author=item.querySelector('[data-testid="author"]');
context.cleanString=(value,mode)=>mode==='identity'?'Participant':String(value).replace(/\s+/g,' ').trim();
author.setAttribute('aria-hidden','true');refresh();
assert.ok(item.getAttribute('aria-label').startsWith('Participant sticker:'),'an aria-hidden author still names the sender');
author.removeAttribute('aria-hidden');
sticker.remove();refresh();
assert.equal(item.getAttribute('aria-label'),null);
console.log('Sticker alternative text label tests passed.');
