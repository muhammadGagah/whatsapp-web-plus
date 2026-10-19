const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {transformSync} = require('esbuild');
const {webcrypto} = require('node:crypto');
class Element {
  constructor(tag) { this.tagName=tag.toUpperCase(); this.children=[]; this.listeners=new Map(); this.attrs=new Map(); this.style={}; this.checked=false; this.isConnected=true; }
  append(...nodes) { for(const node of nodes){node.parent=this;this.children.push(node);} }
  setAttribute(k,v) {this.attrs.set(k,String(v));}
  removeAttribute(k) {this.attrs.delete(k);}
  addEventListener(k,fn) {this.listeners.set(k,[...(this.listeners.get(k)||[]),fn]);}
  async emit(type, trusted=true) {const e={isTrusted:trusted,prevented:false,preventDefault(){this.prevented=true;}};for(const fn of this.listeners.get(type)||[])await fn(e);return e;}
  focus() {document.activeElement=this;}
  getClientRects() {return [{}];}
  showModal() {this.open=true;}
  close() {this.open=false;void this.emit('close');}
  remove() {this.isConnected=false;this.parent.children=this.parent.children.filter(n=>n!==this);}
}
const document={querySelectorAll:()=>[],body:new Element('body'),createElement:t=>new Element(t),createTextNode:text=>({textContent:text}),querySelector:selector=>selector==='dialog[open]' ? all().find(n=>n.tagName==='DIALOG'&&n.open)||null : null};
function all(n=document.body){return [n,...(n.children||[]).flatMap(x=>all(x))];}
const byId=id=>all().find(n=>n.id===id);
const button=text=>all().find(n=>n.tagName==='BUTTON'&&n.textContent===text);
const listeners=new Map();
const window={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
let config={provider:'cloudflare',providers:{cloudflare:{accountId:'a'.repeat(32),model:'@cf/meta/llama-3.2-11b-vision-instruct'}}};
let response={status:200,body:{success:true}}, calls=[], decrypts=0, pendingResponse=null, pendingDecrypt=null;
const announcements=[], timers=new Set();
const settings={getLanguage:()=> 'en',t:key=>key};
const imports={
  './chat-accessibility.js':{announce:text=>announcements.push(text)},
  './settings-state.js':settings,
  './sticker-store.js':{getStickerConfig:()=>config,STICKER_CHANGED:'changed',STICKER_STORAGE:'storage-key',decryptStickerCredential:async()=>{decrypts++;return pendingDecrypt || 'test-token';},normalizeStickerEndpoint:()=> 'https://api.cloudflare.com/endpoint'},
  './sticker-transport.js':{requestStickerTransport:async req=>{calls.push({...req,body:{...req.body}});return pendingResponse || response;}}
};
const sandbox={module:{exports:{}},exports:{},require:k=>imports[k],document,window,crypto:webcrypto,AbortController,
  setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)};
