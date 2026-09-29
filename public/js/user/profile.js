document.addEventListener('DOMContentLoaded', async () => {
  const profile = document.getElementById('profileForm');
  const password = document.getElementById('passwordForm');
  const avatarInput = document.getElementById('avatarInput');
  const avatar = document.getElementById('profileAvatar');
  const show = (id, text, good) => { const el = document.getElementById(id); el.hidden = false; el.textContent = text; el.className = `notice ${good ? 'success' : 'error'}`; };
  if (!customerAuth.token()) { location.href = '/login?next=%2Fprofile'; return; }
  try {
    const response = await fetch('/api/user/profile', { headers: customerAuth.headers() });
    if (!response.ok) throw new Error('Không tải được hồ sơ');
    const { user } = await response.json();
    avatar.src = user.avatar_url || '/images/user/logo.png';
    ['name','username','email','phone','address'].forEach(key => { profile.elements[key].value = user[key] || ''; });
  } catch (error) { show('profileNotice', error.message, false); }
  avatarInput.onchange = async () => {
    const file = avatarInput.files[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
      show('avatarNotice', 'Chọn ảnh JPG, PNG hoặc WebP tối đa 5 MB', false);
      avatarInput.value = '';
      return;
    }
    const preview = URL.createObjectURL(file);
    const previous = avatar.src;
    avatar.src = preview;
    avatarInput.disabled = true;
    const body = new FormData();
    body.append('image', file);
    try {
      const response = await fetch('/api/user/avatar', { method: 'POST', headers: customerAuth.headers(), body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể tải ảnh lên');
      avatar.src = result.avatar_url;
      const headerAvatar = document.getElementById('userAvatar');
      if (headerAvatar) headerAvatar.src = result.avatar_url;
      show('avatarNotice', 'Đã cập nhật ảnh đại diện', true);
    } catch (error) {
      avatar.src = previous;
      show('avatarNotice', error.message, false);
    } finally {
      URL.revokeObjectURL(preview);
      avatarInput.disabled = false;
      avatarInput.value = '';
    }
  };
  profile.onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(profile));
    const response = await fetch('/api/user/profile-update', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...customerAuth.headers() }, body: JSON.stringify(data) });
    const result = await response.json(); show('profileNotice', result.message || result.error, response.ok);
  };
  password.onsubmit = async event => {
    event.preventDefault();
    const response = await fetch('/api/user/change-password', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...customerAuth.headers() }, body: JSON.stringify(Object.fromEntries(new FormData(password))) });
    const result = await response.json(); show('passwordNotice', result.message || result.error, response.ok); if (response.ok) password.reset();
  };
});
