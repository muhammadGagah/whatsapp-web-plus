const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const {webcrypto}=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
const values=new Map();let failWrite=false;
const db=new IDBFactory();
function load(file,imports={},extra={}){
 const sandbox={exports:{},module:{exports:{}},require:name=>imports[name],crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,DataView,URL,btoa,atob,setTimeout,clearTimeout,AbortController,Event,navigator:{},window:{dispatchEvent(){}},indexedDB:db,...extra};
 vm.runInNewContext(transformSync(fs.readFileSync(file,'utf8'),{format:'cjs'}).code,sandbox);return sandbox.module.exports;
}
const settings={readSetting:(k,d)=>values.get(k)??d,writeSetting:(k,v)=>{if(failWrite)return false;values.set(k,v);return true;}};
const create=()=>load('src/sticker-store.js',{'./settings-state.js':settings});
{
 const {parseHTML}=require('linkedom');
 const {document}=parseHTML('<html><body></body></html>');
 const media=load('src/sticker-media.js',{}, {XMLSerializer:class {serializeToString(node){return node.outerHTML;}}});
 const holder=document.createElement('div');
 holder.innerHTML='<svg viewBox="0 0 512 512"><defs><filter id="alpha" filterUnits="objectBoundingBox" x="0%" y="0%" width="100%" height="100%"><feComponentTransfer in="SourceGraphic"><feFuncA type="table" tableValues="1.0 0.0"/></feComponentTransfer></filter></defs><g filter="url(#alpha)"><rect width="10" height="10"/></g></svg>';
 const svg=holder.firstElementChild;
 const snapshot=media.snapshotStickerSvg(svg);
 assert.equal(snapshot.width,512);
 assert.match(snapshot.source,/tableValues="1.0 0.0"/);
 assert.match(snapshot.source,/url\(#alpha\)/);
 for(const markup of ['<feImage href="https://example.invalid/image.png"/>','<image href="https://example.invalid/image.png"/>','<foreignObject/>']){
  const unsafe=svg.cloneNode(true);unsafe.innerHTML+=markup;
  assert.throws(()=>media.snapshotStickerSvg(unsafe),/stickerMediaError/);
 }
 const external=svg.cloneNode(true);external.querySelector('g').setAttribute('filter','url(https://example.invalid/filter.svg#alpha)');
 assert.throws(()=>media.snapshotStickerSvg(external),/stickerMediaError/);
}
{
 const drawn=[],labels=[];
 const board={width:0,height:0,toDataURL:()=> 'data:image/png;base64,YQ==',getContext:()=>({fillRect(){},drawImage(...args){drawn.push(args);},fillText(text){labels.push(text);}})};
 const media=load('src/sticker-media.js',{}, {document:{createElement:()=>board}});
 const frame=()=>({canvas:{width:128,height:128}});
 const input=media.encodeStickerGroup([{frames:[frame()],animated:false,mode:'frames'},{frames:[frame(),frame()],animated:true,mode:'frames'}]);
 assert.equal(input.stickerCount,2);assert.equal(input.images.length,1);
 assert.deepEqual(labels,['1','2']);assert.equal(drawn.length,3);assert.equal(board.width,0);
 const provider=load('src/sticker-provider.js',{'./sticker-store.js':{normalizeStickerEndpoint:()=> 'https://example.invalid'}});
 const request=provider.makeStickerRequest({provider:'gemini',providers:{gemini:{model:'test'}}},'test',input,'en','id');
 assert.match(request.body.contents[0].parts[0].text,/Sticker 2/);
 assert.doesNotMatch(request.body.contents[0].parts[0].text,/ONE proven animated sticker/);
 assert.throws(()=>provider.parseStickerResponse('gemini',{status:200,body:{candidates:[{finishReason:'MAX_TOKENS'}]}}),/stickerResponseError/);
 assert.equal(provider.parseStickerResponse('gemini',{status:200,body:{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'A cat holding'}]}}]}}),'A cat holding…','truncated text is kept and marked');
 assert.equal(provider.parseStickerResponse('groq',{status:200,body:{choices:[{finish_reason:'length',message:{content:'A dog'}}]}}),'A dog…');
 assert.throws(()=>provider.parseStickerResponse('groq',{status:200,body:{choices:[{finish_reason:'length',message:{content:'<think>unfinished'}}]}}),/stickerResponseError/);
}
{
 // Multi-sticker parsing tolerates light Markdown and list markers but keeps real numbers.
 const source=fs.readFileSync('src/read-sticker.js','utf8');
 const start=source.indexOf('export function formatStickerResult(');
 const sandbox={t:(key,values)=>key==='stickerNumberedPrefix'?`Sticker ${values.number}:`:key==='stickerDescriptionMissing'?'missing':''};
 vm.runInNewContext(source.slice(start,source.indexOf('\n}\n',start)+3).replace('export ',''),sandbox);
 const format=text=>sandbox.formatStickerResult(text,{},[1,1]).split('\n\n').map(entry=>entry.split('\n')[1]);
 assert.deepEqual(format('Sticker 1: Cup. Sticker 2: Cat.'),['Cup.','Cat.']);
 assert.deepEqual(format('**Sticker 1:** Cup. **Sticker 2:** Cat.'),['Cup.','Cat.']);
 assert.deepEqual(format('**Stiker 1**: Cangkir. **Stiker 2**: Kucing.'),['Cangkir.','Kucing.']);
 assert.deepEqual(format('1. Sticker 1: Cup. 2. Sticker 2: Cat.'),['Cup.','Cat.']);
 assert.deepEqual(format('- Sticker 1 (animated): Cup waving. - Sticker 2: Cat.'),['Cup waving.','Cat.']);
 assert.deepEqual(format('Sticker 1: Cat holding 2. Sticker 2: Dog.'),['Cat holding 2.','Dog.'],'real numbers survive');
 assert.deepEqual(format('1. Sticker 1: a cat 2. Sticker 2: a sign reading Top 10.'),['a cat','a sign reading Top 10.'],'the last description keeps its trailing number');
 assert.deepEqual(format('1. Sticker 1: count 3, 2, 1. 2. Sticker 2: Go.'),['count 3, 2, 1.','Go.'],'only the next list number is a marker');
 assert.throws(()=>format('Sticker 1 shows a cat: Cup. Sticker 2: Cat.'),/stickerResponseError/,'free text is not a qualifier');
 assert.throws(()=>format('Here you go. Sticker 1: Cup. Sticker 2: Cat.'),/stickerResponseError/);
 assert.deepEqual(format('**1.** **Sticker 1:** A cat. **2.** **Sticker 2:** A dog.'),['A cat.','A dog.'],'bold list numbers are not spoken');
 assert.deepEqual(format('1. Sticker 1: Shirt with number 2. Sticker 2: Dog.'),['Shirt with number','Dog.'],'a list numbered 1., 2. is a list');
 assert.deepEqual(format('Sticker 1: Shirt with number 2. Sticker 2: Dog.'),['Shirt with number 2.','Dog.'],'without a numbered list the number stays');
 {
  // A reply cut off by the length limit keeps the stickers it did describe.
  const partial=sandbox.formatStickerResult('Sticker 1: A cat. Sticker 2: A dog wav…',{},[1,1,1]).split('\n\n').map(entry=>entry.split('\n')[1]);
  assert.deepEqual(partial,['A cat.','A dog wav…','missing']);
  const ellipsisOnly=sandbox.formatStickerResult('Sticker 1: A cat. Sticker 2:…',{},[1,1]).split('\n\n').map(entry=>entry.split('\n')[1]);
  assert.deepEqual(ellipsisOnly,['A cat.','missing'],'a description that is only the cut-off mark is missing');
  assert.throws(()=>format('Sticker 1: A cat.'),/stickerResponseError/,'a complete reply must describe every sticker');
 }
 assert.throws(()=>format('Sticker 1: Cup.'),/stickerResponseError/);
 assert.throws(()=>format('Sticker 2: Cup. Sticker 1: Cat.'),/stickerResponseError/);
}
(async()=>{
 {
  const canvases=[];
  let rejectDecode, closed=0;
  const pending=new Promise((resolve,reject)=>{rejectDecode=reject;});
  class Decoder {
   static async isTypeSupported(){return true;}
   constructor(){this.tracks={ready:Promise.resolve(),selectedTrack:{frameCount:2,animated:true}};}
   decode({frameIndex}){return frameIndex===0?Promise.resolve({image:{duration:1,close(){}}}):pending;}
   close(){closed++;}
  }
  const media=load('src/sticker-media.js',{}, {ImageDecoder:Decoder,document:{createElement(){
   const canvas={width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:[0,0,0,255]})})};
   canvases.push(canvas);return canvas;
  }}});
  const bytes=new Uint8Array(24);bytes.set([137,80,78,71]);new DataView(bytes.buffer).setUint32(16,1);new DataView(bytes.buffer).setUint32(20,1);
  const controller=new AbortController();
  const decode=media.decodeSticker(bytes,controller.signal);
  await new Promise(setImmediate);
  assert.equal(canvases.length,1);
  controller.abort();
  assert.equal(canvases[0].width,0,'abort releases sampled decoder frames before pending decode settles');
  assert.ok(closed>0);
  const rejected=assert.rejects(decode,/cancelled/);rejectDecode(new Error('cancelled'));await rejected;
 }
 let store=create();assert.equal(store.isReadStickerEnabled(),false);
 const input={provider:'gemini',model:'ignored',key:'test-secret-123'};
 await store.saveStickerConfig(input);
 const first=store.getStickerConfig().providers.gemini.credential;
 assert.ok(!JSON.stringify([...values]).includes(input.key));
 assert.equal(await store.decryptStickerCredential('gemini',store.getStickerConfig().providers.gemini),input.key);
 store=create();assert.equal(await store.decryptStickerCredential('gemini',store.getStickerConfig().providers.gemini),input.key,'reload reuses persisted key');
 await store.saveStickerConfig({...input,key:''});
 assert.equal(store.getStickerConfig().providers.gemini.credential.ciphertext,first.ciphertext);
 await store.saveStickerConfig(input);
 assert.notEqual(store.getStickerConfig().providers.gemini.credential.iv,first.iv);
 for(const field of ['iv','ciphertext','provider','endpoint','keyId','version']){
  const p=store.getStickerConfig().providers.gemini;p.credential={...p.credential};p.credential[field]=field==='version'?2:'tampered';
  await assert.rejects(store.decryptStickerCredential('gemini',p),/stickerKeyUnreadable/);
 }
 const open=await new Promise((res,rej)=>{const r=db.open('wa-plus-sticker-keys',1);r.onsuccess=()=>res(r.result);r.onerror=rej;});
 const record=await new Promise(res=>{const r=open.transaction('keys').objectStore('keys').get('active');r.onsuccess=()=>res(r.result);});
 assert.equal(record.key.extractable,false);await assert.rejects(webcrypto.subtle.exportKey('raw',record.key));open.close();
 await store.saveStickerConfig({provider:'groq',model:'qwen/qwen3.8-27b',key:'groq-test-secret'});
 const before=values.get(store.STICKER_STORAGE);failWrite=true;
 await assert.rejects(store.saveStickerConfig({...input,key:'replacement'}),/stickerStorageError/);
 await assert.rejects(store.deleteStickerCredential('groq'),/stickerStorageError/);
 assert.equal(values.get(store.STICKER_STORAGE),before);failWrite=false;
 await store.deleteStickerCredential('groq');assert.equal(store.hasStickerCredential('groq'),false);assert.equal(store.hasStickerCredential('gemini'),true);
 const corrupt=create();const p=corrupt.getStickerConfig().providers.gemini;
 const opened=await new Promise(res=>{const r=db.open('wa-plus-sticker-keys');r.onsuccess=()=>res(r.result);});
 await new Promise(res=>{const tx=opened.transaction('keys','readwrite');tx.objectStore('keys').delete(p.credential.keyId);tx.oncomplete=res;});opened.close();
 await assert.rejects(corrupt.decryptStickerCredential('gemini',p),/stickerKeyUnreadable/);
 assert.ok(corrupt.hasStickerCredential('gemini'),'ciphertext retained after missing key');
 await corrupt.saveStickerConfig({...input,key:'recovered-key'});
 assert.equal(await corrupt.decryptStickerCredential('gemini',corrupt.getStickerConfig().providers.gemini),'recovered-key');
 const race=await Promise.allSettled([create().saveStickerConfig({...input,key:'race-a'}),create().saveStickerConfig({...input,key:'race-b'})]);
 assert.ok(race.some(r=>r.status==='fulfilled'));
 assert.match(await create().decryptStickerCredential('gemini',create().getStickerConfig().providers.gemini),/^race-[ab]$/);

 const unavailable=load('src/sticker-store.js',{'./settings-state.js':settings},{indexedDB:null});
 await assert.rejects(unavailable.saveStickerConfig(input),/stickerStorageError/);
 const provider=load('src/sticker-provider.js',{'./sticker-store.js':store});
 const config=store.getStickerConfig();config.provider='gemini';
 const payload=provider.makeStickerRequest(config,'secret',{images:[{mime:'image/png',data:'AA=='}],animated:false},'id','id');
 assert.equal(payload.endpoint.includes('key='),false);assert.ok(payload.endpoint.includes('gemini-3.5-flash-lite'));
 assert.equal(provider.parseStickerResponse('gemini',{status:200,body:{candidates:[{content:{parts:[{thought:true,text:'private reasoning'},{text:'A cat'}]}}]}}),'A cat');
 for(const [status,error] of [[401,'Auth'],[403,'Auth'],[429,'Quota'],[404,'Model'],[500,'Network']])assert.throws(()=>provider.parseStickerResponse('groq',{status,body:{}}),new RegExp(error));
 assert.throws(()=>provider.parseStickerResponse('groq',{status:200,body:{choices:[{message:{refusal:'no'}}]}}),/Refused/);
 assert.throws(()=>provider.parseStickerResponse('gemini',{status:200,body:{}}),/Response/);
 for(const parts of [null,{},'bad',[null]])assert.throws(()=>provider.parseStickerResponse('gemini',{status:200,body:{candidates:[{content:{parts}}]}}),/stickerResponseError/);
 assert.equal(provider.parseStickerResponse('gemini',{status:200,body:{candidates:[{content:{parts:[null,{text:'A cat'}]}}]}}),'A cat');
 for(const content of ['<THINK>Unfinished private reasoning','<Think>Unfinished','<think class="reasoning">Unfinished'])assert.throws(()=>provider.parseStickerResponse('custom',{status:200,body:{choices:[{message:{content}}]}}),/stickerResponseError/);
 assert.equal(provider.parseStickerResponse('custom',{status:200,body:{choices:[{message:{content:'<THINK>Private reasoning</THINK>A cat'}}]}}),'A cat');
 values.clear();
 const freshDb=new IDBFactory();
 const tab=()=>load('src/sticker-store.js',{'./settings-state.js':settings},{indexedDB:freshDb});
 const initialized=await Promise.allSettled([tab().saveStickerConfig(input),tab().saveStickerConfig({...input,key:'other-tab'})]);
 assert.ok(initialized.some(r=>r.status==='fulfilled'));
 const persisted=tab();assert.ok(['test-secret-123','other-tab'].includes(await persisted.decryptStickerCredential('gemini',persisted.getStickerConfig().providers.gemini)));
 console.log('Sticker credential and provider checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
