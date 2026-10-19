import { openStickerAgreement } from './sticker-agreement.js';
import { SELECTORS } from './config.js';
import { getFocusedPrimaryMessageItem, isPrimaryMessageItem, announce } from './chat-accessibility.js';
import { getChatContextKey } from './chat-context.js';
import { getLanguage, t } from './settings-state.js';
import { isReadStickerEnabled, getStickerConfig, decryptStickerCredential, STICKER_CHANGED, STICKER_STORAGE, STICKER_ENABLED } from './sticker-store.js';
import { readBoundedBody, decodeSticker, decodeStickerSvg, encodeStickerInput, STICKER_LIMITS } from './sticker-media.js';
import { makeStickerRequest, parseStickerResponse } from './sticker-provider.js';
import { installStickerTransport, requestStickerTransport } from './sticker-transport.js';

let operation=null,observer=null,epoch=0,lastChat='';
function currentChat(){
  const main=document.querySelector(SELECTORS.main);
  const key=getChatContextKey(main);
  return key;
}
function cancel(){epoch++;operation?.controller.abort();operation=null;}
export function refreshStickerContext(mutations=[]) {
  const chat=currentChat();
  if(chat!==lastChat){cancel();lastChat=chat;}
  if(!operation)return;
  // Detect intermediate chat identities even if A -> B -> A is batched.
  for(const mutation of mutations){
    const main=document.querySelector(SELECTORS.main);
    // Without a public chat ID, track identity-bearing nodes, not live status text.
    if(operation.chat.startsWith('dom:')) {
      const changed=[...(mutation.addedNodes||[]),...(mutation.removedNodes||[])];
      if(operation.title?.contains(mutation.target) || changed.some(node=>
        [operation.title,operation.header,operation.container,operation.main].some(boundary=>
          boundary && (node===boundary || node.contains?.(boundary))))) { cancel();break; }
    }
    const replacedMains=[...(mutation.addedNodes||[]),...(mutation.removedNodes||[])].flatMap(node=>
      node.matches?.(SELECTORS.main)?[node]:Array.from(node.querySelectorAll?.(SELECTORS.main)||[]));
    if(replacedMains.some(node=>getChatContextKey(node)!==operation.chat)){cancel();break;}
    if(!main?.contains(mutation.target))continue;
    if(mutation.attributeName==='data-chat-id' && mutation.oldValue && `chat:${mutation.oldValue}`!==operation.chat){cancel();break;}
    const nodes=[...(mutation.addedNodes||[]),...(mutation.removedNodes||[])];
    const values=mutation.attributeName==='data-chat-id'
      ? [`false_${mutation.oldValue||''}_context`] : [mutation.oldValue||''];
    for(const node of nodes){values.push(node.getAttribute?.('data-id')||'');for(const item of node.querySelectorAll?.('[data-id]')||[])values.push(item.getAttribute('data-id'));}
    if(values.some(value=>{const jid=/^(?:true|false)_([^_]+@[^_]+)_/.exec(value)?.[1];return jid&&`chat:${jid}`!==operation.chat;})){cancel();break;}
  }
}
export function startReadSticker(){
  if(observer)return;
  installStickerTransport();lastChat=currentChat();
  observer=new MutationObserver(refreshStickerContext);
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true,attributeFilter:['data-chat-id','data-id','aria-label','title']});
  window.addEventListener(STICKER_CHANGED,cancel);
  window.addEventListener('wa-plus-language-changed',cancel);
  window.addEventListener('storage',event=>{if(!event.key||[STICKER_STORAGE,STICKER_ENABLED,'wa-plus-language'].includes(event.key))cancel();});
  window.addEventListener('pagehide',cancel);
}
export function resolveStickerTarget(event){
  let item=getFocusedPrimaryMessageItem(event),focusedStickerButton=null;
  if(!item && event.target===document.activeElement) {
    const button=event.target;
    const sticker=button?.closest?.('[data-testid="sticker-container"]');
    const owner=button?.closest?.('.focusable-list-item');
    if(button?.matches?.('button, [role="button"]') && !button.hasAttribute('aria-haspopup') && button.getAttribute('aria-disabled')!=='true' && sticker && owner?.contains(sticker) &&
      !button.closest('[data-testid="quoted-message"]') && isPrimaryMessageItem(owner)){item=owner;focusedStickerButton=button;}
  }
  if(!item || !item.closest(SELECTORS.conversationMessages))return null;
  const candidates=Array.from(item.querySelectorAll('[data-testid="sticker-container"] img, [data-testid="sticker-container"] [data-testid="lottie-animated-emoji-container"] svg')).filter(img=>
    img.closest('.focusable-list-item')===item && !img.closest('[data-testid="quoted-message"]'));
  if(candidates.length!==1)return null;
  const img=candidates[0],svg=img.localName==='svg',src=svg?'svg-snapshot':img.currentSrc||img.src;
  if(focusedStickerButton && img.closest('button, [role="button"]')!==focusedStickerButton)return null;
  const wrapper=item.closest('[data-id]');
  const id=wrapper?.getAttribute('data-id');
  if(!id||!src||(!svg&&(!img.complete||!img.naturalWidth)))return null;
  // The observed sticker bytes are a page-decoded blob, never WhatsApp's encrypted download URL.
  if(!svg&&!src.startsWith(`blob:${location.origin}/`))return null;
  return {item,img,src,id,wrapper,svg};
}
function valid(op){
  refreshStickerContext();
  return operation===op && !op.controller.signal.aborted && op.epoch===epoch && isReadStickerEnabled() &&
    op.chat===currentChat() && op.language===getLanguage() && op.configFingerprint===JSON.stringify(getStickerConfig());
}
export function handleReadStickerShortcut(event){
  if(!document.querySelector(SELECTORS.main))return false;
  event.preventDefault();event.stopImmediatePropagation();
  if(!isReadStickerEnabled()){announce(t('stickerDisabled'));return true;}
  const config=getStickerConfig();
  if(!config.providers[config.provider]?.credential){announce(t('stickerConfigureFirst'));return true;}
  const target=resolveStickerTarget(event),chat=currentChat();
  if(!target||!chat){announce(t('stickerTarget'));return true;}
  refreshStickerContext();
  if(operation && !operation.done && operation.target.id===target.id && operation.target.src===target.src)return true;
  cancel();
  const main=document.querySelector(SELECTORS.main);
  const header=main?.querySelector('header');
  const title=header?.querySelector('[data-testid="conversation-info-header-chat-title"]');
  const op={id:crypto.randomUUID(),target,chat,main,header,title,container:main?.querySelector(SELECTORS.conversationMessages),epoch,config,configFingerprint:JSON.stringify(config),language:getLanguage(),controller:new AbortController(),done:false,announced:false};
  operation=op;
  announce(t('stickerReading'),()=>valid(op));
  void execute(op);
  return true;
}
async function execute(op){
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;op.controller.abort();},45000);
  let key='',request;
  try{
    const signal=op.controller.signal;
    key=await decryptStickerCredential(op.config.provider,op.config.providers[op.config.provider]);
    signal.throwIfAborted();if(!valid(op))return;
    let media;
    if(op.target.svg){
      if(!op.target.img.isConnected || op.target.wrapper.getAttribute('data-id')!==op.target.id)throw new Error('stickerMediaError');
      media=await decodeStickerSvg(op.target.img,signal);
    }else{
      const response=await fetch(op.target.src,{signal,credentials:'omit',redirect:'error'});
      const bytes=await readBoundedBody(response,STICKER_LIMITS.sourceBytes,signal);
      if(!op.target.img.isConnected || op.target.wrapper.getAttribute('data-id')!==op.target.id || (op.target.img.currentSrc||op.target.img.src)!==op.target.src)throw new Error('stickerMediaError');
      media=await decodeSticker(bytes,signal);
    }
    const input=encodeStickerInput(media,op.config.provider,op.config.providers[op.config.provider].model);
    signal.throwIfAborted();if(!valid(op))return;
    request=makeStickerRequest(op.config,key,input,op.language,op.id);key='';
    const result=await requestStickerTransport(request,signal);
    const text=parseStickerResponse(op.config.provider,result);
    if(!valid(op))return;
    op.done=true;
    const prefix=t(input.animated?'stickerAnimatedPrefix':'stickerStaticPrefix');
    const limitation=input.unclear?t('stickerMotionUnclear'):'';
    announce(t('stickerResult',{text:prefix+limitation+text}),()=>{
      if(!valid(op)||op.announced)return false;op.announced=true;return true;
    });
  }catch(error){
    if(operation!==op || (!timedOut&&op.controller.signal.aborted) || op.language!==getLanguage() || currentChat()!==op.chat)return;
    op.done=true;
    const allowed=['stickerKeyUnreadable','stickerMediaError','stickerAnimationError','stickerTooLarge','stickerAuthError','stickerModelAgreement','stickerQuotaError','stickerModelError','stickerTimeout','stickerNetworkError','stickerResponseError','stickerRefused','stickerTransportMissing'];
    const message=timedOut?'stickerTimeout':allowed.includes(error.message)?error.message:'stickerNetworkError';
    if(message==='stickerModelAgreement' && valid(op) && openStickerAgreement(op.config, document.activeElement))return;
    announce(t(message),()=>operation===op && isReadStickerEnabled() && currentChat()===op.chat && op.language===getLanguage());
  }finally{clearTimeout(timer);key='';if(request)request.key='';}
}
