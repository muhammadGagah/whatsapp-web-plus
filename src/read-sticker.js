import { openStickerAgreement } from './sticker-agreement.js';
import { SELECTORS } from './config.js';
import { getFocusedPrimaryMessageItem, isPrimaryMessageItem, announce } from './chat-accessibility.js';
import { getChatContextKey } from './chat-context.js';
import { getLanguage, t } from './settings-state.js';
import { isReadStickerEnabled, getStickerConfig, decryptStickerCredential, STICKER_CHANGED, STICKER_STORAGE, STICKER_ENABLED } from './sticker-store.js';
import { readBoundedBody, decodeSticker, decodeStickerSvg, snapshotStickerSvg, encodeStickerInput, encodeStickerGroup, STICKER_LIMITS } from './sticker-media.js';
import { makeStickerRequest, parseStickerResponse } from './sticker-provider.js';
import { installStickerTransport, NATIVE_REQUEST_LIMIT, requestStickerTransport, usesNativeStickerTransport } from './sticker-transport.js';

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
    img.closest('.focusable-list-item')===item && !img.closest('[data-testid="quoted-message"], [aria-hidden="true"], [hidden]'));
  if(!candidates.length)return null;
  if(focusedStickerButton && !candidates.some(img=>img.closest('button, [role="button"]')===focusedStickerButton))return null;
  const wrapper=item.closest('[data-id]'),id=wrapper?.getAttribute('data-id');
  if(!id)return null;
  const seen=new Map(),targets=[];
  for(const img of candidates){
    const svg=img.localName==='svg',src=svg?'svg-snapshot':img.currentSrc||img.src;
    const occurrence=img.closest('button, [role="button"]')||img;
    if(typeof getComputedStyle==='function'){
      const style=getComputedStyle(img);
      if(style.display==='none'||style.visibility==='hidden'||!img.getClientRects().length)continue;
    }
    if(!svg && seen.has(src)){
      const previous=seen.get(src);
      if(!previous.occurrences.has(occurrence)){
        previous.occurrences.add(occurrence);previous.count++;
      }
      continue;
    }
    if(!src || (!svg && (!img.complete || !img.naturalWidth || !src.startsWith(`blob:${location.origin}/`))))return null;
    const target={img,src,svg,count:1,occurrences:new Set([occurrence])};
    seen.set(src,target);targets.push(target);
  }
  if(!targets.length)return null;
  return {item,...targets[0],targets,id,wrapper};
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
  if(operation && !operation.done && operation.target.id===target.id && operation.target.targets.length===target.targets.length && operation.target.targets.every((entry,i)=>entry.src===target.targets[i].src && entry.count===target.targets[i].count))return true;
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
  let timedOut=false,key='',request,mediaStage=true;
  const mediaItems=[];
  const releaseFrames=()=>{for(const media of mediaItems)for(const frame of media.frames||[]){frame.canvas.width=0;frame.canvas.height=0;}};
  const timer=setTimeout(()=>{
    timedOut=true;op.done=true;op.controller.abort();key='';if(request)request.key='';
    // Some browser decode promises do not settle promptly after cancellation.
    announce(t('stickerTimeout'),()=>operation===op && op.epoch===epoch && isReadStickerEnabled() &&
      currentChat()===op.chat && op.language===getLanguage() && op.configFingerprint===JSON.stringify(getStickerConfig()));
  },45000);
  const cleanupCancelled=()=>{clearTimeout(timer);key='';if(request)request.key='';releaseFrames();};
  op.controller.signal.addEventListener('abort',cleanupCancelled,{once:true});
  try{
    const signal=op.controller.signal;
    key=await decryptStickerCredential(op.config.provider,op.config.providers[op.config.provider]);
    signal.throwIfAborted();if(!valid(op))return;
    if(op.target.targets.length>6)throw new Error('stickerTooLarge');
    const occurrences=[],seenBytes=[],seenSvg=new Map();
    let input;
    try{
      for(const target of op.target.targets){
        signal.throwIfAborted();if(!valid(op))return;
        if(!target.img.isConnected || op.target.wrapper.getAttribute('data-id')!==op.target.id)throw new Error('stickerMediaError');
        if(target.svg){
          const source=snapshotStickerSvg(target.img).source;
          if(seenSvg.has(source)){for(const node of target.occurrences)occurrences[seenSvg.get(source)].add(node);continue;}
          seenSvg.set(source,mediaItems.length);
          mediaItems.push(await decodeStickerSvg(target.img,signal));occurrences.push(new Set(target.occurrences));
        }else{
          const response=await fetch(target.src,{signal,credentials:'omit',redirect:'error'});
          const bytes=await readBoundedBody(response,STICKER_LIMITS.sourceBytes,signal);
          if(!target.img.isConnected || op.target.wrapper.getAttribute('data-id')!==op.target.id || (target.img.currentSrc||target.img.src)!==target.src)throw new Error('stickerMediaError');
          const duplicate=seenBytes.find(old=>old.bytes.length===bytes.length && old.bytes.every((value,i)=>value===bytes[i]));
          if(duplicate){for(const node of target.occurrences)occurrences[duplicate.index].add(node);continue;}
          seenBytes.push({bytes,index:mediaItems.length});
          mediaItems.push(await decodeSticker(bytes,signal));occurrences.push(new Set(target.occurrences));
        }
      }
      signal.throwIfAborted();if(!valid(op))return;
      const encode=scale=>mediaItems.length===1
        ? encodeStickerInput(mediaItems[0],op.config.provider,op.config.providers[op.config.provider].model,scale)
        : encodeStickerGroup(mediaItems,scale);
      input=encode(1);
      // Companion's native transport carries one bounded request. Shrink the images until they fit,
      // leaving room for the prompt and request fields, instead of rejecting animated stickers.
      if(usesNativeStickerTransport()){
        const budget=NATIVE_REQUEST_LIMIT-32*1024;
        const size=value=>value.images.reduce((total,image)=>total+image.data.length,0);
        for(const scale of [0.75,0.55,0.4,0.3]){
          if(size(input)<=budget)break;
          signal.throwIfAborted();
          input=encode(scale);
        }
      }
    }finally{
      releaseFrames();
    }
    signal.throwIfAborted();if(!valid(op))return;
    mediaStage=false;
    request=makeStickerRequest(op.config,key,input,op.language,op.id);key='';
    const result=await requestStickerTransport(request,signal);
    const text=parseStickerResponse(op.config.provider,result);
    if(!valid(op))return;
    const output=formatStickerResult(text,input,occurrences.map(nodes=>nodes.size));
    op.done=true;
    announce(t('stickerResult',{text:output}),()=>{
      if(!valid(op)||op.announced)return false;op.announced=true;return true;
    });
  }catch(error){
    if(timedOut || !valid(op))return;
    op.done=true;
    const allowed=['stickerKeyUnreadable','stickerMediaError','stickerAnimationError','stickerTooLarge','stickerAuthError','stickerModelAgreement','stickerQuotaError','stickerModelError','stickerTimeout','stickerNetworkError','stickerResponseError','stickerRefused','stickerTransportMissing','stickerBusy'];
    // A browser error while reading or decoding the image is a media problem, not a network one.
    const message=allowed.includes(error.message)?error.message:mediaStage?'stickerMediaError':'stickerNetworkError';
    if(message==='stickerModelAgreement' && valid(op) && openStickerAgreement(op.config, document.activeElement))return;
    announce(t(message),()=>valid(op));
  }finally{op.controller.signal.removeEventListener('abort',cleanupCancelled);cleanupCancelled();}
}

