import { requestTampermonkeySticker } from './sticker-tampermonkey.js';
import { validateRequest } from './sticker-request.js';
import { isCompanionRuntime } from './companion-bridge.js';
let nativePending=null;
let nativePolled=false;
// How long Companion may be late before a stopped add-on is reported as a missing transport.
const NATIVE_LATE_POLL_MS=15000;
const responses=new Map();
let nativeReadyUntil=0;
export function installStickerTransport() {
  if(globalThis.__waPlusStickerNative)return;
  // Dedicated transient transport; never part of the speech or debug bridge.
  Object.defineProperty(globalThis,'__waPlusStickerNative',{value:Object.freeze({
    version:1,
    poll(){nativePolled=true;nativeReadyUntil=Date.now()+3000;const request=nativePending;nativePending=null;return {version:1,request,activeId:responses.keys().next().value||null};},
    resolve(id,result){const callback=responses.get(id);if(callback)callback(result);}
  }),configurable:true});
}
// Leave headroom for the CDP envelope within Companion's existing 1 MiB frame cap.
export const NATIVE_REQUEST_LIMIT=768*1024;
export function usesNativeStickerTransport(){
  // Companion has no GM_xmlhttpRequest. Once it has polled, keep the native path while its loop is
  // briefly delayed (reconnect or a busy machine); request.expiresAt still bounds the wait.
  return Date.now()<nativeReadyUntil ||
    (nativePolled && isCompanionRuntime() && Date.now()<nativeReadyUntil+NATIVE_LATE_POLL_MS);
}
export function requestStickerTransport(request,signal){
  if(!usesNativeStickerTransport())return requestTampermonkeySticker(request,signal);
  return new Promise((resolve,reject)=>{
    let settled=false,timer,registered=false;
    const finish=(value,error)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      if(registered)responses.delete(request.id);
      signal.removeEventListener('abort',abort);
      if(registered && nativePending?.id===request.id)nativePending=null;
      request.key='';error?reject(new Error(error)):resolve(value);
    };
    const abort=()=>finish(null,'stickerTimeout');
    try{
      signal.throwIfAborted();
      validateRequest(request);
      // Companion accepts one request at a time. Do not replace an unpolled request.
      if(responses.size){finish(null,'stickerBusy');return;}
      signal.addEventListener('abort',abort,{once:true});
      if(new TextEncoder().encode(JSON.stringify(request)).length>NATIVE_REQUEST_LIMIT){finish(null,'stickerTooLarge');return;}
      timer=setTimeout(abort,Math.max(1,request.expiresAt-Date.now()));
      responses.set(request.id,result=>{
        if(!result || typeof result!=='object'){finish(null,'stickerResponseError');return;}
        finish(result.result,result.error);
      });
      registered=true;nativePending=request;
    }catch{finish(null,signal.aborted?'stickerTimeout':'stickerNetworkError');}
  });
}
