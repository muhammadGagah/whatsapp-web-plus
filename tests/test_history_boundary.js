const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');
const source = fs.readFileSync('src/chat-accessibility.js', 'utf8');
function fixture() {
 const {document} = parseHTML('<html><body><main><section><div data-id="one"><div class="focusable-list-item"></div></div><div data-id="two"><div class="focusable-list-item"></div></div></section></main></body></html>');
 const cells = [...document.querySelectorAll('.focusable-list-item')], panel = document.querySelector('section');
 let active = cells[0], now = 1000, chat = 'chat1', modal = null, scrolls = 0;
 const timers = [];
 Object.defineProperty(document, 'activeElement', {get:()=>active});
 panel.scrollTop = 481;
 Object.defineProperty(panel, 'clientHeight', {value:384});
 panel.scrollTo = options => {assert.equal(options.top,0);assert.equal(options.behavior,'instant');scrolls++;panel.scrollTop=0;};
 const context = vm.createContext({document, Date:{now:()=>now}, WeakMap,
  SELECTORS:{main:'main',conversationMessages:'section'},
  isPrimaryMessageItem:cell=>!!cell?.matches?.('.focusable-list-item'),
  getActiveModal:()=>modal, getChatContextKey:()=>chat,
  handleChatListShortcutArrowKeydown:()=>false, syncingNativeChatSelection:false, pointerFocusPending:false,
  setTimeout:(callback,delay)=>{assert.equal(delay,80);timers.push(callback);}
 });
 vm.runInContext(source.slice(source.indexOf('let pendingHistoryBoundary ='),source.indexOf('export function getVirtualizedMessageCell')).replace('export ',''),context);
 return {cells,panel,document,timers,get scrolls(){return scrolls;},
  key(key='ArrowUp',extra={}){return context.handleMessageGridKeydown({key,target:active,preventDefault(){throw Error('must keep native key');},stopPropagation(){throw Error('must keep native key');},...extra});},
  flush(){timers.splice(0).forEach(fn=>fn());},focus(cell){active=cell;},tick(){now+=700;},chat(){chat='chat2';},modal(){modal={};}};
}
{
 const f=fixture();assert.equal(f.key(),false);assert.equal(f.timers.length,1);
 for(let i=0;i<50;i++)f.key('ArrowUp',{repeat:true});
 assert.equal(f.timers.length,1,'holding Up cannot queue more work');
 f.flush();assert.equal(f.scrolls,1);assert.equal(f.document.activeElement,f.cells[0]);
 f.panel.scrollTop=300;f.key();assert.equal(f.timers.length,0,'cooldown prevents repeated loading');
 f.tick();f.key();f.flush();assert.equal(f.scrolls,2);
}
for(const action of [f=>f.focus(f.cells[1]),f=>f.chat(),f=>f.modal(),f=>f.cells[0].remove(),f=>f.cells[1].parentElement.appendChild(f.cells[0]),f=>f.key('ArrowDown'),f=>f.panel.prepend(f.cells[1].cloneNode(true)),f=>f.cells[0].closest('[data-id]').setAttribute('data-id','recycled')]){
 const f=fixture();f.key();action(f);f.flush();assert.equal(f.scrolls,0,'stale request must not scroll');
}
for(const setup of [f=>f.focus(f.cells[1]),f=>{f.panel.scrollTop=0;},f=>f.modal()]){
 const f=fixture();setup(f);f.key();assert.equal(f.timers.length,0);
}
for(const extra of [{ctrlKey:true},{altKey:true},{shiftKey:true},{isComposing:true},{repeat:true},{defaultPrevented:true}]){
 const f=fixture();f.key('ArrowUp',extra);assert.equal(f.timers.length,0);
}
{
 const f=fixture();f.panel.scrollTop=10000;let top;f.panel.scrollTo=options=>{top=options.top;};
 f.key();f.flush();assert.equal(top,9232,'scrolling is limited to two viewport heights');
}
// Nested and column-reverse viewports scroll the real viewport toward older messages.
for(const reversed of [false,true]){
 const timers=[],tops=[];
 const main={},identity={getAttribute:()=> 'one'};
 const viewport={scrollHeight:2000,clientHeight:400,scrollTop:reversed?-1000:1000,isConnected:true,parentElement:main,
  style:{overflowY:'auto',flexDirection:reversed?'column-reverse':'column'},scrollTo:options=>tops.push(options.top)};
 const panel={scrollHeight:2000,clientHeight:2000,scrollTop:0,isConnected:true,parentElement:viewport,style:{},
  querySelector:()=>cell,scrollTo(){throw Error('the inner list does not scroll');}};
 const cell={isConnected:true,closest:selector=>selector==='section'?panel:selector==='main'?main:selector==='[data-id]'?identity:null};
 const context=vm.createContext({document:{activeElement:cell,querySelector:selector=>selector==='main'?main:selector==='section'?panel:null},
  Date,WeakMap,SELECTORS:{main:'main',conversationMessages:'section'},isPrimaryMessageItem:item=>item===cell,
  getActiveModal:()=>null,getChatContextKey:()=> 'chat1',handleChatListShortcutArrowKeydown:()=>false,syncingNativeChatSelection:false,pointerFocusPending:false,
  getComputedStyle:node=>node.style,setTimeout:callback=>timers.push(callback)});
 vm.runInContext(source.slice(source.indexOf('let pendingHistoryBoundary ='),source.indexOf('export function getVirtualizedMessageCell')).replace('export ',''),context);
 viewport.scrollTop=reversed?-1600:0;
 context.handleMessageGridKeydown({key:'ArrowUp',target:cell});
 assert.equal(timers.length,0,'the oldest loaded edge needs no help');
 viewport.scrollTop=reversed?-1000:1000;
 context.handleMessageGridKeydown({key:'ArrowUp',target:cell});
 timers.splice(0).forEach(fn=>fn());
 assert.deepEqual(tops,[reversed?-1600:200],`reversed=${reversed} scrolls the outer viewport toward older history`);
}
console.log('History boundary loading checks passed.');