export function formatStickerResult(text,input,counts){
  let descriptions;
  if(counts.length>1){
    // Tolerate light Markdown and list markers such as "**Sticker 1:**", "1. Sticker 1:" or
    // "Sticker 1 (animated):". Newlines were already flattened by parseStickerResponse.
    // A bold list number such as "**2.**" is still just a list number.
    text=text.replace(/(\*\*|__)(\d+[.)])\1/g,'$2');
    const matches=[...text.matchAll(
      /(?:\*\*|__)?\s*(?:Sticker|Stiker)\s+(\d+)\s*(?:\([^()]{0,30}\))?\s*(?:\*\*|__)?\s*:(?:\*\*|__)?\s*/gi)];
    const prefix=text.slice(0,matches[0]?.index);
    // A reply cut off by the length limit (marked "…") keeps the stickers it did describe, in order.
    const truncated=text.endsWith('…') && matches.length>0 && matches.length<counts.length;
    if((matches.length!==counts.length && !truncated) || prefix.replace(/[\s*_#>•\-\d.)]+/g,''))
      throw new Error('stickerResponseError');
    // A list marker can only precede the next sticker, so the last description is never stripped.
    // Treat "2." as a list number only when the list starts with "1." and every later sticker
    // follows its own number, so a real number at the end of a description survives.
    const numbered=/^\s*1[.)]\s*$/.test(prefix) && matches.slice(1).every((match,index)=>
      new RegExp(`\\s${index+2}[.)][\\s*_]*$`).test(text.slice(0,match.index)));
    descriptions=matches.map((match,index)=>{
      if(Number(match[1])!==index+1)throw new Error('stickerResponseError');
      let description=text.slice(match.index+match[0].length,matches[index+1]?.index??text.length);
      if(index<matches.length-1){
        description=description.replace(/\s+[-*•]\s*$/,'');
        if(numbered)description=description.replace(new RegExp(`\\s+${index+2}[.)][\\s*_]*$`),'');
      }
      description=description.replace(/^[*_\s]+|[*_\s]+$/g,'').trim();
      // Only the ellipsis of a cut-off reply means this sticker was never described.
      if(text.endsWith('…') && index===matches.length-1 && description==='…')return t('stickerDescriptionMissing');
      if(!description)throw new Error('stickerResponseError');
      return description;
    });
    while(descriptions.length<counts.length)descriptions.push(t('stickerDescriptionMissing'));
  }else{
    descriptions=[text.replace(/^(?:(?:Animated sticker|Sticker|Stiker animasi|Stiker)\s*:\s*)+/i,'').trim()];
  }
  if(descriptions.some(description=>!description))throw new Error('stickerResponseError');
  return descriptions.map((description,index)=>{
    const header=counts.length>1?t('stickerNumberedPrefix',{number:index+1})
      :t(input.animated?'stickerAnimatedPrefix':'stickerStaticPrefix');
    const repetition=counts[index]>1?t('stickerRepeated',{count:counts[index]}):'';
    const limitation=counts.length===1 && input.unclear?t('stickerMotionUnclear'):'';
    return header.trimEnd()+' \n'+repetition+limitation+description;
  }).join('\n\n');
}
