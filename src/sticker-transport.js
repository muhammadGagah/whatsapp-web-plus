import { requestTampermonkeySticker } from './sticker-tampermonkey.js';
let nativePending=null;
const responses=new Map();
let nativeReadyUntil=0;
export function installStickerTransport() {
  if(globalThis.__waPlusStickerNative)return;
  // Dedicated transient transport; never part of the speech or debug bridge.
  Object.defineProperty(globalThis,'__waPlusStickerNative',{value:Object.freeze({
    version:1,
    poll(){nativeReadyUntil=Date.now()+3000;const request=nativePending;nativePending=null;return {version:1,request,activeId:responses.keys().next().value||null};},
    resolve(id,result){const callback=responses.get(id);if(callback)callback(result);}
  }),configurable:true});
}
export function requestStickerTransport(request,signal){
  if(Date.now()>=nativeReadyUntil)return requestTampermonkeySticker(request,signal);
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    let settled=false;
    const finish=(value,error)=>{
      if(settled)return;
      settled=true;responses.delete(request.id);signal.removeEventListener('abort',abort);
      if(nativePending?.id===request.id)nativePending=null;
      request.key='';error?reject(new Error(error)):resolve(value);
    };
    const abort=()=>finish(null,'stickerTimeout');
    signal.addEventListener('abort',abort,{once:true});
    // Leave headroom for the CDP envelope within Companion's existing 1 MiB frame cap.
    if(new TextEncoder().encode(JSON.stringify(request)).length>768*1024){finish(null,'stickerTooLarge');return;}
    responses.set(request.id,result=>finish(result.result,result.error));nativePending=request;
  });
}
