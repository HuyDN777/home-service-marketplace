document.addEventListener('DOMContentLoaded', () => {
  const notice = document.getElementById('authNotice');
  const show = (text, good) => { notice.textContent = text; notice.className = `notice ${good ? 'success' : 'error'}`; notice.hidden = false; };
  const section = id => { ['loginSection', 'forgotSection', 'resetSection'].forEach(name => { const el = document.getElementById(name); if (el) el.hidden = name !== id; }); notice.hidden = true; };
  let resetEmail = '';
  document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => section(button.dataset.section)));
  async function post(path, data) {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Không thể thực hiện yêu cầu');
    return result;
  }
  function bind(id, handler) {
    const form = document.getElementById(id); if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault(); const button = form.querySelector('button[type=submit]'); button.disabled = true;
      try { await handler(Object.fromEntries(new FormData(form))); }
      catch (error) { show(error.message || 'Không kết nối được máy chủ', false); }
      finally { button.disabled = false; }
    });
  }
  bind('loginForm', async data => { await post('/employee/api/login', data); show('Đăng nhập thành công', true); location.href = '/employee'; });
  bind('registerForm', async data => { const result = await post('/employee/api/register', data); show(result.message || 'Đăng ký thành công. Vui lòng chờ duyệt.', true); document.getElementById('registerForm').reset(); });
  bind('forgotForm', async data => { resetEmail = data.email; const result = await post('/employee/api/forgot-password', data); section('resetSection'); show(result.message || 'Đã gửi OTP', true); });
  bind('resetForm', async data => { const result = await post('/employee/api/reset-password', { ...data, email: resetEmail }); section('loginSection'); show(result.message || 'Đã đặt lại mật khẩu', true); });
});
