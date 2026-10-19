const endpoints={gemini:'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',groq:'https://api.groq.com/openai/v1/chat/completions'};
export function validateRequest(r){
  if(!r||r.version!==1||typeof r.id!=='string'||!/^[0-9a-f-]{36}$/.test(r.id)||!['gemini','groq','custom','cloudflare'].includes(r.provider)||typeof r.key!=='string'||!r.key.trim()||r.key.length>8192||/[\r\n]/.test(r.key))throw Error();
  const url=new URL(r.endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.port&&url.port!=='443')throw Error();
  if(r.provider!=='custom'&&r.provider!=='cloudflare'&&r.endpoint!==endpoints[r.provider])throw Error();
  if(r.provider==='custom'&&!url.pathname.endsWith('/chat/completions'))throw Error();
  if(!Number.isFinite(r.expiresAt)||r.expiresAt<Date.now()||r.expiresAt>Date.now()+60000)throw Error();
  if(!r.body||typeof r.body!=='object'||JSON.stringify(r.body).length>8*1024*1024)throw Error();
  if(r.provider==='cloudflare'){
    if(!/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[a-f0-9]{32}\/ai\/run\/@(cf|hf)\/[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.endpoint))throw Error();
    const legacy=url.pathname.endsWith('/@cf/meta/llama-3.2-11b-vision-instruct');
    if(url.pathname.split('/ai/run/')[1].length>160)throw Error();
    if(r.purpose==='model-agreement'){
      if(!legacy)throw Error();
      if(r.body.prompt!=='agree'||Object.keys(r.body).length!==1)throw Error();
      r.body={prompt:'agree'};return url;
    }
    if(legacy){
      if(typeof r.body.prompt!=='string'||!r.body.prompt.trim()||r.body.prompt.length>6000||
        typeof r.body.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(r.body.image))throw Error();
      r.body={prompt:r.body.prompt,image:r.body.image,max_tokens:512,stream:false};
      return url;
    }
  }
  const parts=r.provider==='gemini'?r.body.contents?.[0]?.parts:r.body.messages?.[0]?.content;
  if(!Array.isArray(parts)||parts.length<2||parts.length>7)throw Error();
  let images=0;
  for(const part of parts){
    if(typeof part.text==='string'){if(part.text.length>6000)throw Error();continue;}
    const image=r.provider==='gemini'?part.inlineData?.data:part.image_url?.url?.replace(/^data:image\/png;base64,/, '');
    if(typeof image!=='string'||!image||!/^[A-Za-z0-9+/]+=*$/.test(image))throw Error();
    if(r.provider==='gemini'&&part.inlineData.mimeType!=='image/png')throw Error();
    if(r.provider!=='gemini'&&!part.image_url.url.startsWith('data:image/png;base64,'))throw Error();images++;
  }
  if(!images||r.provider==='groq'&&images>3)throw Error();
  if(r.provider==='gemini')r.body={contents:[{role:'user',parts:parts.map(p=>typeof p.text==='string'?{text:p.text}:{inlineData:{mimeType:'image/png',data:p.inlineData.data}})}],generationConfig:{maxOutputTokens:512}};
  else{
    if(r.provider!=='cloudflare' && (typeof r.body.model!=='string'||r.body.model.length>160||!r.body.model.trim()))throw Error();
    r.body={model:r.body.model,messages:[{role:'user',content:parts.map(p=>typeof p.text==='string'?{type:'text',text:p.text}:{type:'image_url',image_url:{url:p.image_url.url}})}],max_completion_tokens:512,stream:false};
  }
  if(r.provider==='cloudflare'){delete r.body.model;delete r.body.max_completion_tokens;r.body.max_tokens=512;}
  return url;
}
