const CustomerPages = (() => {
  const money = value => `${Number(value || 0).toLocaleString('vi-VN')}đ`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const serviceImage = service => service.image_url || '/images/user/don_nha.jpg';
  const card = service => `<article class="service-card"><img src="${escape(serviceImage(service))}" alt="${escape(service.name)}" loading="lazy"><div class="service-card-body"><span class="service-category">${escape(service.category || 'Dịch vụ tại nhà')}</span><h3>${escape(service.name)}</h3><p>${escape(service.description || 'Đặt lịch theo thời gian phù hợp với bạn.')}</p><div class="service-card-bottom"><div class="price">${money(service.price)} <small>/ ${escape(service.unit || 'lần')}</small></div><a class="button" href="/order?service=${encodeURIComponent(service.id)}">Đặt lịch</a></div></div></article>`;
  async function allServices() {
    const response = await fetch('/api/services?page=1&pageSize=100', { cache: 'no-store' });
    if (!response.ok) throw new Error('Không tải được dịch vụ');
    return (await response.json()).data || [];
  }
  async function featured() {
    const root = document.getElementById('featuredServices');
    try { const data = await allServices(); root.innerHTML = data.slice(0, 3).map(card).join('') || '<p class="empty-state">Chưa có dịch vụ.</p>'; }
    catch { root.innerHTML = '<p class="empty-state">Không tải được dịch vụ. Vui lòng thử lại.</p>'; }
  }
  async function services() {
    const list = document.getElementById('serviceList');
    const filters = document.getElementById('categoryFilters');
    const paging = document.getElementById('servicePagination');
    let data = [], category = 'all', page = 1;
    const perPage = 9;
    function render() {
      const term = document.getElementById('searchInput').value.trim().toLocaleLowerCase('vi-VN');
      const sort = document.getElementById('sortSelect').value;
      const visible = data.filter(s => (category === 'all' || (s.category || '') === category) && s.name.toLocaleLowerCase('vi-VN').includes(term));
      if (sort === 'price-asc') visible.sort((a, b) => Number(a.price) - Number(b.price));
      if (sort === 'price-desc') visible.sort((a, b) => Number(b.price) - Number(a.price));
      const maxPage = Math.max(1, Math.ceil(visible.length / perPage));
      page = Math.min(page, maxPage);
      list.innerHTML = visible.slice((page - 1) * perPage, page * perPage).map(card).join('') || '<p class="empty-state">Không tìm thấy dịch vụ phù hợp.</p>';
      paging.innerHTML = maxPage > 1 ? `<button data-page="prev" aria-label="Trang trước" ${page === 1 ? 'disabled' : ''}>‹</button><span>Trang ${page} / ${maxPage}</span><button data-page="next" aria-label="Trang sau" ${page === maxPage ? 'disabled' : ''}>›</button>` : '';
    }
    try {
      data = await allServices();
      const categories = [...new Set(data.map(s => s.category).filter(Boolean))];
      filters.innerHTML = `<button class="chip is-active" data-category="all">Tất cả</button>${categories.map(c => `<button class="chip" data-category="${escape(c)}">${escape(c)}</button>`).join('')}`;
      render();
    } catch { list.innerHTML = '<p class="empty-state">Không tải được dịch vụ. Vui lòng thử lại.</p>'; }
    filters.addEventListener('click', e => { const button = e.target.closest('[data-category]'); if (!button) return; category = button.dataset.category; page = 1; filters.querySelectorAll('.chip').forEach(c => c.classList.toggle('is-active', c === button)); render(); });
    paging.addEventListener('click', e => { const button = e.target.closest('[data-page]'); if (!button) return; page += button.dataset.page === 'next' ? 1 : -1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.getElementById('searchInput').addEventListener('input', () => { page = 1; render(); });
    document.getElementById('sortSelect').addEventListener('change', render);
  }
  return { featured, services, allServices, money, escape, serviceImage };
})();
