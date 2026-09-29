document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();
  const adminNav = document.querySelector('.admin-sidebar nav');
  if (adminNav && !adminNav.querySelector('a[href="/admin/disputes"]')) {
    adminNav.insertAdjacentHTML('beforeend', '<a href="/admin/disputes"><i data-lucide="badge-help"></i>Yêu cầu hỗ trợ</a>');
    window.lucide?.createIcons();
  }
  const path = location.pathname;
  const active = document.querySelector(`.admin-sidebar nav a[href="${path}"]`);
  active?.setAttribute('aria-current', 'page');
  document.getElementById('adminTopTitle').textContent = active?.textContent.trim() || 'Quản trị';
  document.getElementById('adminToday').textContent = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' });
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menu = document.getElementById('adminMenuButton');
  const close = () => { sidebar.classList.remove('is-open'); overlay.hidden = true; menu.setAttribute('aria-expanded', 'false'); };
  menu.addEventListener('click', () => { const open = sidebar.classList.toggle('is-open'); overlay.hidden = !open; menu.setAttribute('aria-expanded', String(open)); });
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.querySelectorAll('[data-open-dialog]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.openDialog)?.showModal()));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
  let realtimeReload;
  window.RealtimeUpdates?.subscribe(update => {
    if (update.type !== 'orders_changed' || !['/admin/dashboard', '/admin/orders', '/admin/bills', '/admin/disputes'].includes(location.pathname)) return;
    clearTimeout(realtimeReload);
    realtimeReload = setTimeout(() => {
      if (!document.querySelector('dialog[open]') && !document.hidden) location.reload();
    }, 400);
  });
});

window.adminUi = {
  confirm(message, confirmText = 'Xác nhận') {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'dialog';
      dialog.innerHTML = `<div class="dialog-header"><h2>Xác nhận thao tác</h2><button class="icon-button" type="button" data-cancel aria-label="Đóng"><i data-lucide="x"></i></button></div><div style="padding:20px"><p style="margin:0;color:var(--muted);line-height:1.6"></p><div class="dialog-actions"><button class="button secondary" type="button" data-cancel>Quay lại</button><button class="button danger" type="button" data-confirm></button></div></div>`;
      dialog.querySelector('p').textContent = message;
      dialog.querySelector('[data-confirm]').textContent = confirmText;
      const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
      dialog.querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', () => finish(false)));
      dialog.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      document.body.appendChild(dialog);
      dialog.showModal();
      window.lucide?.createIcons();
    });
  },
  notice(text, good = true) { const el = document.getElementById('pageNotice'); if (!el) return; el.textContent = text; el.className = `notice ${good ? 'success' : 'error'}`; el.hidden = false; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  async json(url, options = {}) { const response = await fetch(url, options); const type = response.headers.get('content-type') || ''; const data = type.includes('application/json') ? await response.json() : { error: await response.text() }; if (!response.ok) throw new Error(data.error || data.message || 'Không thể thực hiện thao tác'); return data; },
  async upload(file) { if (!file) return ''; const body = new FormData(); body.append('image', file); const response = await fetch('/api/upload', { method: 'POST', body }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Không tải được ảnh'); return data.imageUrl; }
};
