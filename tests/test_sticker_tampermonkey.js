const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {buildSync}=require('esbuild');
const code=buildSync({entryPoints:['src/sticker-transport.js'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text;
function setup(gm=true){
 const calls=[];let aborts=0;
 const sandbox={module:{exports:{}},exports:{},URL,Date,Map,TextEncoder,TextDecoder,setTimeout,clearTimeout};
 if(gm)sandbox.GM_xmlhttpRequest=options=>{calls.push(options);return {abort(){aborts++;options.onabort();}};};
 vm.runInNewContext(code,sandbox);
 return {api:sandbox.module.exports,sandbox,calls,get aborts(){return aborts;}};
}
const create=()=>({version:1,id:'12345678-1234-4234-8234-123456789012',provider:'groq',endpoint:'https://api.groq.com/openai/v1/chat/completions',key:'synthetic-test-key',expiresAt:Date.now()+45000,body:{model:'qwen/qwen3.8-27b',tools:[{type:'unsafe'}],messages:[{role:'user',content:[{type:'text',text:'Describe'},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}]}});
const signal=()=>new AbortController();
const reply=async(call,status,text)=>{
 call.onload({status,responseText:text});
 await new Promise(setImmediate);
};
(async()=>{
 const t=setup(),a=signal(),r=create();let settled=0;
 const p=t.api.requestStickerTransport(r,a.signal).then(x=>{settled++;return x;});
 assert.equal(t.calls.length,1);const call=t.calls[0];
 assert.equal(call.anonymous,true);assert.equal(call.redirect,'error');assert.equal(call.responseType,'text');assert.equal(call.headers.Authorization,'Bearer synthetic-test-key');assert.ok(!call.data.includes('tools'));assert.equal(r.key,'');
 await reply(call,200,JSON.stringify({choices:[{message:{content:'A cat'}}]}));
 assert.equal((await p).body.choices[0].message.content,'A cat');call.onerror();assert.equal(settled,1);
 for(const status of [401,403,429,500]){const s=setup();const p=s.api.requestStickerTransport(create(),signal().signal);await reply(s.calls[0],status,'not JSON');assert.equal((await p).status,status);}
 for(const mutate of [r=>r.endpoint='https://elsewhere.example/v1/chat/completions',r=>r.expiresAt=0,r=>r.key='bad\nkey',r=>r.body.messages[0].content[1].image_url.url='https://private.example/image']){
  const s=setup(),r=create();mutate(r);await assert.rejects(s.api.requestStickerTransport(r,signal().signal),/stickerNetworkError/);assert.equal(s.calls.length,0);assert.equal(r.key,'');
 }
 const final=setup();const finalPromise=final.api.requestStickerTransport(create(),signal().signal);let finalDone=false;finalPromise.then(()=>finalDone=true);
 assert.equal(final.calls[0].onloadstart,undefined,'completion must not depend on stream EOF');
 final.calls[0].onprogress({status:0,loaded:12,responseText:'{"ok":true}'});await new Promise(setImmediate);assert.equal(finalDone,false,'partial progress must not announce a result');
 final.calls[0].onload({status:200,responseText:'{"ok":true}'});assert.equal((await finalPromise).body.ok,true);
 final.calls[0].onload({status:500,responseText:'{}'});assert.equal(final.aborts,0,'duplicate completion is ignored');
 const multibyte=setup();const mp=multibyte.api.requestStickerTransport(create(),signal().signal);const mr=assert.rejects(mp,/stickerResponseError/);multibyte.calls[0].onprogress({loaded:1,responseText:'é'.repeat(32769)});await mr;assert.equal(multibyte.aborts,1);await reply(multibyte.calls[0],200,'{}');
 for(const field of ['loaded','total']) {const s=setup();const p=s.api.requestStickerTransport(create(),signal().signal);const rejected=assert.rejects(p,/stickerResponseError/);s.calls[0].onprogress({[field]:65537});await rejected;assert.equal(s.aborts,1);}
 const fallback=setup();const fp=fallback.api.requestStickerTransport(create(),signal().signal);fallback.calls[0].onload({status:200,response:'{"ok":true}'});assert.equal((await fp).body.ok,true);
 const cancel=setup(),c=signal();const pending=cancel.api.requestStickerTransport(create(),c.signal);const rejected=assert.rejects(pending,/stickerTimeout/);c.abort();await rejected;assert.equal(cancel.aborts,1);await reply(cancel.calls[0],200,'{}');
 const large=setup();const lp=large.api.requestStickerTransport(create(),signal().signal);const lr=assert.rejects(lp,/stickerResponseError/);await reply(large.calls[0],200,'x'.repeat(65537));await lr;assert.equal(large.aborts,1);
 const exact=setup();const ep=exact.api.requestStickerTransport(create(),signal().signal);await reply(exact.calls[0],200,' '.repeat(65534)+'{}');assert.equal((await ep).status,200);
 const network=setup();const npError=network.api.requestStickerTransport(create(),signal().signal);const nrError=assert.rejects(npError,/stickerNetworkError/);network.calls[0].onerror();await nrError;await reply(network.calls[0],200,'{}');assert.equal(network.aborts,1);
 const timeout=setup(),tr=create();tr.expiresAt=Date.now()+20;await assert.rejects(timeout.api.requestStickerTransport(tr,signal().signal),/stickerTimeout/);assert.equal(timeout.aborts,1);
 const missing=setup(false);await assert.rejects(missing.api.requestStickerTransport(create(),signal().signal),/stickerTransportMissing/);
 const native=setup();native.api.installStickerTransport();native.sandbox.__waPlusStickerNative.poll();const nr=create();const np=native.api.requestStickerTransport(nr,signal().signal);const polled=native.sandbox.__waPlusStickerNative.poll();assert.equal(polled.request.id,nr.id);assert.equal(native.calls.length,0);native.sandbox.__waPlusStickerNative.resolve(nr.id,{result:{status:200,body:{ok:true}}});assert.equal((await np).body.ok,true);
 const nativeCancel=signal(),nc=create();const ncp=native.api.requestStickerTransport(nc,nativeCancel.signal);const ncr=assert.rejects(ncp,/stickerTimeout/);nativeCancel.abort();await ncr;assert.equal(native.sandbox.__waPlusStickerNative.poll().request,null);
 const meta=fs.readFileSync('src/metadata.txt','utf8');assert.match(meta,/@sandbox\s+raw/);assert.match(meta,/@grant\s+GM_xmlhttpRequest/);assert.doesNotMatch(meta,/@grant\s+none/);
 console.log('Tampermonkey and native sticker transport tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
