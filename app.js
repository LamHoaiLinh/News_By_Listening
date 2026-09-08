const APP_VERSION='1.0.0';
const STORAGE_KEY='nbl_state_v1';
const API_KEY_KEY='nbl_youtube_api_key';
const HISTORY_DAYS=3;
const SPEEDS=[1,1.25,1.5,1.75,2];
const DEFAULT_STATE={
  categories:[
    {id:'news',name:'Tin tức'},
    {id:'audio',name:'Truyện Audio'},
    {id:'weather',name:'Dự báo thời tiết'},
    {id:'music',name:'Music'}
  ],
  items:[],
  history:[],
  prefs:{speed:1.5,rememberSpeed:true,openInBrave:true}
};
let state=loadState();
let view={tab:'library',categoryId:null,itemId:null,loading:false};
const app=document.getElementById('app');
const toastEl=document.getElementById('toast');

function clone(x){return JSON.parse(JSON.stringify(x))}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    const s=raw?JSON.parse(raw):clone(DEFAULT_STATE);
    s.categories ||= clone(DEFAULT_STATE.categories); s.items ||= []; s.history ||= []; s.prefs={...DEFAULT_STATE.prefs,...(s.prefs||{})};
    return pruneHistory(s);
  }catch{return clone(DEFAULT_STATE)}
}
function save(){state=pruneHistory(state);localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function pruneHistory(s){const cutoff=Date.now()-HISTORY_DAYS*864e5;s.history=(s.history||[]).filter(x=>new Date(x.openedAt).getTime()>=cutoff);return s}
function uid(prefix='id'){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`}
function esc(v=''){return String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}
function fmtDate(v){try{return new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return ''}}
function relDate(v){const d=new Date(v),days=Math.floor((Date.now()-d)/864e5);if(days<=0)return 'Hôm nay';if(days===1)return 'Hôm qua';if(days<30)return `${days} ngày trước`;return d.toLocaleDateString('vi-VN')}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(window.__tt);window.__tt=setTimeout(()=>toastEl.classList.remove('show'),2500)}
function apiKey(){return localStorage.getItem(API_KEY_KEY)||''}
function isIOS(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)}
function ytThumb(videoId){return videoId?`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`:''}
function parseYouTubeUrl(raw){
  try{
    const u=new URL(raw.trim());
    const host=u.hostname.replace('www.','');
    if(!['youtube.com','m.youtube.com','youtu.be'].includes(host)) throw new Error('Không phải link YouTube');
    if(u.searchParams.get('list')) return {kind:'playlist',playlistId:u.searchParams.get('list'),videoId:u.searchParams.get('v')||null,url:raw.trim()};
    if(host==='youtu.be') return {kind:'video',videoId:u.pathname.slice(1),url:raw.trim()};
    if(u.pathname==='/watch'&&u.searchParams.get('v')) return {kind:'video',videoId:u.searchParams.get('v'),url:raw.trim()};
    const p=decodeURIComponent(u.pathname);
    const mHandle=p.match(/^\/@([^/]+)/); if(mHandle)return {kind:'channel',handle:'@'+mHandle[1],url:raw.trim()};
    const mId=p.match(/^\/channel\/(UC[^/]+)/); if(mId)return {kind:'channel',channelId:mId[1],url:raw.trim()};
    const mUser=p.match(/^\/user\/([^/]+)/); if(mUser)return {kind:'channel',username:mUser[1],url:raw.trim()};
    throw new Error('Hãy dán link kênh dạng @handle, /channel/... hoặc playlist YouTube');
  }catch(e){return {kind:'invalid',error:e.message||'Link không hợp lệ'}}
}
function inferredName(parsed){if(parsed.kind==='playlist')return 'Playlist YouTube';if(parsed.kind==='video')return 'Video YouTube';if(parsed.handle)return parsed.handle.replace('@','');if(parsed.username)return parsed.username;return 'Kênh YouTube'}
async function yt(path,params){
  const key=apiKey(); if(!key) throw new Error('Chưa có YouTube API key. Vào Cài đặt để nhập key.');
  const u=new URL('https://www.googleapis.com/youtube/v3/'+path);Object.entries({...params,key}).forEach(([k,v])=>v!==undefined&&v!==null&&u.searchParams.set(k,v));
  const r=await fetch(u);const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||'YouTube API lỗi');return data;
}
async function resolveItem(item){
  if(item.kind==='playlist'){
    const p=await yt('playlists',{part:'snippet,contentDetails',id:item.playlistId,maxResults:1});
    const x=p.items?.[0]; if(!x) throw new Error('Không tìm thấy playlist hoặc playlist không công khai.');
    item.title=x.snippet.title; item.thumbnail=x.snippet.thumbnails?.medium?.url||x.snippet.thumbnails?.default?.url||''; item.totalVideos=x.contentDetails?.itemCount||0;return item;
  }
  if(item.kind==='channel'){
    const parsed=parseYouTubeUrl(item.url); const params={part:'snippet,contentDetails'};
    if(parsed.channelId)params.id=parsed.channelId; else if(parsed.handle)params.forHandle=parsed.handle; else if(parsed.username)params.forUsername=parsed.username; else throw new Error('Không xác định được kênh.');
    const p=await yt('channels',params);const x=p.items?.[0];if(!x)throw new Error('Không tìm thấy kênh.');
    item.channelId=x.id;item.uploadsPlaylistId=x.contentDetails?.relatedPlaylists?.uploads;item.title=x.snippet.title;item.thumbnail=x.snippet.thumbnails?.medium?.url||x.snippet.thumbnails?.default?.url||'';return item;
  }
  return item;
}
async function loadChannelVideos(item){
  if(!item.uploadsPlaylistId)await resolveItem(item);
  const p=await yt('playlistItems',{part:'snippet,contentDetails',playlistId:item.uploadsPlaylistId,maxResults:30});
  item.videos=(p.items||[]).map(x=>({videoId:x.contentDetails?.videoId||x.snippet?.resourceId?.videoId,title:x.snippet.title,channelTitle:x.snippet.videoOwnerChannelTitle||item.title,thumbnail:x.snippet.thumbnails?.medium?.url||x.snippet.thumbnails?.default?.url||ytThumb(x.contentDetails?.videoId),publishedAt:x.contentDetails?.videoPublishedAt||x.snippet.publishedAt,position:x.snippet.position})).filter(x=>x.videoId);
  item.lastFetchedAt=new Date().toISOString();save();return item.videos;
}
async function loadPlaylistVideos(item){
  let token='',all=[],guard=0;
  do{
    const p=await yt('playlistItems',{part:'snippet,contentDetails',playlistId:item.playlistId,maxResults:50,pageToken:token||undefined});
    all.push(...(p.items||[]).map(x=>({videoId:x.contentDetails?.videoId||x.snippet?.resourceId?.videoId,title:x.snippet.title,channelTitle:x.snippet.videoOwnerChannelTitle||x.snippet.channelTitle,thumbnail:x.snippet.thumbnails?.medium?.url||x.snippet.thumbnails?.default?.url||ytThumb(x.contentDetails?.videoId),publishedAt:x.contentDetails?.videoPublishedAt||x.snippet.publishedAt,position:x.snippet.position})).filter(x=>x.videoId));
    token=p.nextPageToken||'';guard++;
  }while(token&&guard<20);
  item.videos=all;item.lastFetchedAt=new Date().toISOString();save();return all;
}
function watchUrl(item,video,index){
  if(item.kind==='playlist')return `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&list=${encodeURIComponent(item.playlistId)}&index=${Number(index)+1}&autoplay=1`;
  if(item.kind==='channel'&&item.uploadsPlaylistId)return `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&list=${encodeURIComponent(item.uploadsPlaylistId)}&index=${Number(video.position??index)+1}&autoplay=1`;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&autoplay=1`;
}
function recordHistory(video,item,url){state.history.unshift({id:uid('hist'),videoId:video.videoId,title:video.title,channelTitle:video.channelTitle||item.title,thumbnail:video.thumbnail||ytThumb(video.videoId),openedAt:new Date().toISOString(),url});save()}
function openExternal(url){
  const useBrave=state.prefs.openInBrave&&isIOS();
  if(useBrave){
    const scheme=`brave://open-url?url=${encodeURIComponent(encodeURIComponent(url))}`;
    window.location.href=scheme;
    setTimeout(()=>{if(document.visibilityState==='visible')window.location.href=url},1200);
  }else window.open(url,'_blank','noopener');
}
function playVideo(item,video,index){const url=watchUrl(item,video,index);recordHistory(video,item,url);openExternal(url)}
function categoryItems(id){return state.items.filter(x=>x.categoryId===id)}
function nav(){return `<nav class="bottomnav">${[['library','Thư viện'],['history','Đã nghe'],['sync','Đồng bộ'],['settings','Cài đặt']].map(([id,t])=>`<button class="navbtn ${view.tab===id?'active':''}" data-nav="${id}">${t}</button>`).join('')}</nav>`}
function shell(content){return `<div class="shell"><header class="topbar"><div class="brand"><div class="logo">NBL</div><div><h1>News By Listening</h1><p>Chọn nhanh · Mở Brave · Nghe liên tục</p></div></div><span class="badge green">${esc(state.prefs.speed)}x ưa thích</span></header>${content}</div>${nav()}`}
function renderLibrary(){
  if(view.itemId)return renderItem();
  if(view.categoryId)return renderCategory();
  return shell(`<div class="section-title"><div><h2>Phân loại</h2><div class="subtle">Cấp 1 · Có thể thêm, sửa, xóa và sắp xếp</div></div><button class="primary" data-action="add-category">+ Thêm</button></div><div class="grid">${state.categories.map((c,i)=>`<div class="card category-card" data-open-category="${c.id}"><div class="card-actions"><button class="iconbtn" title="Sửa" data-edit-category="${c.id}">Sửa</button></div><div class="category-index">${i+1}. PHÂN LOẠI</div><h3>${esc(c.name)}</h3><div class="count">${categoryItems(c.id).length} kênh / playlist</div></div>`).join('')}</div>${state.categories.length?'':'<div class="empty">Chưa có phân loại.</div>'}`)
}
function renderCategory(){const c=state.categories.find(x=>x.id===view.categoryId);if(!c){view.categoryId=null;return renderLibrary()}const items=categoryItems(c.id);return shell(`<button class="ghost back" data-action="back-library">← Phân loại</button><div class="section-title"><div><h2>${esc(c.name)}</h2><div class="subtle">Cấp 2 · Kênh YouTube hoặc playlist</div></div><button class="primary" data-action="add-item">+ Dán link</button></div><div class="entry-list">${items.map(item=>`<div class="card entry"><img class="thumb" src="${esc(item.thumbnail||'./icon.svg')}" alt=""><div><h3>${esc(item.title)}</h3><div class="meta">${item.kind==='channel'?'Kênh YouTube':item.kind==='playlist'?'Playlist':'Video'}${item.kind==='playlist'&&item.totalVideos!=null?' · '+item.totalVideos+' video':''}</div></div><div class="row-actions"><button class="ghost" data-open-item="${item.id}">Mở</button><button class="iconbtn" data-edit-item="${item.id}">Sửa</button></div></div>`).join('')}</div>${items.length?'':'<div class="empty">Dán link kênh hoặc playlist YouTube để bắt đầu.</div>'}`)
}
function renderItem(){const item=state.items.find(x=>x.id===view.itemId);if(!item){view.itemId=null;return renderCategory()}const videos=item.videos||[];const isChannel=item.kind==='channel';const apiMissing=!apiKey();return shell(`<button class="ghost back" data-action="back-category">← ${esc(state.categories.find(c=>c.id===item.categoryId)?.name||'Thư viện')}</button><div class="card"><div style="display:flex;gap:14px;align-items:center"><img class="thumb" style="width:74px;height:74px" src="${esc(item.thumbnail||'./icon.svg')}" alt=""><div><span class="badge ${isChannel?'green':''}">${isChannel?'Kênh':'Playlist'}</span><h2 style="margin:8px 0 4px">${esc(item.title)}</h2><div class="subtle">Tốc độ ưa thích: ${state.prefs.speed}x${state.prefs.rememberSpeed?' · đang ghi nhớ':''}</div></div></div><div class="toolbar">${isChannel?`<button class="primary" data-action="play-latest">▶ Mở video mới nhất</button><button class="ghost" data-action="refresh-videos">↻ Tải 30 video mới nhất</button>`:`<button class="primary" data-action="play-playlist">▶ Phát từ đầu</button><button class="ghost" data-action="refresh-videos">↻ Tải danh sách playlist</button>`}<button class="ghost" data-action="open-source">Mở trang YouTube</button></div>${apiMissing?`<div class="notice warn">Chưa có YouTube Data API key. App vẫn mở được link trong Brave, nhưng cần API key để hiển thị danh sách video. Nhập một lần ở tab Cài đặt.</div>`:''}</div><div class="section-title"><div><h2>${isChannel?'Video mới nhất':'Video trong playlist'}</h2><div class="subtle">${videos.length?`${videos.length} video · cập nhật ${item.lastFetchedAt?relDate(item.lastFetchedAt):''}`:'Chưa tải danh sách'}</div></div>${view.loading?'<span class="loader"></span>':''}</div><div class="video-list">${videos.map((v,i)=>`<div class="card video"><img class="thumb" src="${esc(v.thumbnail||ytThumb(v.videoId))}" alt=""><div><div class="video-index">#${i+1}</div><h3>${esc(v.title)}</h3><div class="meta">${esc(v.channelTitle||'')} · ${v.publishedAt?relDate(v.publishedAt):''}</div></div><div class="row-actions"><button class="primary" data-play-video="${i}">▶ Nghe từ đây</button></div></div>`).join('')}</div>${videos.length?'':'<div class="empty">Bấm tải danh sách để chọn video cụ thể.</div>'}`)
}
function renderHistory(){const h=state.history;return shell(`<div class="section-title"><div><h2>Đã nghe</h2><div class="subtle">Ghi nhận khi bạn bấm mở video từ app · tự xóa sau ${HISTORY_DAYS} ngày</div></div><button class="ghost" data-action="clear-history">Xóa hết</button></div><div class="entry-list">${h.map(x=>`<div class="card entry"><img class="thumb" src="${esc(x.thumbnail||ytThumb(x.videoId))}" alt=""><div><h3>${esc(x.title)}</h3><div class="meta">${esc(x.channelTitle||'')} · ${fmtDate(x.openedAt)}</div></div><div class="row-actions"><button class="ghost" data-history-open="${x.id}">Mở lại</button></div></div>`).join('')}</div>${h.length?'':'<div class="empty">Chưa có lịch sử trong 3 ngày gần đây.</div>'}`)
}
function syncPayload(includeKey=false){const data={v:1,categories:state.categories,items:state.items.map(({videos,lastFetchedAt,...x})=>x),prefs:state.prefs};if(includeKey)data.apiKey=apiKey();return data}
function encodeSync(obj){const bytes=new TextEncoder().encode(JSON.stringify(obj));let s='';bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function decodeSync(str){let s=str.replaceAll('-','+').replaceAll('_','/');while(s.length%4)s+='=';const bin=atob(s);const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}
function renderSync(){return shell(`<div class="section-title"><div><h2>Đồng bộ PC → iPhone</h2><div class="subtle">Không cần tài khoản hay máy chủ riêng</div></div></div><div class="card form"><div class="notice">Trên PC, tạo phân loại và bookmark xong → bấm <b>Sao chép link đồng bộ</b> → gửi link đó sang iPhone và mở. App trên iPhone sẽ nhập cấu hình.</div><label class="field"><span><input type="checkbox" id="include-key"> Kèm YouTube API key trong link đồng bộ</span><small class="subtle">Chỉ bật khi gửi giữa thiết bị cá nhân; key sẽ nằm trong URL.</small></label><div class="toolbar"><button class="primary" data-action="copy-sync">Sao chép link đồng bộ</button><button class="ghost" data-action="export-json">Tải file JSON</button></div><div class="hr"></div><div class="field"><label>Nhập mã/link đồng bộ</label><textarea id="sync-input" class="input syncbox" placeholder="Dán link hoặc mã đồng bộ ở đây"></textarea></div><button class="ghost" data-action="import-sync">Nhập dữ liệu</button><div class="field"><label>Nhập file JSON</label><input id="json-file" class="input" type="file" accept="application/json,.json"></div></div>`)
}
function renderSettings(){return shell(`<div class="section-title"><div><h2>Cài đặt</h2><div class="subtle">Các thiết lập lưu riêng trên thiết bị này</div></div></div><div class="card form"><div class="field"><label>YouTube Data API key</label><input id="api-key" class="input" type="password" value="${esc(apiKey())}" placeholder="AIza..."><small class="subtle">Dùng để đọc kênh và playlist công khai. Không commit key vào GitHub.</small></div><button class="ghost" data-action="save-api-key">Lưu API key</button><div class="hr"></div><div class="field"><label>Tốc độ nghe ưa thích</label><div class="speedrow">${SPEEDS.map(x=>`<button class="chip ${state.prefs.speed===x?'active':''}" data-speed="${x}">${x}x</button>`).join('')}</div></div><label><input id="remember-speed" type="checkbox" ${state.prefs.rememberSpeed?'checked':''}> Ghi nhớ tốc độ gần nhất đã chọn</label><div class="notice">Tốc độ được News By Listening ghi nhớ để nhắc đúng thói quen. Vì video thực sự phát trong Brave/YouTube, PWA không thể ép trình phát bên ngoài đổi tốc độ hoặc tự EQ/boost âm thanh. Âm lượng vẫn chỉnh bằng iPhone/tai nghe.</div><label><input id="open-brave" type="checkbox" ${state.prefs.openInBrave?'checked':''}> Trên iPhone, ưu tiên mở link bằng Brave</label><div class="hr"></div><div class="subtle">Phiên bản ${APP_VERSION}</div></div>`)
}
function render(){save();app.innerHTML=view.tab==='library'?renderLibrary():view.tab==='history'?renderHistory():view.tab==='sync'?renderSync():renderSettings();bind()}
function modal(html){document.body.insertAdjacentHTML('beforeend',`<div class="modalback" id="modalback"><div class="modal">${html}</div></div>`);document.getElementById('modalback').addEventListener('click',e=>{if(e.target.id==='modalback'||e.target.closest('[data-close-modal]'))document.getElementById('modalback').remove()})}
function categoryModal(c){modal(`<h2>${c?'Sửa phân loại':'Thêm phân loại'}</h2><div class="form"><div class="field"><label>Tên phân loại</label><input class="input" id="cat-name" value="${esc(c?.name||'')}"></div>${c?`<div class="toolbar"><button class="ghost" data-move-cat="up">↑ Lên</button><button class="ghost" data-move-cat="down">↓ Xuống</button><button class="danger" data-delete-cat="${c.id}">Xóa phân loại</button></div>`:''}</div><div class="modal-actions"><button class="ghost" data-close-modal>Hủy</button><button class="primary" data-save-cat="${c?.id||''}">Lưu</button></div>`)}
function itemModal(item){modal(`<h2>${item?'Sửa mục':'Dán link YouTube'}</h2><div class="form"><div class="field"><label>Link YouTube</label><input class="input" id="item-url" value="${esc(item?.url||'')}" placeholder="https://www.youtube.com/@kenh/videos hoặc ...playlist?list=..."></div><div class="field"><label>Tên hiển thị (có thể để trống)</label><input class="input" id="item-title" value="${esc(item?.title||'')}"></div>${item?'<button class="danger" data-delete-item="'+item.id+'">Xóa mục này</button>':''}</div><div class="modal-actions"><button class="ghost" data-close-modal>Hủy</button><button class="primary" data-save-item="${item?.id||''}">Lưu</button></div>`)}
async function refreshCurrent(){const item=state.items.find(x=>x.id===view.itemId);if(!item)return;view.loading=true;render();try{await resolveItem(item);if(item.kind==='channel')await loadChannelVideos(item);else if(item.kind==='playlist')await loadPlaylistVideos(item);save();toast('Đã cập nhật danh sách video')}catch(e){toast(e.message)}finally{view.loading=false;render()}}
function bind(){
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{view.tab=b.dataset.nav;view.categoryId=null;view.itemId=null;render()});
  document.querySelectorAll('[data-open-category]').forEach(el=>el.onclick=e=>{if(e.target.closest('[data-edit-category]'))return;view.categoryId=el.dataset.openCategory;render()});
  document.querySelectorAll('[data-edit-category]').forEach(b=>b.onclick=e=>{e.stopPropagation();categoryModal(state.categories.find(c=>c.id===b.dataset.editCategory))});
  document.querySelectorAll('[data-open-item]').forEach(b=>b.onclick=()=>{view.itemId=b.dataset.openItem;render()});
  document.querySelectorAll('[data-edit-item]').forEach(b=>b.onclick=()=>itemModal(state.items.find(x=>x.id===b.dataset.editItem)));
  document.querySelector('[data-action="add-category"]')?.addEventListener('click',()=>categoryModal(null));
  document.querySelector('[data-action="back-library"]')?.addEventListener('click',()=>{view.categoryId=null;render()});
  document.querySelector('[data-action="back-category"]')?.addEventListener('click',()=>{view.itemId=null;render()});
  document.querySelector('[data-action="add-item"]')?.addEventListener('click',()=>itemModal(null));
  document.querySelector('[data-action="refresh-videos"]')?.addEventListener('click',refreshCurrent);
  document.querySelector('[data-action="open-source"]')?.addEventListener('click',()=>openExternal(state.items.find(x=>x.id===view.itemId).url));
  document.querySelector('[data-action="play-latest"]')?.addEventListener('click',async()=>{let item=state.items.find(x=>x.id===view.itemId);try{if(!(item.videos||[]).length)await refreshCurrent();item=state.items.find(x=>x.id===view.itemId);if(item.videos?.[0])playVideo(item,item.videos[0],0);else openExternal(item.url)}catch{openExternal(item.url)}});
  document.querySelector('[data-action="play-playlist"]')?.addEventListener('click',()=>{const item=state.items.find(x=>x.id===view.itemId);if(item.videos?.[0])playVideo(item,item.videos[0],0);else openExternal(`https://www.youtube.com/playlist?list=${encodeURIComponent(item.playlistId)}`)});
  document.querySelectorAll('[data-play-video]').forEach(b=>b.onclick=()=>{const item=state.items.find(x=>x.id===view.itemId),i=Number(b.dataset.playVideo);playVideo(item,item.videos[i],i)});
  document.querySelector('[data-action="clear-history"]')?.addEventListener('click',()=>{state.history=[];save();render()});
  document.querySelectorAll('[data-history-open]').forEach(b=>b.onclick=()=>{const x=state.history.find(h=>h.id===b.dataset.historyOpen);if(x)openExternal(x.url)});
  document.querySelector('[data-action="save-api-key"]')?.addEventListener('click',()=>{localStorage.setItem(API_KEY_KEY,document.getElementById('api-key').value.trim());toast('Đã lưu API key')});
  document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{state.prefs.speed=Number(b.dataset.speed);state.prefs.rememberSpeed=true;save();render();toast(`Đã ghi nhớ ${state.prefs.speed}x`)});
  document.getElementById('remember-speed')?.addEventListener('change',e=>{state.prefs.rememberSpeed=e.target.checked;save()});
  document.getElementById('open-brave')?.addEventListener('change',e=>{state.prefs.openInBrave=e.target.checked;save()});
  document.querySelector('[data-action="copy-sync"]')?.addEventListener('click',async()=>{const include=document.getElementById('include-key').checked;const code=encodeSync(syncPayload(include));const url=location.origin+location.pathname+'#sync='+code;try{await navigator.clipboard.writeText(url);toast('Đã sao chép link đồng bộ')}catch{document.getElementById('sync-input').value=url;toast('Trình duyệt không cho copy; link đã hiện trong ô')}});
  document.querySelector('[data-action="export-json"]')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify(syncPayload(false),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='news-by-listening-backup.json';a.click();URL.revokeObjectURL(a.href)});
  document.querySelector('[data-action="import-sync"]')?.addEventListener('click',()=>{try{let s=document.getElementById('sync-input').value.trim();if(s.includes('#sync='))s=s.split('#sync=')[1];applyImport(decodeSync(s));toast('Đã nhập dữ liệu')}catch(e){toast('Mã đồng bộ không hợp lệ')}});
  document.getElementById('json-file')?.addEventListener('change',async e=>{try{const obj=JSON.parse(await e.target.files[0].text());applyImport(obj);toast('Đã nhập file JSON')}catch{toast('File JSON không hợp lệ')}});
  document.querySelectorAll('[data-save-cat]').forEach(b=>b.onclick=()=>{const name=document.getElementById('cat-name').value.trim();if(!name)return toast('Nhập tên phân loại');const id=b.dataset.saveCat;if(id)state.categories.find(c=>c.id===id).name=name;else state.categories.push({id:uid('cat'),name});save();document.getElementById('modalback').remove();render()});
  document.querySelectorAll('[data-delete-cat]').forEach(b=>b.onclick=()=>{const id=b.dataset.deleteCat;if(categoryItems(id).length&&!confirm('Phân loại đang có mục bên trong. Xóa cả các mục?'))return;state.categories=state.categories.filter(c=>c.id!==id);state.items=state.items.filter(x=>x.categoryId!==id);save();document.getElementById('modalback').remove();view.categoryId=null;render()});
  document.querySelectorAll('[data-move-cat]').forEach(b=>b.onclick=()=>{const id=document.querySelector('[data-save-cat]').dataset.saveCat;const i=state.categories.findIndex(c=>c.id===id),j=b.dataset.moveCat==='up'?i-1:i+1;if(j>=0&&j<state.categories.length){[state.categories[i],state.categories[j]]=[state.categories[j],state.categories[i]];save();document.getElementById('modalback').remove();categoryModal(state.categories.find(c=>c.id===id));render()}});
  document.querySelectorAll('[data-save-item]').forEach(b=>b.onclick=()=>{const url=document.getElementById('item-url').value.trim(),parsed=parseYouTubeUrl(url);if(parsed.kind==='invalid')return toast(parsed.error);const title=document.getElementById('item-title').value.trim()||inferredName(parsed);const id=b.dataset.saveItem;if(id){const x=state.items.find(x=>x.id===id);Object.assign(x,{url,title,kind:parsed.kind,playlistId:parsed.playlistId||null,channelId:parsed.channelId||null,handle:parsed.handle||null,username:parsed.username||null,videos:[]})}else state.items.push({id:uid('item'),categoryId:view.categoryId,url,title,kind:parsed.kind,playlistId:parsed.playlistId||null,channelId:parsed.channelId||null,handle:parsed.handle||null,username:parsed.username||null,thumbnail:'',videos:[]});save();document.getElementById('modalback').remove();render()});
  document.querySelectorAll('[data-delete-item]').forEach(b=>b.onclick=()=>{state.items=state.items.filter(x=>x.id!==b.dataset.deleteItem);save();document.getElementById('modalback').remove();view.itemId=null;render()});
}
function applyImport(obj){if(!obj||!Array.isArray(obj.categories)||!Array.isArray(obj.items))throw new Error('bad');state.categories=obj.categories;state.items=obj.items.map(x=>({...x,videos:[]}));state.prefs={...state.prefs,...(obj.prefs||{})};if(obj.apiKey)localStorage.setItem(API_KEY_KEY,obj.apiKey);save();location.hash='';view={tab:'library',categoryId:null,itemId:null,loading:false};render()}
function checkHashImport(){if(location.hash.startsWith('#sync=')){try{const obj=decodeSync(location.hash.slice(6));if(confirm('Nhập cấu hình News By Listening từ thiết bị khác?')){applyImport(obj);toast('Đã đồng bộ cấu hình')}}catch{toast('Link đồng bộ không hợp lệ')}}}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
render();setTimeout(checkHashImport,50);
