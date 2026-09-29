window.customerAuth = {
  token() { return document.cookie.split('; ').find(part => part.startsWith('token='))?.slice(6) || ''; },
  headers() { const token = this.token(); return token ? { Authorization: `Bearer ${token}` } : {}; }
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) { window.lucide.createIcons(); document.documentElement.classList.add('has-lucide'); }
  const path = location.pathname.split('/')[1] || 'home';
  document.querySelector(`[data-nav="${path}"]`)?.setAttribute('aria-current', 'page');
  const menu = document.getElementById('menuButton');
  const nav = document.getElementById('mainNav');
  menu?.addEventListener('click', () => { const open = nav.classList.toggle('is-open'); menu.setAttribute('aria-expanded', String(open)); });

  let requestId = 0;
  function showGuest() {
    document.getElementById('loginRegisterNav').hidden = false;
    document.getElementById('userGreetingNav').hidden = true;
  }
  async function refreshAccount() {
    const id = ++requestId;
    showGuest();
    const token = customerAuth.token();
    if (!token) { localStorage.removeItem('token'); return; }
    try {
      const response = await fetch('/api/user/profile', { headers: customerAuth.headers(), cache: 'no-store' });
      if (!response.ok || customerAuth.token() !== token || id !== requestId) return;
      const { user } = await response.json();
      if (!user || customerAuth.token() !== token || id !== requestId) return;
      document.getElementById('loginRegisterNav').hidden = true;
      document.getElementById('userGreetingNav').hidden = false;
      document.getElementById('greetingText').textContent = user.name || 'Tài khoản';
      document.getElementById('userAvatar').src = user.avatar_url || '/images/user/logo.png';
    } catch { showGuest(); }
  }
  document.querySelector('form[action="/logout"]')?.addEventListener('submit', () => { localStorage.removeItem('token'); showGuest(); });
  window.addEventListener('pageshow', refreshAccount);
  refreshAccount();
});
