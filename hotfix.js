// Dynamic modal action bindings (v1.0.1)
// Modals are inserted after app.js bind() has already run, so use event delegation.
document.addEventListener('click', (e) => {
  const saveItemBtn = e.target.closest('[data-save-item]');
  if (saveItemBtn) {
    e.preventDefault();
    const urlInput = document.getElementById('item-url');
    const titleInput = document.getElementById('item-title');
    if (!urlInput) return;
    const url = urlInput.value.trim();
    const parsed = parseYouTubeUrl(url);
    if (parsed.kind === 'invalid') return toast(parsed.error);
    const title = (titleInput?.value || '').trim() || inferredName(parsed);
    const id = saveItemBtn.dataset.saveItem;
    if (id) {
      const x = state.items.find(x => x.id === id);
      if (!x) return toast('Không tìm thấy mục cần sửa');
      Object.assign(x, {
        url,
        title,
        kind: parsed.kind,
        playlistId: parsed.playlistId || null,
        channelId: parsed.channelId || null,
        handle: parsed.handle || null,
        username: parsed.username || null,
        uploadsPlaylistId: null,
        thumbnail: x.thumbnail || '',
        totalVideos: null,
        videos: [],
        lastFetchedAt: null
      });
    } else {
      if (!view.categoryId) return toast('Hãy chọn một phân loại trước');
      state.items.push({
        id: uid('item'),
        categoryId: view.categoryId,
        url,
        title,
        kind: parsed.kind,
        playlistId: parsed.playlistId || null,
        channelId: parsed.channelId || null,
        handle: parsed.handle || null,
        username: parsed.username || null,
        uploadsPlaylistId: null,
        thumbnail: '',
        videos: []
      });
    }
    save();
    document.getElementById('modalback')?.remove();
    render();
    toast(id ? 'Đã cập nhật' : 'Đã lưu link YouTube');
    return;
  }

  const deleteItemBtn = e.target.closest('[data-delete-item]');
  if (deleteItemBtn) {
    e.preventDefault();
    const id = deleteItemBtn.dataset.deleteItem;
    if (!confirm('Xóa mục này?')) return;
    state.items = state.items.filter(x => x.id !== id);
    save();
    document.getElementById('modalback')?.remove();
    view.itemId = null;
    render();
    toast('Đã xóa mục');
    return;
  }

  const saveCatBtn = e.target.closest('[data-save-cat]');
  if (saveCatBtn) {
    e.preventDefault();
    const input = document.getElementById('cat-name');
    const name = (input?.value || '').trim();
    if (!name) return toast('Nhập tên phân loại');
    const id = saveCatBtn.dataset.saveCat;
    if (id) {
      const c = state.categories.find(c => c.id === id);
      if (!c) return toast('Không tìm thấy phân loại');
      c.name = name;
    } else {
      state.categories.push({ id: uid('cat'), name });
    }
    save();
    document.getElementById('modalback')?.remove();
    render();
    toast(id ? 'Đã cập nhật phân loại' : 'Đã thêm phân loại');
    return;
  }

  const deleteCatBtn = e.target.closest('[data-delete-cat]');
  if (deleteCatBtn) {
    e.preventDefault();
    const id = deleteCatBtn.dataset.deleteCat;
    if (categoryItems(id).length && !confirm('Phân loại đang có mục bên trong. Xóa cả các mục?')) return;
    state.categories = state.categories.filter(c => c.id !== id);
    state.items = state.items.filter(x => x.categoryId !== id);
    save();
    document.getElementById('modalback')?.remove();
    view.categoryId = null;
    view.itemId = null;
    render();
    toast('Đã xóa phân loại');
    return;
  }

  const moveCatBtn = e.target.closest('[data-move-cat]');
  if (moveCatBtn) {
    e.preventDefault();
    const saveBtn = document.querySelector('#modalback [data-save-cat]');
    const id = saveBtn?.dataset.saveCat;
    const i = state.categories.findIndex(c => c.id === id);
    const j = moveCatBtn.dataset.moveCat === 'up' ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < state.categories.length) {
      [state.categories[i], state.categories[j]] = [state.categories[j], state.categories[i]];
      save();
      document.getElementById('modalback')?.remove();
      render();
      categoryModal(state.categories.find(c => c.id === id));
    }
  }
});
