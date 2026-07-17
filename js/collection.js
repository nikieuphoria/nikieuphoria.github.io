(() => {
  const app = document.getElementById('collection-app');
  if (!app || app.dataset.ready === 'true') return;
  app.dataset.ready = 'true';

  const PAGE_SIZE = 60;
  const state = {
    items: [],
    type: app.dataset.defaultType || 'all',
    status: 'all',
    query: '',
    year: String(new Date().getFullYear()),
    selectedDate: '',
    visible: PAGE_SIZE
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  const primaryLink = item => item.links?.[0]?.url || '#';
  const isCompleted = item => item.status === '读过' || item.status === '看过';
  const displayType = type => type === 'book' ? '书籍' : '电影';

  function filteredItems({ ignoreYear = false } = {}) {
    const query = state.query.trim().toLocaleLowerCase();
    return state.items.filter(item => {
      if (state.type !== 'all' && item.type !== state.type) return false;
      if (state.status !== 'all' && item.status !== state.status) return false;
      if (state.selectedDate && item.marked_at !== state.selectedDate) return false;
      if (!ignoreYear && state.year !== 'all' && item.marked_at && !item.marked_at.startsWith(state.year)) return false;
      if (query) {
        const haystack = [item.title, item.original_title, ...(item.creator || [])].join(' ').toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }).sort((a, b) => (b.marked_at || '').localeCompare(a.marked_at || '') || a.title.localeCompare(b.title, 'zh-CN'));
  }

  function allYears() {
    return [...new Set(state.items.map(item => item.marked_at?.slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  }

  function statusOptions() {
    if (state.type === 'book') return ['all', '读过', '在读', '想读'];
    if (state.type === 'movie') return ['all', '看过', '在看', '想看'];
    return ['all', '读过', '在读', '想读', '看过', '在看', '想看'];
  }

  function renderShell() {
    const totalBooks = state.items.filter(item => item.type === 'book').length;
    const totalMovies = state.items.filter(item => item.type === 'movie').length;
    const completed = state.items.filter(isCompleted).length;
    const years = allYears();
    if (!years.includes(state.year)) state.year = years[0] || 'all';

    app.innerHTML = `
      <section class="collection-hero">
        <div>
          <p class="collection-kicker">Personal archive</p>
          <h1 class="collection-heading">书架与影库</h1>
          <p class="collection-description">记录读过、看过，以及仍在等待相遇的作品。封面来自外部链接，条目不会进入博客文章归档。</p>
        </div>
        <div class="collection-stats">
          <div class="collection-stat"><strong>${totalBooks}</strong><span>书籍</span></div>
          <div class="collection-stat"><strong>${totalMovies}</strong><span>电影</span></div>
          <div class="collection-stat"><strong>${completed}</strong><span>已完成</span></div>
        </div>
      </section>
      <section class="collection-panel">
        <div class="collection-panel-head">
          <h2 class="collection-panel-title">标记热力图</h2>
          <select class="collection-year-select" aria-label="选择年份">
            ${years.map(year => `<option value="${year}"${year === state.year ? ' selected' : ''}>${year}</option>`).join('')}
          </select>
        </div>
        <div class="collection-heatmap-wrap"><div class="collection-heatmap" aria-label="年度标记热力图"></div></div>
        <div class="collection-legend"><span>少</span>${[0,1,2,3,4].map(level => `<i class="collection-day" data-level="${level}"></i>`).join('')}<span>多</span></div>
      </section>
      <div class="collection-toolbar">
        <select class="collection-control collection-type" aria-label="选择类型">
          <option value="all">全部类型</option><option value="book">书籍</option><option value="movie">电影</option>
        </select>
        <select class="collection-control collection-status-filter" aria-label="选择状态"></select>
        <input class="collection-search" type="search" placeholder="搜索名称、作者或导演" aria-label="搜索书影音">
      </div>
      <div class="collection-results-head"><span class="collection-result-count"></span><button class="collection-clear-date" hidden>清除日期筛选</button></div>
      <div class="collection-grid"></div>
      <button class="collection-load-more" hidden>加载更多</button>`;

    app.querySelector('.collection-type').value = state.type;
    renderStatusOptions();
    bindEvents();
    renderAll();
  }

  function renderStatusOptions() {
    const select = app.querySelector('.collection-status-filter');
    const options = statusOptions();
    if (!options.includes(state.status)) state.status = 'all';
    select.innerHTML = options.map(status => `<option value="${status}">${status === 'all' ? '全部状态' : status}</option>`).join('');
    select.value = state.status;
  }

  function bindEvents() {
    app.querySelector('.collection-year-select').addEventListener('change', event => {
      state.year = event.target.value; state.selectedDate = ''; state.visible = PAGE_SIZE; renderAll();
    });
    app.querySelector('.collection-type').addEventListener('change', event => {
      state.type = event.target.value; state.status = 'all'; state.visible = PAGE_SIZE; renderStatusOptions(); renderAll();
    });
    app.querySelector('.collection-status-filter').addEventListener('change', event => {
      state.status = event.target.value; state.visible = PAGE_SIZE; renderAll();
    });
    app.querySelector('.collection-search').addEventListener('input', event => {
      state.query = event.target.value; state.visible = PAGE_SIZE; renderCards();
    });
    app.querySelector('.collection-clear-date').addEventListener('click', () => {
      state.selectedDate = ''; state.visible = PAGE_SIZE; renderAll();
    });
    app.querySelector('.collection-load-more').addEventListener('click', () => {
      state.visible += PAGE_SIZE; renderCards();
    });
  }

  function renderHeatmap() {
    const heatmap = app.querySelector('.collection-heatmap');
    const year = Number(state.year);
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const counts = new Map();
    state.items.forEach(item => {
      if (!item.marked_at?.startsWith(state.year)) return;
      if (state.type !== 'all' && item.type !== state.type) return;
      if (state.status !== 'all' && item.status !== state.status) return;
      counts.set(item.marked_at, (counts.get(item.marked_at) || 0) + 1);
    });
    const max = Math.max(1, ...counts.values());
    const cells = [];
    for (let pad = 0; pad < start.getDay(); pad++) cells.push('<span></span>');
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const count = counts.get(key) || 0;
      const level = count ? Math.max(1, Math.ceil((count / max) * 4)) : 0;
      cells.push(`<button class="collection-day${state.selectedDate === key ? ' is-selected' : ''}" data-date="${key}" data-level="${level}" title="${key} · ${count} 条" aria-label="${key}，${count} 条"></button>`);
    }
    heatmap.innerHTML = cells.join('');
    heatmap.querySelectorAll('[data-date]').forEach(cell => cell.addEventListener('click', () => {
      state.selectedDate = cell.dataset.date; state.visible = PAGE_SIZE; renderAll();
    }));
  }

  function renderCards() {
    const items = filteredItems();
    const grid = app.querySelector('.collection-grid');
    const visibleItems = items.slice(0, state.visible);
    app.querySelector('.collection-result-count').textContent = `${state.year} · ${items.length} 条记录${state.selectedDate ? ` · ${state.selectedDate}` : ''}`;
    const clearDate = app.querySelector('.collection-clear-date');
    clearDate.hidden = !state.selectedDate;
    if (!visibleItems.length) {
      grid.innerHTML = '<div class="collection-empty">这组筛选条件下还没有记录。</div>';
    } else {
      grid.innerHTML = visibleItems.map(item => {
        const creators = (item.creator || []).join('、');
        const meta = [creators, item.year].filter(Boolean).join(' · ');
        return `<article class="collection-card">
          <a class="collection-cover-link" data-placeholder="${escapeHtml(item.title)}" href="${escapeHtml(primaryLink(item))}" target="_blank" rel="noopener noreferrer">
            <img class="collection-cover" src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer">
            <span class="collection-status">${escapeHtml(item.status)}</span>
          </a>
          <h3 class="collection-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
          ${item.original_title ? `<p class="collection-card-original" title="${escapeHtml(item.original_title)}">${escapeHtml(item.original_title)}</p>` : ''}
          <p class="collection-card-meta" title="${escapeHtml(meta)}">${escapeHtml(meta || displayType(item.type))}</p>
          <p class="collection-card-date">${escapeHtml(item.marked_at || '日期未记录')}</p>
        </article>`;
      }).join('');
      grid.querySelectorAll('.collection-cover').forEach(image => image.addEventListener('error', () => image.classList.add('is-broken'), { once: true }));
    }
    app.querySelector('.collection-load-more').hidden = state.visible >= items.length;
  }

  function renderAll() {
    renderHeatmap();
    renderCards();
  }

  const loadCollectionFile = (url, optional = false) => fetch(url)
    .then(response => {
      if (!response.ok && optional) return { books: [], movies: [] };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });

  Promise.all([
    loadCollectionFile('/data/douban-collection.json'),
    loadCollectionFile('/data/manual-collection.json', true)
  ])
    .then(([douban, manual]) => {
      const merged = new Map();
      [...(douban.books || []), ...(douban.movies || []), ...(manual.books || []), ...(manual.movies || [])]
        .forEach(item => merged.set(`${item.type}:${item.id}`, item));
      state.items = [...merged.values()];
      renderShell();
    })
    .catch(() => {
      app.innerHTML = '<div class="collection-empty">书影音数据暂时没有加载成功，请稍后刷新。</div>';
    });
})();
