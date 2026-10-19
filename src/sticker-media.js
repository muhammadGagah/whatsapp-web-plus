export const STICKER_LIMITS = Object.freeze({sourceBytes: 4*1024*1024, pixels: 1024*1024, frames:120, decodedPixels:32*1024*1024, samples:6, payloadBytes:8*1024*1024});
const bad = (key='stickerMediaError') => { throw new Error(key); };
export async function readBoundedBody(response, limit, signal) {
  if (!response.ok || Number(response.headers.get('content-length')) > limit) return bad();
  const reader = response.body?.getReader();
  if (!reader) return bad();
  const chunks=[]; let size=0;
  try {
    while(true) {
      signal.throwIfAborted();
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.length;
      if(size>limit) return bad('stickerTooLarge');
      chunks.push(value);
    }
    const bytes=new Uint8Array(size); let offset=0;
    for(const chunk of chunks){ bytes.set(chunk,offset);offset+=chunk.length; }
    return bytes;
  } finally { await reader.cancel().catch(()=>{}); }
}
export function inspectStickerBytes(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ascii=(p,n)=>String.fromCharCode(...bytes.subarray(p,p+n));
  let mime='',width=0,height=0,animated=false;
  if(bytes.length>=24 && ascii(1,3)==='PNG' && bytes[0]===137) {
    mime='image/png';width=view.getUint32(16);height=view.getUint32(20);
    for(let p=8;p+12<=bytes.length;){ const n=view.getUint32(p);if(p+n+12>bytes.length) return bad();if(ascii(p+4,4)==='acTL')animated=true;p+=n+12; }
  } else if(bytes.length>=10 && /^GIF8[79]a$/.test(ascii(0,6))) {
    mime='image/gif';width=view.getUint16(6,true);height=view.getUint16(8,true);
  } else if(bytes.length>=30 && ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP') {
    mime='image/webp';
    const u24=p=>bytes[p]+bytes[p+1]*256+bytes[p+2]*65536;
    for(let p=12;p+8<=bytes.length;){
      const n=view.getUint32(p+4,true),tag=ascii(p,4),start=p+8;
      if(start+n>bytes.length)return bad();
      if(tag==='VP8X' && n>=10){animated=!!(bytes[start]&2);width=u24(start+4)+1;height=u24(start+7)+1;}
      if(tag==='VP8 ' && !width && n>=10){width=view.getUint16(start+6,true)&16383;height=view.getUint16(start+8,true)&16383;}
      if(tag==='VP8L' && !width && n>=5){const bits=view.getUint32(start+1,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
      p=start+n+(n%2);
    }
  }
  if(!mime || !width || !height)return bad();
  if(width*height>STICKER_LIMITS.pixels || width>2048 || height>2048)return bad('stickerTooLarge');
  return {mime,width,height,animated};
}
function canvasImage(frame,width,height){
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,512/Math.max(width,height));
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)return bad();
  ctx.drawImage(frame,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let hash=2166136261;
  for(let i=0;i<pixels.length;i++)hash=Math.imul(hash^pixels[i],16777619);
  return {canvas,hash:hash>>>0};
}
export function snapshotStickerSvg(svg) {
  const clone=svg.cloneNode(true);
  const allowed=new Set(['svg','g','defs','clippath','mask','path','rect','circle','ellipse','line','polyline','polygon','use','lineargradient','radialgradient','stop','filter','fecomponenttransfer','fefunca']);
  const nodes=[clone,...clone.querySelectorAll('*')];
  if(nodes.length>4000)return bad('stickerTooLarge');
  for(const node of nodes){
    if(!allowed.has(node.localName.toLowerCase()))return bad('stickerMediaError');
    for(const attr of Array.from(node.attributes)){
      const name=attr.name.toLowerCase(),value=attr.value;
      if(name.startsWith('on') || name==='class'){node.removeAttribute(attr.name);continue;}
      if((name==='href'||name==='xlink:href')&&!/^#[\w-]+$/.test(value))return bad();
      if(value.includes('\\') || value.includes('/*'))return bad();
      const withoutLocal=value.replace(/url\(\s*['"]?#[\w-]+['"]?\s*\)/gi,'');
      if(/url\s*\(|@import|javascript:|expression\s*\(/i.test(withoutLocal))return bad();
      if(name==='style'){
        const safe=value.split(';').filter(rule=>/^\s*(display|opacity|transform|transform-origin|visibility|width|height|content-visibility)\s*:/i.test(rule));
        node.setAttribute('style',safe.join(';'));
      }
    }
  }
  const box=(clone.getAttribute('viewBox')||clone.getAttribute('viewbox')||'').trim().split(/[ ,]+/).map(Number);
  const width=box.length===4?box[2]:Number(clone.getAttribute('width'));
  const height=box.length===4?box[3]:Number(clone.getAttribute('height'));
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>STICKER_LIMITS.pixels)return bad('stickerTooLarge');
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('width',String(width));clone.setAttribute('height',String(height));
  const source=new XMLSerializer().serializeToString(clone);
  if(new TextEncoder().encode(source).length>1024*1024)return bad('stickerTooLarge');
  return {source,width,height};
}
export async function decodeStickerSvg(svg,signal){
  signal.throwIfAborted();
  const snapshot=snapshotStickerSvg(svg);
  const url=URL.createObjectURL(new Blob([snapshot.source],{type:'image/svg+xml'}));
  const image=new Image();
  let abort;
  try{
    await new Promise((resolve,reject)=>{
      abort=()=>{image.src='';reject(new Error('stickerTimeout'));};
      image.onload=resolve;image.onerror=()=>reject(new Error('stickerMediaError'));
      signal.addEventListener('abort',abort,{once:true});image.src=url;
    });
    signal.throwIfAborted();
    const frame=canvasImage(image,snapshot.width,snapshot.height);
    // This is one rendered Lottie frame, not a decoded animation sequence.
    return {frames:[{...frame,index:0,time:0}],animated:true,mode:'unclear',duration:0};
  }finally{
    signal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;URL.revokeObjectURL(url);
  }
}
export async function decodeSticker(bytes,signal) {
  const meta=inspectStickerBytes(bytes);
  if(typeof ImageDecoder!=='function' || !await ImageDecoder.isTypeSupported(meta.mime))return bad('stickerAnimationError');
  signal.throwIfAborted();
  const decoder=new ImageDecoder({data:bytes,type:meta.mime,preferAnimation:true});
  const cancel=()=>{try{decoder.close();}catch{}};
  signal.addEventListener('abort',cancel,{once:true});
  const frames=[];
  try {
    await decoder.tracks.ready;
    const track=decoder.tracks.selectedTrack;
    if(!track || !track.frameCount)return bad();
    const count=track.frameCount;
    const animated=meta.animated || track.animated || count>1;
    if(count>STICKER_LIMITS.frames || count*meta.width*meta.height>STICKER_LIMITS.decodedPixels)return bad('stickerTooLarge');
    const wanted=new Set(Array.from({length:Math.min(count,6)},(_,i)=>Math.floor(i*count/Math.min(count,6))));
    let elapsed=0;
    for(let i=0;i<count;i++){
      signal.throwIfAborted();
      const result=await decoder.decode({frameIndex:i,completeFramesOnly:true});
      try {
        if(wanted.has(i)){
          const sample=canvasImage(result.image,meta.width,meta.height);
          frames.push({...sample,index:i,time:elapsed});
        }
        elapsed+=Number(result.image.duration)||0;
      } finally {result.image.close();}
    }
    signal.throwIfAborted();
    const changed=new Set(frames.map(x=>x.hash)).size>1;
    return {frames,animated,mode:animated&&!changed?'unclear':'frames',duration:elapsed};
  } catch(error){for(const f of frames){f.canvas.width=0;f.canvas.height=0;}throw error;}
  finally{signal.removeEventListener('abort',cancel);cancel();}
}
export function encodeStickerInput(media,provider,model) {
  let frames=media.frames;
  let mode=media.mode;
  const multi=provider==='gemini' || provider==='groq' && model==='qwen/qwen3.8-27b';
  let board;
  try {
    if(!multi && frames.length>1){
      board=document.createElement('canvas');
      const w=Math.max(...frames.map(f=>f.canvas.width)),h=Math.max(...frames.map(f=>f.canvas.height));
      const cols=Math.min(3,frames.length);board.width=w*cols;board.height=(h+24)*Math.ceil(frames.length/cols);
      const ctx=board.getContext('2d');ctx.fillStyle='#b0b0b0';ctx.fillRect(0,0,board.width,board.height);
      frames.forEach((f,i)=>{const x=i%cols*w,y=Math.floor(i/cols)*(h+24);ctx.drawImage(f.canvas,x,y);ctx.fillStyle='#000';ctx.font='16px sans-serif';ctx.fillText(String(i+1),x+4,y+h+18);});
      frames=[{canvas:board,index:0,time:0}];mode='storyboard';
    } else if(provider==='groq' && frames.length>3){frames=[frames[0],frames[Math.floor(frames.length/2)],frames[frames.length-1]];}
    const images=frames.map(f=>({mime:'image/png',data:f.canvas.toDataURL('image/png').split(',')[1],index:f.index,time:f.time}));
    if(images.reduce((n,i)=>n+i.data.length,0)>STICKER_LIMITS.payloadBytes)return bad('stickerTooLarge');
    return {images,animated:media.animated,mode,unclear:media.mode==='unclear'};
  }finally{for(const f of media.frames){f.canvas.width=0;f.canvas.height=0;}if(board){board.width=0;board.height=0;}}
}
