(() => {
  'use strict';
  const config=window.tenGrandVoiceSecurity;
  if (!config?.enabled) return;
  const form=document.querySelector('#amass-voice-form');
  const review=document.querySelector('[data-amass-step="7"] .amass-flow__content');
  if(!form||!review)return;
  const trap=document.createElement('input');trap.name='company_url';trap.type='text';trap.tabIndex=-1;trap.autocomplete='off';trap.setAttribute('aria-hidden','true');
  trap.style.cssText='position:absolute;left:-10000px;width:1px;height:1px;';form.append(trap);
  const widget=document.createElement('div');widget.style.marginTop='24px';review.append(widget);
  let token='',widgetId=null;
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=()=>{widgetId=window.turnstile.render(widget,{sitekey:config.turnstileSiteKey,action:'voices-submit',theme:'dark',size:'flexible',callback:value=>{token=value;},'expired-callback':()=>{token='';},'error-callback':()=>{token='';}});};
  document.head.append(script);
  const fields=['name','role','focus_areas','focus_other','response_type','response_title','why_detail','website','website_title','social_platform','social_handle'];
  async function post(path,options) {
    const response=await fetch(config.endpoint.replace(/\/$/,'')+path,{method:'POST',...options,signal:AbortSignal.timeout(100000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Submission failed.');return result;
  }
  window.tenGrandSecureVoiceSubmit=async(payload,audio,photo)=>{
    if(!token)throw new Error('Please complete the verification before submitting.');
    if((photo&&photo.size>2097152)||(audio&&audio.size>5242880))throw new Error('Photo must be at most 2 MB and audio at most 5 MB.');
    const verification=token;token='';
    try {
      const session=await post('/start',{headers:{'Content-Type':'application/json'},body:JSON.stringify({turnstile_token:verification,company_url:trap.value})});
      const data=new FormData();data.set('fields',JSON.stringify(Object.fromEntries(fields.map(key=>[key,payload[key]]))));
      if(photo)data.set('photo',photo,'photo.jpg');if(audio)data.set('audio',audio,'voice');
      await post('/submit',{headers:{'X-Submission-Token':session.token},body:data});
    } finally {if(widgetId!==null)window.turnstile.reset(widgetId);}
  };
})();
