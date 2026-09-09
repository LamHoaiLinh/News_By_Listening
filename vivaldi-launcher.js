// News By Listening v1.3.3 - force external playback into Vivaldi on iOS
// Normal HTTPS links from a standalone PWA may be intercepted by iOS Universal Links
// (e.g. YouTube app). Use Vivaldi's registered URL scheme first so Vivaldi owns the handoff.
(function(){
  function isIOSDevice(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function toVivaldiScheme(target){
    try{
      const u = new URL(String(target), location.href);
      if(u.protocol === 'http:' || u.protocol === 'https:'){
        // Chromium-style browser URL scheme: replace http(s):// with vivaldi://
        return 'vivaldi://' + u.href.replace(/^https?:\/\//i, '');
      }
    }catch{}
    return 'vivaldi://' + String(target).replace(/^https?:\/\//i, '');
  }

  openExternal = function(url){
    if(!url) return;
    const target = String(url);

    if(isIOSDevice()){
      const scheme = toVivaldiScheme(target);
      window.location.href = scheme;

      // If Vivaldi is not installed / scheme is not handled, keep the app usable.
      // Do not run fallback after Vivaldi successfully backgrounds News Listening.
      setTimeout(() => {
        if(document.visibilityState === 'visible'){
          const a = document.createElement('a');
          a.href = target;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      }, 1400);
      return;
    }

    window.open(target, '_blank', 'noopener');
  };
})();
