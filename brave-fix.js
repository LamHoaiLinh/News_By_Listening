// Brave iOS launcher fix v1.1.1
// Previous code encoded the destination URL twice, causing Brave to open its Home page
// instead of the requested YouTube URL.

if (typeof openExternal === 'function') {
  openExternal = function (url) {
    if (!url) return;
    const target = String(url);
    const useBrave = state?.prefs?.openInBrave && isIOS();

    if (useBrave) {
      // Brave iOS expects the target URL as the `url` query parameter.
      // Encode ONCE so query strings such as ?v=...&list=... stay intact.
      const scheme = `brave://open-url?url=${encodeURIComponent(target)}`;
      window.location.href = scheme;

      // Fallback: if Brave did not take focus, open the normal HTTPS URL.
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          window.location.href = target;
        }
      }, 1500);
      return;
    }

    window.open(target, '_blank', 'noopener');
  };
}
