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
(async()=>{
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
 values.clear();
 const freshDb=new IDBFactory();
 const tab=()=>load('src/sticker-store.js',{'./settings-state.js':settings},{indexedDB:freshDb});
 const initialized=await Promise.allSettled([tab().saveStickerConfig(input),tab().saveStickerConfig({...input,key:'other-tab'})]);
 assert.ok(initialized.some(r=>r.status==='fulfilled'));
 const persisted=tab();assert.ok(['test-secret-123','other-tab'].includes(await persisted.decryptStickerCredential('gemini',persisted.getStickerConfig().providers.gemini)));
 console.log('Sticker credential and provider checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
