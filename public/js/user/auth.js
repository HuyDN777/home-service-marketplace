document.addEventListener('DOMContentLoaded', () => {
  const notice = document.getElementById('authNotice');
  const show = (text, good) => { notice.textContent = text; notice.className = `notice ${good ? 'success' : 'error'}`; };
  async function post(path, body) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không thể thực hiện yêu cầu');
    return data;
  }
  function bind(id, handler) {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      try { await handler(Object.fromEntries(new FormData(form))); }
      catch (error) { show(error.message || 'Không thể kết nối máy chủ', false); }
      finally { button.disabled = false; }
    });
  }
  bind('loginForm', async body => {
    const result = await post('/api/login', body);
    localStorage.setItem('token', result.token);
    const next = new URLSearchParams(location.search).get('next');
    const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/home';
    show('Đăng nhập thành công. Đang chuyển trang...', true);
    const isAdmin = ['admin', 'super_admin'].includes(result.role);
    location.href = isAdmin
      ? (safeNext.startsWith('/admin/') ? safeNext : '/admin/dashboard')
      : (safeNext.startsWith('/admin/') ? '/home' : safeNext);
  });
  bind('registerForm', async body => { body.avatar_url = ''; const result = await post('/api/register', body); show(result.message || 'Đăng ký thành công', true); setTimeout(() => location.href = '/login', 1100); });
  bind('forgotForm', async body => { const result = await post('/api/user/forgot-password', body); show(result.message || 'Đã gửi OTP', true); setTimeout(() => location.href = `/reset-password?email=${encodeURIComponent(body.email)}`, 800); });
  const reset = document.getElementById('resetForm');
  if (reset) reset.elements.email.value = new URLSearchParams(location.search).get('email') || '';
  bind('resetForm', async body => { const result = await post('/api/user/reset-password', body); show(result.message || 'Đặt lại mật khẩu thành công', true); setTimeout(() => location.href = '/login', 1100); });
});
