const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const { webcrypto } = require('node:crypto');
const { IDBFactory } = require('fake-indexeddb');
const values = new Map(), db = new IDBFactory();
function load(file, imports = {}) {
  const sandbox = {module:{exports:{}}, exports:{}, require:n=>imports[n], crypto:webcrypto,
    indexedDB:db, URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob, setTimeout, clearTimeout,
    AbortController, Event, navigator:{}, window:{dispatchEvent(){}}};
  vm.runInNewContext(transformSync(fs.readFileSync(file,'utf8'), {format:'cjs'}).code, sandbox);
  return sandbox.module.exports;
}
const store = load('src/sticker-store.js', {'./settings-state.js':{
  readSetting:(k,d)=>values.get(k)??d, writeSetting:(k,v)=>{values.set(k,v);return true;}
}});
const provider = load('src/sticker-provider.js', {'./sticker-store.js':store});
const { validateRequest } = load('src/sticker-request.js');
(async()=>{
  const accountId = 'a'.repeat(32), token = 'test-cf-token';
  await store.saveStickerConfig({provider:'cloudflare',accountId,key:token});
  const config = store.getStickerConfig();
  assert.equal(config.providers.cloudflare.accountId, accountId);
  assert.ok(!JSON.stringify([...values]).includes(token));
  assert.equal(await store.decryptStickerCredential('cloudflare', config.providers.cloudflare), token);
  assert.equal(store.hasStickerCredential('cloudflare', 'b'.repeat(32)), false);
  await assert.rejects(store.saveStickerConfig({provider:'cloudflare',accountId:'b'.repeat(32),key:''}), /stickerConfigureFirst/);
  assert.throws(()=>store.normalizeStickerEndpoint('cloudflare', 'not-an-account'), /stickerAccountRequired/);
  const request = provider.makeStickerRequest(config,token,{images:[{mime:'image/png',data:'AA=='}]},'id',webcrypto.randomUUID());
  assert.equal(validateRequest(request).hostname,'api.cloudflare.com');
  const agreement = {...request, purpose:'model-agreement', body:{prompt:'agree'}};
  assert.equal(validateRequest(agreement).hostname,'api.cloudflare.com');
  assert.throws(()=>validateRequest({...agreement,body:{prompt:'agree',image:'AA=='}}));
  assert.throws(()=>validateRequest({...agreement,body:{prompt:'no'}}));
  assert.throws(()=>validateRequest({...agreement,purpose:undefined}));
  assert.match(request.body.prompt,/Bahasa Indonesia/);
  assert.equal(request.body.image,'data:image/png;base64,AA==');
  assert.equal(request.body.max_tokens,512);
  assert.equal(request.body.stream,false);
  for(const endpoint of [request.endpoint.replace('api.cloudflare.com','evil.test'),request.endpoint+'?key=x',request.endpoint.replace(accountId,'../other')]) {
    assert.throws(()=>validateRequest({...request,endpoint}));
  }
  assert.throws(()=>validateRequest({...request,body:{prompt:'Describe',image:'https://example.test/a.png'}}));
  assert.equal(provider.parseStickerResponse('cloudflare',{status:200,body:{success:true,result:{response:'A smiling cup.'}}}),'A smiling cup.');
  assert.throws(()=>provider.parseStickerResponse('cloudflare',{status:403,body:{errors:[{code:5016}]}}),/stickerModelAgreement/);
  assert.throws(()=>provider.parseStickerResponse('cloudflare',{status:403,body:{errors:[{code:10000}]}}),/stickerAuthError/);
  assert.throws(()=>provider.parseStickerResponse('groq',{status:403,body:{errors:[{code:5016}]}}),/stickerAuthError/);
  for(const status of [401,403,429,500]) assert.throws(()=>provider.parseStickerResponse('cloudflare',{status}));
  assert.throws(()=>provider.parseStickerResponse('cloudflare',{status:200,body:{success:false,errors:[{message:token}]}}),/stickerResponseError/);
  const model='@cf/meta/llama-4-scout-17b-16e-instruct';
  await store.saveStickerConfig({provider:'cloudflare',accountId,model,key:''});
  const changed=store.getStickerConfig();
  assert.equal(changed.providers.cloudflare.model,model);
  assert.equal(await store.decryptStickerCredential('cloudflare',changed.providers.cloudflare),token);
  assert.equal(store.hasStickerCredential('cloudflare',accountId),true);
  const alternate=provider.makeStickerRequest(changed,token,{images:[{mime:'image/png',data:'AA=='}]},'en',webcrypto.randomUUID());
  assert.ok(alternate.endpoint.endsWith('/'+model));
  validateRequest(alternate);
  assert.equal(alternate.body.messages[0].content[1].image_url.url,'data:image/png;base64,AA==');
  assert.equal(alternate.body.max_tokens,512);
  assert.equal('model' in alternate.body,false);
  assert.throws(()=>validateRequest({...alternate,purpose:'model-agreement',body:{prompt:'agree'}}));
  for(const invalid of ['@cf/meta/../../evil','@cf/meta/model?token=x','@cf/meta/%2e%2e','https://evil.test/model','@cf/meta/']) {
    await assert.rejects(store.saveStickerConfig({provider:'cloudflare',accountId,model:invalid,key:''}),/stickerInvalidConfig/);
    assert.throws(()=>validateRequest({...alternate,endpoint:alternate.endpoint.replace(model,invalid)}));
  }
  assert.equal(provider.parseStickerResponse('cloudflare',{status:200,body:{result:{choices:[{message:{content:'A cup.'}}]}}}),'A cup.');
  console.log('Cloudflare credential, request and response tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
