// News By Listening v1.5.0 - repeat controls UI
(function(){
  if(!window.NBL_REPEAT_ENGINE)return;
  const E=window.NBL_REPEAT_ENGINE;

  function currentQueue(){return E.currentQueue();}
  function modeText(mode){
    if(mode==='list-once')return 'Toàn bộ list ×1';
    if(mode==='list-infinity')return 'Toàn bộ list ∞';
    if(mode==='track-once')return '1 bài ×1';
    if(mode==='track-infinity')return '1 bài ∞';
    return 'Lặp lại';
  }
  function closeMenus(){document.querySelectorAll('.nbl-repeat-menu.open').forEach(x=>x.classList.remove('open'));}
  function setMode(q,mode){
    if(!q)return;
    if((mode==='track-once'||mode==='track-infinity')&&!E.selectedTrack(q)){
      toast('Hãy chọn bài cần lặp trong danh sách trước');
      return;
    }
    q.repeatMode=E.normalizeMode(mode);
    q.updatedAt=new Date().toISOString();
    save();
    render();
  }
  function selectTrack(q,index){
    const v=q?.videos?.[index];
    if(!v)return;
    q.repeatVideoId=v.videoId;
    q.updatedAt=new Date().toISOString();
    save();
    render();
  }

  function enhance(){
    if(view.tab!=='queues')return;
    const q=currentQueue();
    if(!q)return;
    q.repeatMode=E.normalizeMode(q.repeatMode);
    if(q.repeatVideoId&&!E.selectedTrack(q))q.repeatVideoId=null;

    const toolbar=document.querySelector('[data-q-action="play-all"]')?.closest('.toolbar');
    if(toolbar&&!toolbar.querySelector('.nbl-repeat-wrap')){
      const anchor=toolbar.querySelector('[data-nbl-shuffle-current]')||toolbar.querySelector('[data-q-action="play-all"]');
      const wrap=document.createElement('div');
      wrap.className='nbl-repeat-wrap';
      wrap.innerHTML=`<button class="ghost nbl-repeat-main" data-repeat-toggle>↻ ${esc(modeText(q.repeatMode))} <span class="nbl-repeat-caret">⌄</span></button>
        <div class="nbl-repeat-menu" data-repeat-menu>
          <button data-repeat-mode="off" class="${q.repeatMode==='off'?'active':''}">Không lặp</button>
          <div class="nbl-repeat-sep"></div>
          <button data-repeat-mode="list-once" class="${q.repeatMode==='list-once'?'active':''}">Toàn bộ list · ×1</button>
          <button data-repeat-mode="list-infinity" class="${q.repeatMode==='list-infinity'?'active':''}">Toàn bộ list · ∞</button>
          <div class="nbl-repeat-sep"></div>
          <button data-repeat-mode="track-once" class="${q.repeatMode==='track-once'?'active':''}">1 bài đang chọn · ×1</button>
          <button data-repeat-mode="track-infinity" class="${q.repeatMode==='track-infinity'?'active':''}">1 bài đang chọn · ∞</button>
          <div class="nbl-repeat-foot">×1 = phát thêm 1 lần. ∞ dùng tối đa 50 mục trong một lượt YouTube.</div>
        </div>`;
      anchor?.insertAdjacentElement('afterend',wrap);
    }

    const selected=E.selectedTrack(q);
    document.querySelectorAll('.nbl-q-video[data-q-index]').forEach(row=>{
      const i=Number(row.dataset.qIndex),v=q.videos?.[i];
      if(!v)return;
      row.classList.toggle('nbl-repeat-selected',selected?.videoId===v.videoId);
      const idx=row.querySelector('.video-index');
      if(idx&&!idx.querySelector('[data-repeat-select]')){
        const b=document.createElement('button');
        b.className='nbl-repeat-select';
        b.dataset.repeatSelect=String(i);
        b.textContent=selected?.videoId===v.videoId?'● Bài lặp':'○ Chọn lặp';
        b.title='Chọn bài này cho chế độ lặp 1 bài';
        idx.appendChild(document.createTextNode(' '));
        idx.appendChild(b);
      }
    });

    let note=document.querySelector('.nbl-repeat-status');
    if(!note){
      note=document.createElement('div');
      note.className='notice nbl-repeat-status';
      toolbar?.insertAdjacentElement('afterend',note);
    }
    const selectedName=selected?` · bài chọn: ${esc(selected.title)}`:'';
    note.innerHTML=`<b>Lặp:</b> ${esc(E.modeLabel(q))}${selectedName}${q.repeatMode.includes('infinity')?' · ký hiệu ∞ được lấp đầy đến giới hạn 50 mục/lượt':''}`;
  }

  if(typeof render==='function'){
    const base=render;
    render=function(...args){
      const out=base(...args);
      enhance();
      if(view.tab==='settings'){
        document.querySelectorAll('.subtle').forEach(el=>{if(/^Phiên bản\s+/i.test(el.textContent||''))el.textContent='Phiên bản 1.5.0 · Lặp lại + ngẫu nhiên + 6 slot';});
      }
      return out;
    };
  }

  document.addEventListener('click',e=>{
    const toggle=e.target.closest('[data-repeat-toggle]');
    if(toggle){
      e.preventDefault();e.stopImmediatePropagation();
      const menu=toggle.closest('.nbl-repeat-wrap')?.querySelector('[data-repeat-menu]');
      const was=menu?.classList.contains('open');closeMenus();if(menu&&!was)menu.classList.add('open');return;
    }
    const mode=e.target.closest('[data-repeat-mode]');
    if(mode){e.preventDefault();e.stopImmediatePropagation();setMode(currentQueue(),mode.dataset.repeatMode);return;}
    const select=e.target.closest('[data-repeat-select]');
    if(select){e.preventDefault();e.stopImmediatePropagation();selectTrack(currentQueue(),Number(select.dataset.repeatSelect));return;}
    if(!e.target.closest('.nbl-repeat-wrap'))closeMenus();
  },true);

  render();
})();
