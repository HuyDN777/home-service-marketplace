document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) { window.lucide.createIcons(); document.documentElement.classList.add('has-lucide'); }
  const state = { available: [], schedule: [], history: [], catalog: [], earnings: {}, rejectionStats: {}, profile: null, view: 'available', filter: 'all', selected: null };
  let pendingCashInput = null;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const date = value => value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  const time = value => value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-';
  const day = value => value ? new Date(value).toLocaleDateString('vi-VN', { day: '2-digit' }) : '--';
  const month = value => value ? new Date(value).toLocaleDateString('vi-VN', { month: 'short' }) : '-';
  const labels = { ASSIGNED: 'Đã nhận', IN_PROGRESS: 'Đang làm', WORK_DONE: 'Chờ khách xác nhận', DISPUTED: 'Đang được hỗ trợ', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy' };
  const actionLabels = { claim: 'Nhận việc', start: 'Bắt đầu ca', finish: 'Hoàn tất công việc' };
  const actionFor = item => item.open ? 'claim' : item.status === 'ASSIGNED' ? 'start' : item.status === 'IN_PROGRESS' ? 'finish' : null;
  const icon = name => `<i data-lucide="${name}"></i>`;
  const refreshIcons = () => window.lucide?.createIcons();
  const notify = (message, good = true) => { const el = $('notice'); el.textContent = message; el.className = `notice ${good ? 'success' : 'error'}`; el.hidden = false; if (state.view === 'profile') el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const empty = (iconName, message) => `<div class="empty">${icon(iconName)}${escape(message)}</div>`;
  document.querySelector('#viewHistory .view-head p')?.insertAdjacentHTML('afterend', '<small id="rejectionStats">0 hôm nay · 0 tháng này</small>');

  function showView(name) {
    if (!['available', 'schedule', 'history', 'profile'].includes(name)) name = 'available';
    closeDetail();
    state.view = name;
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('is-active', el.id === `view${name[0].toUpperCase()}${name.slice(1)}`));
    document.querySelectorAll('[data-view]').forEach(el => el.setAttribute('aria-current', el.dataset.view === name ? 'page' : 'false'));
    $('topbarContext').textContent = { available: 'Việc đang mở', schedule: 'Lịch của tôi', history: 'Lịch sử công việc', profile: 'Tài khoản' }[name];
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function jobCard(item) {
    const status = item.open ? 'Việc mở' : labels[item.status] || item.status;
    const badge = item.status === 'IN_PROGRESS' ? 'progress' : item.status === 'WORK_DONE' ? 'done' : '';
    const action = actionFor(item);
    const earning = Number(item.partner_earning || item.expected_earning || 0);
    const earningLabel = item.partner_earning ? 'Đã cộng' : 'Dự kiến';
    const secondaryAction = item.open ? `<button class="button secondary" data-reject-job="${item.id}" type="button">Bỏ qua</button>` : item.status === 'ASSIGNED' ? `<button class="button secondary" data-cancel-job="${item.id}" type="button">Trả ca</button>` : '';
    return `<article class="job"><div class="date-block"><strong>${day(item.start_datetime)}</strong><small>${month(item.start_datetime)}</small></div><div class="job-main"><div class="job-top"><h3>${escape(item.service_name || 'Dịch vụ')}</h3><span class="badge ${badge}">${status}</span></div><div class="job-meta"><span>${icon('clock-3')}${time(item.start_datetime)} - ${time(item.end_datetime)}</span><span class="address">${icon('map-pin')}${escape(item.address || '-')}</span>${earning ? `<span class="earning">${icon('wallet-cards')}${earningLabel}: ${earning.toLocaleString('vi-VN')}đ</span>` : ''}</div></div><div class="job-actions"><button class="button secondary" data-detail="${item.id}" data-kind="${item.open ? 'available' : item.history ? 'history' : 'schedule'}" type="button">Chi tiết</button>${secondaryAction}${action ? `<button class="button" data-action="${action}" data-id="${item.id}" type="button">${actionLabels[action]}</button>` : ''}</div></article>`;
  }

  function render() {
    const query = $('jobSearch').value.trim().toLocaleLowerCase('vi-VN');
    const sorted = state.available.filter(item => `${item.service_name || ''} ${item.address || ''}`.toLocaleLowerCase('vi-VN').includes(query)).sort((a, b) => (new Date(a.start_datetime) - new Date(b.start_datetime)) * ($('jobSort').value === 'later' ? -1 : 1));
    $('availableList').innerHTML = sorted.length ? sorted.map(jobCard).join('') : empty('inbox', 'Chưa có ca phù hợp. Hãy quay lại sau.');
    const mine = state.schedule.filter(item => state.filter === 'all' || item.status === state.filter);
    $('scheduleList').innerHTML = mine.length ? mine.map(jobCard).join('') : empty('calendar-x', 'Chưa có ca trong mục này.');
    $('historyList').innerHTML = state.history.length ? state.history.map(jobCard).join('') : empty('history', 'Bạn chưa có công việc đã hoàn thành hoặc bị hủy.');
    $('availableCount').textContent = state.available.length;
    $('sideAvailableCount').textContent = state.available.length;
    $('upcomingCount').textContent = state.schedule.filter(item => item.status === 'ASSIGNED').length;
    $('progressCount').textContent = state.schedule.filter(item => item.status === 'IN_PROGRESS').length;
    $('walletBalance').textContent = `${Number(state.earnings.partner_balance || 0).toLocaleString('vi-VN')}đ`;
    $('jobEarnings').textContent = `${Number(state.earnings.job_earnings || 0).toLocaleString('vi-VN')}đ`;
    $('platformCommission').textContent = `${Number(state.earnings.platform_commission || 0).toLocaleString('vi-VN')}đ`;
    $('compensationEarnings').textContent = `${Number(state.earnings.cancellation_compensation || 0).toLocaleString('vi-VN')}đ`;
    $('completedJobs').textContent = Number(state.earnings.completed_jobs || 0).toLocaleString('vi-VN');
    if ($('rejectionStats')) $('rejectionStats').textContent = `${Number(state.rejectionStats.rejection_rate_month || 0)}% từ chối tháng này · ${Number(state.rejectionStats.cancelled_this_month || 0)} ca đã trả`;
    refreshIcons();
  }

  async function loadJobs() {
    const quoteForm = $('quoteForm');
    const preserveQuoteDraft = Boolean(quoteForm && (
      quoteForm.elements.diagnosis.value.trim()
      || quoteForm.elements.outcome.value === 'NO_REPAIR'
      || quoteForm.elements.custom_name.value.trim()
      || Number(quoteForm.elements.custom_labor_amount.value) > 0
      || quoteForm.elements.material_name.value.trim()
      || Number(quoteForm.elements.material_amount.value) > 0
      || [...quoteForm.querySelectorAll('[data-catalog-id]')].some(input => Number(input.value) > 0)
    ));
    try {
      const [availableResponse, scheduleResponse, historyResponse, rejectionResponse] = await Promise.all([fetch('/employee/api/jobs/available', { cache: 'no-store' }), fetch('/employee/api/orders', { cache: 'no-store' }), fetch('/employee/api/orders/history', { cache: 'no-store' }), fetch('/employee/api/rejections/stats', { cache: 'no-store' })]);
      if ([availableResponse, scheduleResponse, historyResponse].some(response => response.status === 401)) { location.href = '/employee/login'; return; }
      if (!availableResponse.ok || !scheduleResponse.ok || !historyResponse.ok) throw new Error([availableResponse, scheduleResponse, historyResponse].some(response => response.status === 403) ? 'Tài khoản CTV không còn hoạt động.' : 'Không tải được công việc.');
      state.available = ((await availableResponse.json()).orders || []).map(item => ({ ...item, open: true }));
      state.schedule = ((await scheduleResponse.json()).orders || []).map(item => ({ ...item, open: false }));
      const historyData = await historyResponse.json();
      state.history = (historyData.orders || []).map(item => ({ ...item, open: false, history: true }));
      state.earnings = historyData.summary || {};
      if (rejectionResponse.ok) state.rejectionStats = await rejectionResponse.json();
      render();
      if (state.selected) {
        const updated = [...state.available, ...state.schedule, ...state.history].find(item => item.id === state.selected.id);
        if (updated && preserveQuoteDraft) state.selected = updated;
        else if (updated) openDetail(updated);
        else closeDetail();
      }
    } catch (error) { notify(error.message, false); }
  }

  async function loadCatalog() {
    try {
      const response = await fetch('/employee/api/repair-catalog', { cache: 'no-store' });
      if (response.ok) state.catalog = (await response.json()).items || [];
    } catch { state.catalog = []; }
  }

  function detailRow(label, value) { return `<div class="detail-row"><span>${label}</span><strong>${escape(value || '-')}</strong></div>`; }
  function openDetail(item) {
    state.selected = item;
    $('detailTitle').textContent = item.service_name || 'Công việc';
    const phone = item.customer_phone ? String(item.customer_phone).replace(/[^+0-9]/g, '') : '';
    const earning = Number(item.partner_earning || item.expected_earning || 0);
    $('detailBody').innerHTML = `<div class="detail-section"><h3>Thông tin ca</h3>${detailRow('Mã đơn', `#${item.id}`)}${detailRow('Trạng thái', item.open ? 'Việc đang mở' : labels[item.status] || item.status)}${detailRow('Bắt đầu', date(item.start_datetime))}${detailRow('Kết thúc', date(item.end_datetime))}${detailRow('Địa chỉ', item.address)}${earning ? detailRow(item.partner_earning ? 'Đã nhận' : 'Thu nhập dự kiến', `${earning.toLocaleString('vi-VN')}đ`) : ''}</div>${item.open ? '' : `<div class="detail-section"><h3>Khách hàng</h3>${detailRow('Họ tên', item.customer_name)}${detailRow('Điện thoại', item.customer_phone)}${item.note ? `<h3 style="margin-top:17px">Ghi chú</h3><p class="detail-note">${escape(item.note)}</p>` : ''}</div>`}<div class="detail-section"><h3>Di chuyển</h3><a class="button secondary" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || '')}">${icon('map-pin')}Mở bản đồ</a></div>`;
    if (!item.open && item.payment_method === 'CASH' && ['WORK_DONE', 'COMPLETED'].includes(item.status)) {
      $('detailBody').insertAdjacentHTML('beforeend', `<div class="detail-section cash-confirmation"><div><h3>Thanh toán tiền công</h3><p>${item.cash_collected_at ? 'Đã ghi nhận tiền công khách thanh toán và đối soát ví.' : `Xác nhận sau khi đã nhận đủ ${Number(item.final_amount).toLocaleString('vi-VN')}đ tiền công từ khách. Tiền vật liệu không qua ví nền tảng.`}</p></div><label class="switch-control"><input type="checkbox" role="switch" data-confirm-cash="${item.id}" ${item.cash_collected_at ? 'checked disabled' : ''}><span></span><strong>${item.cash_collected_at ? 'Đã thu tiền công' : 'Xác nhận đã thu'}</strong></label></div>`);
    }
    const needsQuote = item.status === 'IN_PROGRESS' && item.pricing_model === 'INSPECTION' && !Number(item.is_repair);
    if (needsQuote) {
      const catalogRows = state.catalog.map(catalog => `<label class="catalog-row"><span><strong>${escape(catalog.name)}</strong><small>${Number(catalog.labor_price).toLocaleString('vi-VN')}đ / ${escape(catalog.unit)}</small></span><input data-catalog-id="${catalog.id}" type="number" min="0" step="1" value="0" aria-label="Số lượng ${escape(catalog.name)}"></label>`).join('');
      $('detailBody').insertAdjacentHTML('beforeend', `<form id="quoteForm" class="quote-form"><h3>Kết quả khảo sát</h3><label class="field">Chẩn đoán / kết luận<textarea name="diagnosis" maxlength="1000" required placeholder="Mô tả tình trạng và kết luận khảo sát"></textarea></label><div class="inspection-outcome"><label><input type="radio" name="outcome" value="REPAIR_REQUIRED" checked> Cần sửa chữa</label><label><input type="radio" name="outcome" value="NO_REPAIR"> Không cần sửa chữa</label></div><div id="repairQuoteFields"><div class="catalog-list"><h4>Hạng mục theo bảng giá</h4>${catalogRows || '<p class="quote-hint">Dịch vụ này chưa có bảng giá mẫu.</p>'}</div><details class="custom-item"><summary>Thêm hạng mục chưa có trong bảng giá</summary><div class="form-grid"><label class="field">Tên hạng mục<input name="custom_name" placeholder="Mô tả công việc phát sinh"></label><label class="field">Tiền công đề xuất<input name="custom_labor_amount" type="number" min="0" step="1000" value="0"></label></div><p class="quote-hint">Khoản tùy chỉnh sẽ được hiển thị rõ để khách xác nhận.</p></details><div class="form-grid material-fields"><label class="field">Vật liệu phát sinh<input name="material_name" placeholder="Tên vật liệu, quy cách"></label><label class="field">Tổng tiền vật liệu<input name="material_amount" type="number" min="0" step="1000" value="0"></label><label class="field wide">Thời gian sửa dự kiến<select name="estimated_duration_minutes" required><option value="30">30 phút</option><option value="60" selected>1 giờ</option><option value="90">1 giờ 30 phút</option><option value="120">2 giờ</option><option value="180">3 giờ</option><option value="240">4 giờ</option></select></label></div><p class="quote-hint">Đơn giá hạng mục chuẩn do hệ thống quản lý; khách sẽ duyệt toàn bộ báo giá trước khi đặt lịch sửa.</p></div></form>`);
      $('quoteForm').elements.outcome.forEach(radio => radio.addEventListener('change', () => {
        $('repairQuoteFields').hidden = radio.form.elements.outcome.value === 'NO_REPAIR';
      }));
    }
    const action = actionFor(item);
    $('detailActions').innerHTML = `${phone && !item.open ? `<a class="button secondary" href="tel:${phone}">${icon('phone')}Gọi khách</a>` : ''}${action ? `<button class="button" data-action="${action}" data-id="${item.id}" type="button">${actionLabels[action]}</button>` : ''}`;
    $('detailBackdrop').hidden = false;
    $('detailSheet').hidden = false;
    document.body.style.overflow = 'hidden';
    refreshIcons();
    $('closeDetail').focus();
  }
  function closeDetail() {
    state.selected = null;
    $('detailBackdrop').hidden = true;
    $('detailSheet').hidden = true;
    document.body.style.overflow = '';
  }

  async function runAction(button) {
    const { action, id } = button.dataset;
    const path = action === 'claim' ? `/employee/api/jobs/${id}/claim` : `/employee/api/orders/${id}/${action}`;
    button.disabled = true;
    try {
      const selected = [...state.schedule, ...state.available].find(item => String(item.id) === String(id));
      let options = { method: 'PUT' };
      if (action === 'finish' && selected?.pricing_model === 'INSPECTION' && !Number(selected.is_repair)) {
        const form = $('quoteForm');
        if (!form?.reportValidity()) { button.disabled = false; return; }
        const body = Object.fromEntries(new FormData(form));
        body.catalog_items = [...form.querySelectorAll('[data-catalog-id]')].map(input => ({ id: Number(input.dataset.catalogId), quantity: Number(input.value) })).filter(item => item.quantity > 0);
        options = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      }
      const response = await fetch(path, options);
      const data = response.headers.get('content-type')?.includes('application/json')
        ? await response.json() : { error: 'Máy chủ trả về phản hồi không hợp lệ. Vui lòng thử lại.' };
      if (response.status === 401) { location.href = '/employee/login'; return; }
      if (!response.ok) throw new Error(data.error || 'Không thể cập nhật ca');
      notify(data.message || 'Đã cập nhật ca');
      closeDetail();
      await loadJobs();
      if (action === 'claim') showView('schedule');
    } catch (error) { notify(error.message, false); button.disabled = false; }
  }

  function closeCashDialog() {
    $('cashConfirmDialog').hidden = true;
    if (pendingCashInput && !pendingCashInput.disabled) pendingCashInput.checked = false;
    pendingCashInput = null;
  }

  function openCashDialog(input) {
    pendingCashInput = input;
    $('cashConfirmDialog').hidden = false;
    $('cashConfirmSubmit').focus();
  }

  async function confirmCash(input) {
    input.disabled = true;
    try {
      const response = await fetch(`/employee/api/orders/${input.dataset.confirmCash}/confirm-cash`, { method: 'PUT' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể xác nhận thanh toán');
      notify(data.message);
      closeDetail();
      await loadJobs();
    } catch (error) {
      input.checked = false;
      input.disabled = false;
      notify(error.message, false);
    }
  }

  async function loadProfile() {
    try {
      const response = await fetch('/employee/api/profile', { cache: 'no-store' });
      if (!response.ok) throw new Error('Không tải được hồ sơ');
      const { employee } = await response.json();
      state.profile = employee;
      if (!$('acceptingJobs')) {
        document.querySelector('.profile-photo').insertAdjacentHTML('afterend', `<div class="availability-control"><div><strong>Nhận việc mới</strong><span id="availabilityText"></span></div><label class="switch-control"><input id="acceptingJobs" type="checkbox" role="switch"><span></span></label></div>`);
      }
      $('acceptingJobs').checked = Boolean(Number(employee.accepting_jobs));
      $('availabilityText').textContent = $('acceptingJobs').checked ? 'Bạn đang hiển thị công việc phù hợp' : 'Bạn đã tạm dừng nhận việc';
      ['name', 'username', 'email', 'phone', 'address'].forEach(key => { $('profileForm').elements[key].value = employee[key] || ''; });
      $('profileName').textContent = employee.name || 'Cộng tác viên';
      $('profileService').textContent = employee.service_name || 'Cộng tác viên đã duyệt';
      $('profileAvatar').src = employee.profile_image_url || '/images/user/logo.png';
      $('topAvatar').src = employee.profile_image_url || '/images/user/logo.png';
    } catch (error) { notify(error.message, false); }
  }

  async function logout() {
    try { await fetch('/employee/api/logout', { method: 'POST' }); }
    finally { location.href = '/employee/login'; }
  }

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  document.addEventListener('click', event => {
    const detail = event.target.closest('[data-detail]');
    if (detail) { const collection = detail.dataset.kind === 'available' ? state.available : detail.dataset.kind === 'history' ? state.history : state.schedule; const item = collection.find(job => String(job.id) === detail.dataset.detail); if (item) openDetail(item); }
    const action = event.target.closest('[data-action]'); if (action) runAction(action);
    const reject = event.target.closest('[data-reject-job]'); if (reject) updateJobChoice(reject, 'reject');
    const cancel = event.target.closest('[data-cancel-job]'); if (cancel) updateJobChoice(cancel, 'cancel');
  });

  async function updateJobChoice(button, action) {
    button.disabled = true;
    const url = action === 'reject' ? `/employee/api/jobs/${button.dataset.rejectJob}/reject` : `/employee/api/orders/${button.dataset.cancelJob}/cancel`;
    try {
      const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể cập nhật công việc');
      notify(result.message);
      closeDetail();
      await loadJobs();
    } catch (error) {
      notify(error.message, false);
      button.disabled = false;
    }
  }
  document.addEventListener('change', event => {
    const cashSwitch = event.target.closest('[data-confirm-cash]');
    if (cashSwitch?.checked) openCashDialog(cashSwitch);
    if (event.target.id === 'acceptingJobs') {
      const input = event.target;
      input.disabled = true;
      fetch('/employee/api/availability', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accepting_jobs: input.checked }) })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); notify(data.message); return loadProfile(); })
        .catch(error => { input.checked = !input.checked; notify(error.message || 'Không thể cập nhật trạng thái', false); })
        .finally(() => { input.disabled = false; });
    }
  });
  $('cashConfirmDialog').addEventListener('click', event => {
    if (event.target === $('cashConfirmDialog') || event.target.closest('[data-cash-dialog-close]')) closeCashDialog();
  });
  $('cashConfirmSubmit').addEventListener('click', async () => {
    if (!pendingCashInput) return;
    const input = pendingCashInput;
    pendingCashInput = null;
    $('cashConfirmDialog').hidden = true;
    await confirmCash(input);
  });
  $('detailBackdrop').addEventListener('click', closeDetail);
  $('closeDetail').addEventListener('click', closeDetail);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('cashConfirmDialog').hidden) closeCashDialog();
    else if (!$('detailSheet').hidden) closeDetail();
  });
  $('refreshButton').addEventListener('click', () => { loadJobs(); loadProfile(); });
  $('jobSearch').addEventListener('input', render);
  $('jobSort').addEventListener('change', render);
  $('scheduleFilter').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (!button) return; state.filter = button.dataset.filter; $('scheduleFilter').querySelectorAll('button').forEach(el => el.classList.toggle('is-active', el === button)); render(); });
  $('logoutSide').addEventListener('click', logout);
  $('logoutProfile').addEventListener('click', logout);

  $('profileForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type=submit]'); submit.disabled = true;
    try {
      let avatar_url = null;
      const file = $('avatarInput').files[0];
      if (file) { const body = new FormData(); body.append('image', file); const upload = await fetch('/api/upload', { method: 'POST', body }); if (!upload.ok) throw new Error('Không tải được ảnh'); avatar_url = (await upload.json()).imageUrl; }
      const response = await fetch('/employee/api/profile-update', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), avatar_url }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Không lưu được hồ sơ');
      notify(data.message || 'Đã cập nhật hồ sơ'); await loadProfile();
    } catch (error) { notify(error.message, false); }
    finally { submit.disabled = false; }
  });
  $('passwordForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (data.newPassword !== data.confirmPassword) { notify('Mật khẩu xác nhận không khớp', false); return; }
    const submit = form.querySelector('button[type=submit]'); submit.disabled = true;
    try { const response = await fetch('/employee/api/change-password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không đổi được mật khẩu'); notify(result.message || 'Đã đổi mật khẩu'); form.reset(); }
    catch (error) { notify(error.message, false); }
    finally { submit.disabled = false; }
  });

  showView(location.hash.slice(1) || 'available');
  loadCatalog().then(loadJobs); loadProfile();
  let realtimeRefresh;
  window.RealtimeUpdates?.subscribe(update => {
    if (update.type !== 'orders_changed') return;
    clearTimeout(realtimeRefresh);
    realtimeRefresh = setTimeout(loadJobs, 150);
  });
  setInterval(() => { if (!document.hidden) loadJobs(); }, 30000);
});
