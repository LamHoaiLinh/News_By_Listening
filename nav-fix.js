// News By Listening v1.3.1 - persistent bottom navigation fix
// Custom playlist screens are rendered dynamically, so handle every bottom-nav tab
// through document-level delegation instead of relying on bindings from the first render.
(function(){
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.bottomnav [data-nav]');
    if(!btn) return;
    const tab = btn.dataset.nav;
    if(!['library','history','sync','settings'].includes(tab)) return; // queues handled by vivaldi-playlists.js
    e.preventDefault();
    e.stopImmediatePropagation();
    view.tab = tab;
    view.categoryId = null;
    view.itemId = null;
    view.queueId = null;
    render();
  }, true);
})();
