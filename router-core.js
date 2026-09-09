// News By Listening v1.3.2 - single core router for all bottom navigation tabs
// Loaded before feature modules so no later module can trap the user on one tab.
(function(){
  const VALID_TABS = new Set(['library','queues','history','sync','settings']);

  document.addEventListener('click', function(e){
    const btn = e.target.closest('.bottomnav [data-nav]');
    if(!btn) return;
    const tab = btn.dataset.nav;
    if(!VALID_TABS.has(tab)) return;

    // Own navigation completely. Feature modules must not handle this same click again.
    e.preventDefault();
    e.stopImmediatePropagation();

    view.tab = tab;
    view.categoryId = null;
    view.itemId = null;
    view.queueId = null;

    // render() may later be wrapped by vivaldi-playlists.js; call-time lookup ensures
    // we always invoke the newest renderer, including the DS phát renderer.
    render();
  }, true);
})();
