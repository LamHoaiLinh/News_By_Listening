// News By Listening v1.7.0 - custom playlist data + UI only
// Playback is owned exclusively by playback-engine.js.
(function(){
  'use strict';

  const NBL_QUEUE_LIMIT=window.NBL_PLAYBACK_ENGINE?.QUEUE_LIMIT||50;

  state.customPlaylists ||= [];
  state.prefs ||= {};
  state.prefs.browser='vivaldi';
  state.prefs.openInBrave=false;
  view.queueId ||= null;
  save();

  nav=function(){
    const items=[
      ['library','Thư viện'],
      ['queues','DS phát'],
      ['history','Đã nghe'],
      ['sync','Đồng bộ'],
      ['settings','Cài đặt']
    ];
    return `<nav class="bottomnav">${items.map(([id,t])=>`<button class="navbtn ${view.tab===id?'active':''}" data-nav="${id}">${t}</button>`).join('')}</nav>`;
  };

  shell=function(content){
    return `<div class="shell"><header class="topbar"><div class="brand"><div class="logo">NBL</div><div><h1>News By Listening</h1><p>Chọn nhanh · Mở Vivaldi · Nghe liên tục</p></div></div><span class="badge green">${esc(state.prefs.speed)}x ưa thích</span></header>${content}</div>${nav()}`;
  };

  if(typeof syncPayload==='function'){
    const baseSyncPayload=syncPayload;
    syncPayload=function(...args){
      const payload=baseSyncPayload(...args);
      payload.v=4;
      payload.customPlaylists=state.customPlaylists;
      payload.prefs={...(payload.prefs||{}),browser:'vivaldi',openInBrave:false};
      return payload;
    };
  }

  if(typeof applyImport==='function'){
    const baseApplyImport=applyImport;
    applyImport=function(data){
      baseApplyImport(data);
      if(Array.isArray(data?.customPlaylists))state.customPlaylists=data.customPlaylists;
      state.prefs ||= {};
      state.prefs.browser='vivaldi';
      state.prefs.openInBrave=false;
      save();
      render();
    };
  }

  function extractVideoId(raw){
    try{
      let text=String(raw||'').trim();
      if(!text)return null;
      if(!/^https?:\/\//i.test(text))text='https://'+text;
      const u=new URL(text);
      const host=u.hostname.replace(/^www\./,'');
      if(host==='youtu.be'){
        const id=u.pathname.split('/').filter(Boolean)[0];
        return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
      }
      if(!['youtube.com','m.youtube.com','music.youtube.com'].includes(host))return null;
      const v=u.searchParams.get('v');
      if(/^[A-Za-z0-9_-]{11}$/.test(v||''))return v;
      const m=u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
      return m?m[1]:null;
    }catch{return null;}
  }

  function parseManyVideoIds(text){
    const parts=String(text||'').split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);
    const ids=[];
    for(const part of parts){
      const id=extractVideoId(part);
      if(id&&!ids.includes(id))ids.push(id);
    }
    return ids;
  }

  function fmtDuration(iso){
    const m=String(iso||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if(!m)return '';
    const h=Number(m[1]||0),min=Number(m[2]||0),s=Number(m[3]||0);
    return h?`${h}:${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${min}:${String(s).padStart(2,'0')}`;
  }

  async function fetchVideoMetadata(ids){
    const out=new Map();
    for(let i=0;i<ids.length;i+=50){
      const chunk=ids.slice(i,i+50);
      try{
        const data=await yt('videos',{part:'snippet,contentDetails',id:chunk.join(','),maxResults:chunk.length});
        for(const x of data.items||[]){
          out.set(x.id,{
            id:uid('qv'),
            videoId:x.id,
            title:x.snippet?.title||`YouTube ${x.id}`,
            channelTitle:x.snippet?.channelTitle||'',
            thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||ytThumb(x.id),
            duration:x.contentDetails?.duration||'',
            addedAt:new Date().toISOString()
          });
        }
      }catch{}
    }
    return ids.map(id=>out.get(id)||({
      id:uid('qv'),videoId:id,title:`YouTube video ${id}`,channelTitle:'',
      thumbnail:ytThumb(id),duration:'',addedAt:new Date().toISOString()
    }));
  }

  function currentQueue(){return (state.customPlaylists||[]).find(x=>x.id===view.queueId)||null;}

  function modal(html){
    const root=document.createElement('div');
    root.className='modalback';
    root.innerHTML=`<div class="modal">${html}</div>`;
    root.addEventListener('click',e=>{if(e.target===root)root.remove();});
    document.body.appendChild(root);
    return root;
  }

  function showCreateQueue(){
    const root=modal(`<h2>Tạo danh sách phát</h2><div class="field"><label>Tên danh sách</label><input id="qp-name" class="input" placeholder="Ví dụ: Nghe khi đi làm"></div><div class="field"><label>Dán các link video YouTube (mỗi link một dòng)</label><textarea id="qp-links" class="input nbl-textarea" placeholder="https://youtube.com/watch?v=...\nhttps://youtu.be/...\n..."></textarea><small class="subtle">Có thể tạo danh sách trước rồi thêm video sau. Thứ tự dán chính là thứ tự phát.</small></div><div class="modal-actions"><button class="ghost" data-close>Hủy</button><button class="primary" data-save>Tạo danh sách</button></div>`);
    root.querySelector('[data-close]').onclick=()=>root.remove();
    root.querySelector('[data-save]').onclick=async function(){
      const name=root.querySelector('#qp-name').value.trim()||'Danh sách nghe';
      const ids=parseManyVideoIds(root.querySelector('#qp-links').value);
      this.disabled=true;this.textContent='Đang lấy thông tin...';
      const videos=ids.length?await fetchVideoMetadata(ids):[];
      const q={id:uid('queue'),name,videos,repeatMode:'off',repeatVideoId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      state.customPlaylists.push(q);save();view.queueId=q.id;root.remove();render();
      toast(`Đã tạo ${name}${videos.length?' · '+videos.length+' video':''}`);
    };
  }

  function showRenameQueue(q){
    const root=modal(`<h2>Đổi tên danh sách</h2><div class="field"><label>Tên</label><input id="qp-name" class="input" value="${esc(q.name)}"></div><div class="modal-actions"><button class="ghost" data-close>Hủy</button><button class="primary" data-save>Lưu</button></div>`);
    root.querySelector('[data-close]').onclick=()=>root.remove();
    root.querySelector('[data-save]').onclick=()=>{
      q.name=root.querySelector('#qp-name').value.trim()||q.name;
      q.updatedAt=new Date().toISOString();save();root.remove();render();
    };
  }

  function showAddVideos(q){
    const root=modal(`<h2>Thêm video vào ${esc(q.name)}</h2><div class="field"><label>Dán nhiều link YouTube</label><textarea id="qp-links" class="input nbl-textarea" placeholder="Mỗi link một dòng"></textarea><small class="subtle">Link trùng trong danh sách sẽ tự bỏ qua.</small></div><div class="modal-actions"><button class="ghost" data-close>Hủy</button><button class="primary" data-save>Thêm video</button></div>`);
    root.querySelector('[data-close]').onclick=()=>root.remove();
    root.querySelector('[data-save]').onclick=async function(){
      const ids=parseManyVideoIds(root.querySelector('#qp-links').value);
      if(!ids.length)return toast('Không tìm thấy link video YouTube hợp lệ');
      const existing=new Set((q.videos||[]).map(x=>x.videoId));
      const newIds=ids.filter(id=>!existing.has(id));
      if(!newIds.length)return toast('Các video này đã có trong danh sách');
      this.disabled=true;this.textContent='Đang lấy thông tin...';
      const videos=await fetchVideoMetadata(newIds);
      q.videos||=[];q.videos.push(...videos);q.updatedAt=new Date().toISOString();save();root.remove();render();
      toast(`Đã thêm ${videos.length} video`);
    };
  }

  function renderQueueList(){
    const qs=state.customPlaylists||[];
    return shell(`<div class="section-title"><div><h2>Danh sách phát</h2><div class="subtle">Tự gom nhiều link video từ các kênh khác nhau</div></div><button class="primary" data-q-action="create">+ Tạo danh sách</button></div><div class="notice"><b>Playback Engine 1.7:</b> mọi thao tác Phát, Nghe từ đây, Ngẫu nhiên và Lặp đều đi qua một engine duy nhất trước khi bàn giao sang Vivaldi. Mỗi lượt tối đa ${NBL_QUEUE_LIMIT} mục YouTube.</div><div class="grid nbl-queue-grid" style="margin-top:12px">${qs.map(q=>`<div class="card category-card"><div class="card-actions"><button class="iconbtn" data-q-rename="${q.id}">Sửa</button></div><div class="category-index">DANH SÁCH PHÁT</div><h3>${esc(q.name)}</h3><div class="count">${(q.videos||[]).length} video</div><div class="toolbar nbl-card-toolbar"><button class="ghost" data-q-open="${q.id}">Mở</button><button class="primary" data-q-play="${q.id}">▶ Phát</button><button class="ghost nbl-shuffle-btn" data-nbl-shuffle-card="${q.id}">🔀 Ngẫu nhiên</button></div></div>`).join('')}</div>${qs.length?'':'<div class="empty" style="margin-top:12px">Chưa có danh sách phát. Tạo một danh sách rồi dán các link video cần nghe.</div>'}`);
  }

  function renderQueueDetail(q){
    const vs=q.videos||[];
    return shell(`<button class="ghost back" data-q-action="back">← Danh sách phát</button><div class="section-title"><div><h2>${esc(q.name)}</h2><div class="subtle">${vs.length} video · kéo thả trên PC hoặc dùng ↑ ↓ để đổi thứ tự</div></div><button class="primary" data-q-action="add-videos">+ Dán video</button></div><div class="toolbar"><button class="primary" data-q-action="play-all">▶ Phát từ đầu</button><button class="ghost nbl-shuffle-btn" data-nbl-shuffle-current="1">🔀 Phát ngẫu nhiên</button><button class="ghost" data-q-action="rename">Đổi tên</button><button class="danger" data-q-action="delete-queue">Xóa danh sách</button></div>${vs.length>NBL_QUEUE_LIMIT?`<div class="notice warn">Danh sách có ${vs.length} video. Một lượt YouTube phát tối đa ${NBL_QUEUE_LIMIT} mục. Bấm “Nghe từ đây” ở phần tiếp theo để tiếp tục.</div>`:''}<div class="video-list nbl-queue-videos">${vs.map((v,i)=>`<div class="card video nbl-q-video" draggable="true" data-q-index="${i}"><img class="thumb" src="${esc(v.thumbnail||ytThumb(v.videoId))}" alt=""><div><div class="video-index">#${i+1}</div><h3>${esc(v.title)}</h3><div class="meta">${esc(v.channelTitle||'')}${v.duration?' · '+fmtDuration(v.duration):''}</div></div><div class="row-actions"><button class="iconbtn" data-q-move="up" data-index="${i}" ${i===0?'disabled':''}>↑</button><button class="iconbtn" data-q-move="down" data-index="${i}" ${i===vs.length-1?'disabled':''}>↓</button><button class="primary" data-q-play-index="${i}">▶ Nghe từ đây</button><button class="danger" data-q-remove="${i}">Xóa</button></div></div>`).join('')}</div>${vs.length?'':'<div class="empty">Dán các link video YouTube để bắt đầu.</div>'}`);
  }

  function renderQueues(){const q=currentQueue();return q?renderQueueDetail(q):renderQueueList();}

  renderSettings=function(){
    const statusText=typeof nblYoutubeBackendStatus==='undefined'||nblYoutubeBackendStatus===null?'Đang kiểm tra...':nblYoutubeBackendStatus?'Đã cấu hình · sẵn sàng':'Chưa sẵn sàng';
    const statusClass=typeof nblYoutubeBackendStatus!=='undefined'&&nblYoutubeBackendStatus?'green':'';
    if(typeof nblYoutubeBackendStatus!=='undefined'&&nblYoutubeBackendStatus===null&&!nblYoutubeStatusBusy)setTimeout(()=>nblCheckYoutubeBackendStatus(),0);
    return shell(`<div class="section-title"><div><h2>Cài đặt</h2><div class="subtle">Vivaldi là trình duyệt phát mặc định</div></div></div><div class="card form"><div class="field"><label>Trình duyệt phát</label><div><span class="badge green">Vivaldi</span></div><small class="subtle">Playback Engine bàn giao URL sang Vivaldi; queue/repeat/shuffle không còn nằm rải rác ở nhiều module.</small></div><div class="notice"><b>Cấu hình Vivaldi một lần:</b><br>1) iPhone Settings → Apps → Default Apps → Browser App → Vivaldi.<br>2) Vivaldi → Settings → General → Allow media playback in background = ON.<br>3) Vivaldi → Settings → Privacy and security → Don't open links in external apps = ON.</div><button class="ghost" data-q-action="test-vivaldi">Mở thử YouTube bằng Vivaldi</button><div class="hr"></div><div class="field"><label>YouTube Data API</label><div><span class="badge ${statusClass}">${esc(statusText)}</span></div><small class="subtle">API key nằm ở backend Supabase; PC/iPhone không giữ key.</small></div><button class="ghost" data-action="check-youtube-backend">Kiểm tra lại backend</button><div class="hr"></div><div class="field"><label>Tốc độ nghe ưa thích</label><div class="speedrow">${SPEEDS.map(x=>`<button class="chip ${state.prefs.speed===x?'active':''}" data-speed="${x}">${x}x</button>`).join('')}</div></div><label><input id="remember-speed" type="checkbox" ${state.prefs.rememberSpeed?'checked':''}> Ghi nhớ tốc độ gần nhất đã chọn</label><div class="notice">Video thực tế phát trong Vivaldi/YouTube nên app không thể ép playback speed, EQ hoặc vượt giới hạn Autoplay của YouTube.</div><div class="hr"></div><div class="subtle">Phiên bản 1.7.0 · Unified Playback Engine</div></div>`);
  };

  if(typeof render==='function'){
    const baseRender=render;
    render=function(...args){
      if(view.tab==='queues'){
        app.innerHTML=renderQueues();
        return;
      }
      return baseRender(...args);
    };
  }

  document.addEventListener('click',function(e){
    const renameCard=e.target.closest('[data-q-rename]');
    if(renameCard){e.preventDefault();e.stopImmediatePropagation();const q=state.customPlaylists.find(x=>x.id===renameCard.dataset.qRename);if(q)showRenameQueue(q);return;}

    const open=e.target.closest('[data-q-open]');
    if(open){e.preventDefault();e.stopImmediatePropagation();view.tab='queues';view.queueId=open.dataset.qOpen;render();return;}

    const action=e.target.closest('[data-q-action]')?.dataset.qAction;
    if(action){
      const q=currentQueue();
      if(action==='create'){e.preventDefault();e.stopImmediatePropagation();showCreateQueue();return;}
      if(action==='back'){e.preventDefault();e.stopImmediatePropagation();view.queueId=null;render();return;}
      if(action==='add-videos'&&q){e.preventDefault();e.stopImmediatePropagation();showAddVideos(q);return;}
      if(action==='rename'&&q){e.preventDefault();e.stopImmediatePropagation();showRenameQueue(q);return;}
      if(action==='delete-queue'&&q){
        e.preventDefault();e.stopImmediatePropagation();
        if(confirm(`Xóa danh sách “${q.name}”?`)){
          state.customPlaylists=state.customPlaylists.filter(x=>x.id!==q.id);save();view.queueId=null;render();
        }
        return;
      }
    }

    const remove=e.target.closest('[data-q-remove]');
    if(remove){
      e.preventDefault();e.stopImmediatePropagation();
      const q=currentQueue(),i=Number(remove.dataset.qRemove);
      if(q&&q.videos?.[i]&&confirm(`Xóa “${q.videos[i].title}” khỏi danh sách?`)){
        q.videos.splice(i,1);
        if(q.repeatVideoId&&!q.videos.some(v=>v.videoId===q.repeatVideoId))q.repeatVideoId=null;
        q.updatedAt=new Date().toISOString();save();render();
      }
      return;
    }

    const move=e.target.closest('[data-q-move]');
    if(move){
      e.preventDefault();e.stopImmediatePropagation();
      const q=currentQueue(),i=Number(move.dataset.index),j=move.dataset.qMove==='up'?i-1:i+1;
      if(q&&j>=0&&j<q.videos.length){
        const [v]=q.videos.splice(i,1);q.videos.splice(j,0,v);q.updatedAt=new Date().toISOString();save();render();
      }
    }
  },true);

  let dragIndex=null;
  document.addEventListener('dragstart',e=>{const row=e.target.closest('[data-q-index]');if(row)dragIndex=Number(row.dataset.qIndex);});
  document.addEventListener('dragover',e=>{if(e.target.closest('[data-q-index]'))e.preventDefault();});
  document.addEventListener('drop',e=>{
    const row=e.target.closest('[data-q-index]');
    if(!row||dragIndex===null)return;
    e.preventDefault();
    const q=currentQueue(),target=Number(row.dataset.qIndex);
    if(q&&target!==dragIndex){const [v]=q.videos.splice(dragIndex,1);q.videos.splice(target,0,v);q.updatedAt=new Date().toISOString();save();render();}
    dragIndex=null;
  });

  if(typeof renderSync==='function'){
    const baseRenderSync=renderSync;
    renderSync=function(){
      return baseRenderSync().replace('Phân loại, kênh, playlist và cài đặt','Phân loại, kênh, playlist YouTube, danh sách phát tùy chỉnh và cài đặt');
    };
  }

  render();
})();