vm.runInNewContext(transformSync(fs.readFileSync('src/sticker-agreement.js','utf8'),{format:'cjs'}).code,sandbox);
const {openStickerAgreement}=sandbox.module.exports;
const origin=new Element('button');origin.focus();
const consent=()=>byId('wa-plus-sticker-agreement-consent');
const region=()=>byId('wa-plus-sticker-agreement-region');
(async()=>{
  assert.equal(openStickerAgreement(config,origin),true);
  assert.equal(openStickerAgreement(config,origin),false);
  assert.equal(document.activeElement,button('cancel'));
  assert.equal(calls.length,0);assert.equal(decrypts,0);
  assert.equal(consent().required,true);assert.equal(region().required,true);
  assert.equal(consent().style.width,'auto');assert.equal(consent().checked,false);assert.equal(region().checked,false);
  assert.equal(button('stickerAgreementAccept').disabled,true);
  const links=all().filter(n=>n.tagName==='A');
  assert.equal(links.length,2);assert.ok(links.every(n=>n.rel.includes('noopener')&&n.target==='_blank'));
  await button('stickerAgreementAccept').emit('click');assert.equal(calls.length,0);
  consent().checked=true;await consent().emit('change');
  await button('stickerAgreementAccept').emit('click');assert.equal(calls.length,0);
  region().checked=true;await region().emit('change');
  assert.equal(button('stickerAgreementAccept').disabled,false);
  await button('stickerAgreementAccept').emit('click',false);assert.equal(calls.length,0);
  const acceptButton=button('stickerAgreementAccept');
  await acceptButton.emit('click');
  assert.equal(calls.length,1);assert.equal(calls[0].purpose,'model-agreement');
  assert.equal(calls[0].body.prompt, 'agree'); assert.equal(Object.keys(calls[0].body).length, 1);
  assert.equal(document.querySelector('dialog[open]'),null);
  assert.deepEqual(announcements,['stickerAgreementSuccess']);
  await acceptButton.emit('click');assert.equal(calls.length,1);
  assert.equal(document.activeElement,origin);assert.equal(listeners.size,0);
  openStickerAgreement(config,origin);
  await button('cancel').emit('click');assert.equal(calls.length,1);
  openStickerAgreement(config,origin);
  consent().checked=region().checked=true;
  response={status:403,body:{success:false,errors:[{code:5016,message:'raw secret'}]}};
  await button('stickerAgreementAccept').emit('click');
  assert.equal(document.activeElement.textContent,'stickerAgreementFailed');
  assert.equal(button('cancel').attrs.has('aria-disabled'),false);
  listeners.get('changed')();assert.equal(document.querySelector('dialog[open]'),null);
  assert.equal(listeners.size,0);
  pendingResponse=new Promise(()=>{});
  openStickerAgreement(config,origin);
  consent().checked=region().checked=true;
  const hungRequest=button('stickerAgreementAccept').emit('click');
  await new Promise(resolve=>setImmediate(resolve));
  for(const timer of [...timers])timer();
  await hungRequest;
  assert.equal(document.activeElement.textContent,'stickerAgreementTimeout');
  assert.equal(button('stickerAgreementAccept').disabled,false);
  assert.equal(announcements.length,1,'timeout never claims success');
  await button('cancel').emit('click');
  assert.equal(timers.size,0);
  pendingResponse=null;response={status:200,body:{success:true}};
  let releaseDecrypt;
  pendingDecrypt=new Promise(resolve=>{releaseDecrypt=resolve;});
  openStickerAgreement(config,origin);
  consent().checked=region().checked=true;
  const oldAttempt=button('stickerAgreementAccept').emit('click');
  for(const timer of [...timers])timer();
  await oldAttempt;
  pendingDecrypt=null;
  const beforeRetry=calls.length;
  await button('stickerAgreementAccept').emit('click');
  releaseDecrypt('late-token');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,beforeRetry+1,'timed-out decrypt cannot send another agreement after retry');
  assert.equal(document.querySelector('dialog[open]'),null);
  const beforePreview={calls:calls.length,decrypts,announcements:announcements.length};
  const parent=new Element('dialog');document.body.append(parent);parent.showModal();
  assert.equal(openStickerAgreement(config,origin),false,'real agreement cannot stack over settings');
  for(let i=0;i<2;i++) {
    assert.equal(openStickerAgreement(config,origin,{preview:true,parentDialog:parent}),true);
    assert.equal(document.activeElement.textContent,'stickerAgreementPreviewTitle');
    assert.equal(consent().checked,false);assert.equal(region().checked,false);
    consent().checked=region().checked=true;
    await button('stickerAgreementAccept').emit('click');
    assert.equal(document.activeElement.textContent,'stickerAgreementPreviewDone');
    await button('stickerAgreementClose').emit('click');
    assert.equal(parent.open,true,'preview preserves settings');
  }
  assert.deepEqual({calls:calls.length,decrypts,announcements:announcements.length},beforePreview);
  parent.close();parent.remove();
  assert.equal(openStickerAgreement({...config,providers:{cloudflare:{...config.providers.cloudflare,model:'@cf/meta/llama-4-scout-17b-16e-instruct'}}},origin),false,'Llama 3 license dialog must not accept another model agreement');
  openStickerAgreement(config,origin);
  consent().checked=region().checked=true;
  let release;
  pendingResponse = new Promise(resolve=>{release=resolve;});
  const inFlight = button('stickerAgreementAccept').emit('click');
  await new Promise(resolve=>setImmediate(resolve));
  const busyDialog = byId('wa-plus-sticker-agreement');
  const escapeEvent = await busyDialog.emit('cancel');
  assert.equal(escapeEvent.prevented,false,'Escape retains native close while sending');
  await button('stickerAgreementClose').emit('click');
  assert.equal(busyDialog.open,false);
  release({status:200,body:{success:true}}); await inFlight;
  assert.equal(document.activeElement,origin,'late response does not steal focus');
  assert.equal(listeners.size,0);
  console.log('Sticker model agreement dialog tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
