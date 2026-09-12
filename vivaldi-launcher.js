// News By Listening v1.6.1 - reliable external playback into Vivaldi on iOS
(function(){
  function isIOSDevice(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function toVivaldiScheme(target){
    try{
      const u=new URL(String(target),location.href);
      if(u.protocol==='http:'||u.protocol==='https:'){
        return 'vivaldi://' + u.href.replace(/^https?:\/\//i,'');
      }
    }catch{}
    return 'vivaldi://' + String(target).replace(/^https?:\/\//i,'');
  }

  openExternal=function(url){
    if(!url)return;
    const target=String(url);

    if(isIOSDevice()){
      let handoffDetected=false;
      let timer=null;
      const markHandoff=()=>{handoffDetected=true;cleanup();};
      const onVisibility=()=>{if(document.visibilityState==='hidden')markHandoff();};
      const cleanup=()=>{
        document.removeEventListener('visibilitychange',onVisibility);
        window.removeEventListener('pagehide',markHandoff);
        window.removeEventListener('blur',markHandoff);
        if(timer){clearTimeout(timer);timer=null;}
      };

      document.addEventListener('visibilitychange',onVisibility);
      window.addEventListener('pagehide',markHandoff,{once:true});
      window.addEventListener('blur',markHandoff,{once:true});

      window.location.href=toVivaldiScheme(target);

      // Fallback only when there is no sign that iOS actually handed control to Vivaldi.
      // This avoids a second URL open racing the already-playing Vivaldi tab.
      timer=setTimeout(()=>{
        const shouldFallback=!handoffDetected && document.visibilityState==='visible';
        cleanup();
        if(!shouldFallback)return;
        const a=document.createElement('a');
        a.href=target;
        a.target='_blank';
        a.rel='noopener noreferrer';
        a.style.display='none';
        document.body.appendChild(a);
        a.click();
        a.remove();
      },1800);
      return;
    }

    window.open(target,'_blank','noopener');
  };
})();
