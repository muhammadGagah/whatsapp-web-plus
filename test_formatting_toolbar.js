const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/formatting-toolbar.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const icons = ['ic-format-bold', 'ic-format-italic', 'ic-format-strikethrough', 'ic-code', 'ic-format-list-numbered', 'ic-format-list-bulleted', 'ic-format-quote'];
function fixture() {
  const listeners = {}, timers = new Map(); let timer = 0, clicks = 0, now = 0;
  class El {
    constructor() { this.attrs = new Map(); this.isConnected = true; this.childNodes = []; this.nodeType = 1; this.textContent = ''; }
    contains(node) { return node === this || this.childNodes.some(c => c === node || c.contains?.(node)); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    hasAttribute(k) { return this.attrs.has(k); }
    setAttribute(k,v) { this.attrs.set(k,v); }
    focus() { doc.activeElement = this; emit('focusin', {target:this}); }
    appendChild(c) { this.childNodes.push(c); }
    remove() { this.isConnected = false; }
  }
  const input = new El(), main = new El(), popup = new El(), body = new El(), messages = new El();
  const text = {isConnected:true,nodeType:3,length:6}; input.textContent='abcdef'; input.childNodes=[text];
  const buttons=icons.map(icon=>{const b=new El(); b.querySelector=()=>({textContent:icon}); b.click=()=>{clicks++;}; b.setAttribute('aria-label',icon);return b;});
  popup.childNodes=buttons; popup.querySelectorAll=()=>buttons; popup.setAttribute('role','menu');
  main.querySelector=()=>messages;
  const selection={anchorNode:text,anchorOffset:5,focusNode:text,focusOffset:1,isCollapsed:false,rangeCount:1,setBaseAndExtent(a,ao,f,fo){this.anchorNode=a;this.anchorOffset=ao;this.focusNode=f;this.focusOffset=fo;this.isCollapsed= a===f&&ao===fo;}};
  const doc={body,activeElement:input,querySelector:s=>s==='input'?input:main,getSelection:()=>selection,getElementById:()=>({querySelectorAll:()=>popup.isConnected?[popup]:[]}),createElement:()=>new El(),addEventListener:(k,f)=>{listeners[k]=f;},removeEventListener:k=>delete listeners[k]};
  function emit(k,e={}) {listeners[k]?.(e);}
  function key(k,extra={}) { const e={key:k,code:k,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...extra};emit('keydown',e);return e; }
  const announcements=[];const ownership=new Map();
  const apply=(el,k,v)=>{let map=ownership.get(el);if(!map)ownership.set(el,map=new Map());if(!map.has(k))map.set(k,el.getAttribute(k));el.setAttribute(k,v);};
  const release=(el,k)=>{const map=ownership.get(el);if(!map?.has(k))return;const v=map.get(k);if(v===null)el.attrs.delete(k);else el.setAttribute(k,v);map.delete(k);};
  const ctx={SELECTORS:{messageInput:'input',main:'main',conversationMessages:'messages'},setTimeout,clearTimeout};
  vm.createContext(ctx);vm.runInContext(source+'\nthis.factory=createFormattingToolbarController;',ctx);
  const controller=ctx.factory({document:doc,window:{},applyOwnedAttribute:apply,releaseOwnedAttribute:release,isRenderedElement:e=>e.isConnected&&!e.hasAttribute('hidden'),getActiveModal:()=>null,getCurrentChatTitle:()=> 'chat',t:k=>k,announce:m=>announcements.push(m),setTimeout:(f,delay=0)=>{timers.set(++timer,{f,at:now+delay});return timer;},clearTimeout:k=>timers.delete(k)});
  controller.start();
  function advance(ms) {
    const end=now+ms;
    while (true) {
      const next=[...timers.entries()].filter(([,task])=>task.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);now=next[1].at;next[1].f();
    }
    now=end;
  }
  return {doc,input,popup,buttons,selection,controller,key,emit,announcements,advance,clicks:()=>clicks,flush(){const batch=[...timers.values()];timers.clear();batch.forEach(task=>task.f());}};
}
{
 const f=fixture();
 for(let i=0;i<10;i++){f.advance(100);f.controller.refresh();}
 assert.deepEqual(f.announcements,['formattingToolbarAvailable'],'Unrelated refreshes must not starve the discovery hint');
}
{
 const f=fixture();f.advance(200);f.selection.isCollapsed=true;f.emit('selectionchange');f.advance(400);
 assert.equal(f.announcements.length,0,'A cleared selection cancels the pending hint');
 f.selection.isCollapsed=false;f.emit('selectionchange');f.advance(349);assert.equal(f.announcements.length,0);
 f.advance(1);assert.deepEqual(f.announcements,['formattingToolbarAvailable']);
}
{
 const f=fixture(); assert.equal(f.doc.activeElement,f.input);f.flush();assert.equal(f.announcements.length,1);
 assert.equal(f.popup.getAttribute('role'),'toolbar');
 assert.ok(f.key('F10',{altKey:true}).prevented);assert.equal(f.doc.activeElement,f.buttons[0]);
 f.buttons[1].disabled=true;f.key('ArrowRight');assert.equal(f.doc.activeElement,f.buttons[2]);
 f.key('End');assert.equal(f.doc.activeElement,f.buttons[6]);f.key('Home');assert.equal(f.doc.activeElement,f.buttons[0]);
 f.key('Escape');assert.equal(f.doc.activeElement,f.input);assert.equal(f.selection.anchorOffset,5);assert.equal(f.selection.focusOffset,1);assert.ok(f.popup.hasAttribute('hidden'));
 f.key('F10',{altKey:true});f.key('Enter');assert.equal(f.clicks(),1);assert.ok(f.key('Enter',{repeat:true}).prevented);assert.equal(f.clicks(),1);
 f.emit('keyup',{key:'Enter',preventDefault(){},stopImmediatePropagation(){}});assert.ok(!f.key('Enter').prevented);
 f.controller.stop();assert.equal(f.popup.getAttribute('role'),'menu');assert.equal(f.popup.getAttribute('hidden'),null);
}
{
 const f=fixture(); f.emit('selectionchange');f.buttons[0].focus();f.key('ArrowRight');assert.equal(f.doc.activeElement,f.buttons[1]);
 f.input.textContent='changed';assert.ok(f.key('Enter').prevented);assert.equal(f.clicks(),0);assert.equal(f.doc.activeElement,f.input);
 assert.ok(f.key('Enter',{repeat:true}).prevented);assert.equal(f.clicks(),0);
 assert.ok(!f.key('Enter',{repeat:false}).prevented);
}
{
 const f=fixture();f.key('F10',{altKey:true});const e=f.key('Tab');assert.ok(!e.prevented);assert.equal(f.doc.activeElement,f.input);
}
{
 const f=fixture();f.key('F10',{altKey:true});f.popup.isConnected=false;f.doc.activeElement=f.doc.body;f.controller.refresh();assert.equal(f.doc.activeElement,f.input);
}
console.log('Formatting toolbar regression tests passed.');
