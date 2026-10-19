const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {parseHTML}=require('linkedom');
const strip=file=>fs.readFileSync(`src/${file}`,'utf8').replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm,'').replace(/^export /gm,'');
// Sanitized structural fixture from sticker_1.txt: opaque message ID, gridcell,
// sticker container and its own focusable button. No chat text or media retained.
const html=`<html><body><div id="main"><header><span id="chat-title" data-testid="conversation-info-header-chat-title">Chat A</span><div data-testid="chat-subtitle">Online</div></header>
<div data-testid="conversation-panel-messages"><div role="grid"><div role="row">
<div data-id="ABC123"><div class="focusable-list-item" role="gridcell" tabindex="0">
<div data-testid="msg-container"><span data-testid="sticker-container"><button tabindex="0"><img src="blob:https://web.whatsapp.com/test"></button></span></div>
<button id="options">Options</button></div></div></div></div></div><footer><div contenteditable="true"></div></footer></div></body></html>`;
function fixture(){
 const {document}=parseHTML(html);let active=null,observe,decodeSignal;const spoken=[];
 Object.defineProperty(document,'activeElement',{get:()=>active});
 const config={provider:'test',providers:{test:{credential:{version:1}}}};
 const context=vm.createContext({document,console,AbortController,TextEncoder,location:{origin:'https://web.whatsapp.com'},
 SELECTORS:{main:'#main',conversationMessages:'[data-testid="conversation-panel-messages"]'},ownedAttributes:new WeakMap(),OWNERS:{messageCell:'cell',messageGrid:'grid'},
 crypto:{randomUUID:()=> 'test-id'},window:{addEventListener(){}},MutationObserver:class {constructor(fn){observe=fn;}observe(){}},
 setTimeout:()=>1,clearTimeout(){},installStickerTransport(){},isReadStickerEnabled:()=>true,getStickerConfig:()=>config,
 getLanguage:()=> 'en',t:key=>key,announce:text=>spoken.push(text),decryptStickerCredential:async()=> 'test-key',
 STICKER_CHANGED:'changed',STICKER_STORAGE:'config',STICKER_ENABLED:'enabled',STICKER_LIMITS:{sourceBytes:1024},
 fetch:async()=>({}),readBoundedBody:async()=>new Uint8Array([1]),decodeSticker:(bytes,signal)=>{decodeSignal=signal;return new Promise(()=>{});}});
 const ca=strip('chat-accessibility.js');vm.runInContext(ca.slice(ca.indexOf('function isPrimaryMessageItem('),ca.indexOf('function getRawMessageReadMoreControls(')),context);
 vm.runInContext(strip('chat-context.js'),context);vm.runInContext(strip('read-sticker.js'),context);context.startReadSticker();
 const cell=document.querySelector('.focusable-list-item'),img=cell.querySelector('img'),button=img.parentElement;
 Object.defineProperties(img,{complete:{value:true,configurable:true},naturalWidth:{value:128,configurable:true}});
 return {context,document,cell,img,button,spoken,get signal(){return decodeSignal;},mutate:records=>observe(records),
 focus(node){active=node;return {target:node,preventDefault(){},stopImmediatePropagation(){}};}};
}
(async()=>{
 const f=fixture();assert.equal(f.context.resolveStickerTarget(f.focus(f.cell)).img,f.img);
 assert.equal(f.context.resolveStickerTarget(f.focus(f.button)).img,f.img);
 assert.equal(f.context.getFocusedPrimaryMessageItem(f.focus(f.button)),null,'Alt+Shift+C remains strict');
 for(const node of [f.cell.querySelector('#options'),f.document.querySelector('[contenteditable]'),f.img,f.document.body])assert.equal(f.context.resolveStickerTarget(f.focus(node)),null);
 const other=fixture();const otherButton=other.document.createElement("button");other.button.parentElement.appendChild(otherButton);assert.equal(other.context.resolveStickerTarget(other.focus(otherButton)),null);
 const lottie=fixture();const roleButton=lottie.document.createElement('div');roleButton.setAttribute('role','button');roleButton.setAttribute('tabindex','0');roleButton.innerHTML='<div data-testid="lottie-animated-emoji-container"><svg viewBox="0 0 512 512"><path d="M0 0h10v10z"/></svg></div>';lottie.button.replaceWith(roleButton);
 assert.equal(lottie.context.resolveStickerTarget(lottie.focus(lottie.cell)).svg,true);
 assert.equal(lottie.context.resolveStickerTarget(lottie.focus(roleButton)).img,roleButton.querySelector('svg'));
 assert.equal(lottie.context.resolveStickerTarget(lottie.focus(roleButton.querySelector('path'))),null);
 roleButton.setAttribute('aria-haspopup','menu');assert.equal(lottie.context.resolveStickerTarget(lottie.focus(roleButton)),null);roleButton.removeAttribute('aria-haspopup');
 roleButton.setAttribute('aria-disabled','true');assert.equal(lottie.context.resolveStickerTarget(lottie.focus(roleButton)),null);
 const quoted=fixture();const quote=quoted.document.createElement('div');quote.setAttribute('data-testid','quoted-message');const sticker=quoted.button.parentElement;sticker.replaceWith(quote);quote.appendChild(sticker);assert.equal(quoted.context.resolveStickerTarget(quoted.focus(quoted.button)),null);
 const ambiguous=fixture();ambiguous.button.appendChild(ambiguous.img.cloneNode());assert.equal(ambiguous.context.resolveStickerTarget(ambiguous.focus(ambiguous.cell)),null);
 const picker=fixture();picker.document.body.appendChild(picker.button.parentElement);assert.equal(picker.context.resolveStickerTarget(picker.focus(picker.button)),null);
 const disabledImage=fixture();Object.defineProperty(disabledImage.img,'complete',{value:false});assert.equal(disabledImage.context.resolveStickerTarget(disabledImage.focus(disabledImage.cell)),null);
 for(const boundary of ['text','title','header','container','main']){
  const f=fixture();f.context.handleReadStickerShortcut(f.focus(f.button));await new Promise(setImmediate);assert.ok(f.signal,`${boundary}: opaque ID must reach decode`);assert.equal(f.spoken.at(-1),'stickerReading');
  const header=f.document.querySelector('header');
  if(boundary==='text')f.mutate([{type:'characterData',target:header.firstChild.firstChild}]);
  else if(boundary==='title'){const title=header.firstChild;f.mutate([{type:'childList',target:header,removedNodes:[title],addedNodes:[title]}]);}
  else {const node=boundary==='header'?header:boundary==='main'?f.document.querySelector('#main'):f.document.querySelector('[data-testid="conversation-panel-messages"]');f.mutate([{type:'childList',target:node.parentElement,addedNodes:[node],removedNodes:[node]}]);}
  assert.equal(f.signal.aborted,true,`${boundary}: transient chat boundary cancels even after restoration`);
 }
 for(const kind of ['childList','characterData','attributes']){
  const f=fixture();f.context.handleReadStickerShortcut(f.focus(f.button));await new Promise(setImmediate);
  const status=f.document.querySelector('[data-testid="chat-subtitle"]');
  f.mutate([{type:kind,target:kind==='characterData'?status.firstChild:status,attributeName:kind==='attributes'?'aria-label':null,oldValue:'Online',removedNodes:[],addedNodes:[]}]);
  assert.equal(f.signal.aborted,false,`${kind}: updating chat status must not cancel sticker decoding`);
 }
 const scroll=fixture();scroll.context.handleReadStickerShortcut(scroll.focus(scroll.cell));await new Promise(setImmediate);const row=scroll.cell.closest('[role="row"]');row.remove();scroll.mutate([{type:'childList',target:scroll.document.querySelector('[role="grid"]'),removedNodes:[row],addedNodes:[]}]);assert.equal(scroll.signal.aborted,false,'same-chat virtualization after bytes does not cancel');
 console.log('Sticker target DOM and opaque chat identity tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
