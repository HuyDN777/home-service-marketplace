document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('orderForm');
  const serviceSelect = document.getElementById('serviceId');
  const quantity = document.getElementById('quantity');
  const duration = document.getElementById('durationMinutes');
  const date = document.getElementById('implementingDate');
  const start = document.getElementById('startTime');
  const message = document.getElementById('orderMessage');
  const submit = document.getElementById('submitOrder');
  const cashOption = form.querySelector('[name="payment_method"][value="pay_later"]');
  const onlineOption = form.querySelector('[name="payment_method"][value="pay_now"]');
  const minimumLeadMs = 60 * 60 * 1000;
  let services = [];
  const selected = () => services.find(s => String(s.id) === serviceSelect.value);
  let lastServiceId = null;
  const localDate = value => {
    const offset = value.getTimezoneOffset() * 60000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 10);
  };
  const localTime = value => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  function syncScheduleConstraints(adjustValue = false) {
    const earliestRaw = new Date(Date.now() + minimumLeadMs);
    const earliest = new Date(Math.ceil(earliestRaw.getTime() / (5 * 60000)) * (5 * 60000));
    const minimumDate = localDate(earliest);
    const minimumTime = localTime(earliest);
    date.min = minimumDate;
    if (!date.value || date.value < minimumDate) date.value = minimumDate;
    start.min = date.value === minimumDate ? minimumTime : '00:00';
    if (adjustValue && date.value === minimumDate && (!start.value || start.value < minimumTime)) {
      start.value = minimumTime;
    }
  }
  function update() {
    syncScheduleConstraints(true);
    const startAt = date.value && start.value ? new Date(`${date.value}T${start.value}`) : null;
    const tooSoon = !startAt || Number.isNaN(startAt.getTime()) || startAt.getTime() - Date.now() < minimumLeadMs;
    start.setCustomValidity(tooSoon ? 'Vui lòng đặt trước ít nhất 60 phút.' : '');
    const urgent = startAt && !tooSoon && startAt.getTime() - Date.now() <= 2 * 60 * 60 * 1000;
    cashOption.disabled = Boolean(urgent);
    if (urgent) onlineOption.checked = true;
    cashOption.closest('.choice').title = urgent ? 'Đơn trong vòng 2 giờ phải thanh toán online' : '';

    const s = selected();
    if (!s) return;
    const model = s.pricing_model || 'FIXED';
    if (String(s.id) !== lastServiceId) {
      duration.value = String(s.default_duration_minutes || 120);
      quantity.value = '1';
      lastServiceId = String(s.id);
    }
    if (model === 'HOURLY') quantity.value = String(Number(duration.value) / 60);
    if (model === 'FIXED' || model === 'INSPECTION') quantity.value = '1';
    document.getElementById('quantityField').hidden = model !== 'PER_UNIT';
    document.getElementById('unitField').hidden = model !== 'PER_UNIT';
    duration.closest('.form-field').hidden = model === 'INSPECTION';
    document.getElementById('durationLabel').textContent = model === 'HOURLY' ? 'Số giờ thực hiện' : 'Thời gian dự kiến';
    const hints = {
      HOURLY: 'Chi phí được tính theo số giờ bạn chọn.',
      PER_UNIT: `Chi phí được tính theo số ${s.unit || 'đơn vị'}. Thời gian bên dưới dùng để giữ lịch CTV.`,
      FIXED: 'Đây là giá trọn gói. Thời gian bên dưới dùng để giữ lịch CTV.',
      INSPECTION: 'Đây là phí khảo sát/đến nhà, chưa bao gồm công thực hiện và vật tư phát sinh.'
    };
    document.getElementById('pricingHint').textContent = hints[model] || '';
    document.getElementById('summaryName').textContent = s.name;
    document.getElementById('summaryImage').src = CustomerPages.serviceImage(s);
    document.getElementById('summaryImage').alt = s.name;
    document.getElementById('summaryUnitPrice').textContent = model === 'INSPECTION'
      ? `${CustomerPages.money(s.price)} phí khảo sát`
      : model === 'FIXED' ? `${CustomerPages.money(s.price)} trọn gói` : `${CustomerPages.money(s.price)} / ${s.unit || 'lần'}`;
    document.getElementById('unitText').textContent = s.unit || 'lần';
    document.getElementById('summaryQuantity').textContent = model === 'INSPECTION' ? '1 lần khảo sát' : model === 'FIXED' ? '1 gói' : `${quantity.value} ${s.unit || 'lần'}`;
    document.getElementById('summaryTotal').textContent = CustomerPages.money(Number(s.price) * Number(quantity.value || 0));
    document.getElementById('summarySchedule').textContent = date.value ? `${new Date(`${date.value}T${start.value}`).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'})}` : 'Chưa chọn';
  }
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  syncScheduleConstraints(true);
  try {
    services = await CustomerPages.allServices();
    serviceSelect.innerHTML = '<option value="">Chọn dịch vụ</option>' + services.map(s => `<option value="${s.id}">${CustomerPages.escape(s.name)}</option>`).join('');
    const fromUrl = new URLSearchParams(location.search).get('service');
    if (fromUrl && services.some(s => String(s.id) === fromUrl)) serviceSelect.value = fromUrl;
    update();
  } catch { message.textContent = 'Không tải được dịch vụ. Vui lòng thử lại.'; message.className = 'notice error'; }
  [serviceSelect, quantity, duration, date, start].forEach(el => el.addEventListener('input', update));
  setInterval(update, 60000);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    const token = customerAuth.token();
    if (!token) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
    if (!selected()) return;
    const startAt = new Date(`${date.value}T${start.value}`);
    if (startAt.getTime() - Date.now() < minimumLeadMs) { message.textContent = 'Vui lòng chọn giờ thực hiện cách hiện tại ít nhất 60 phút.'; message.className = 'notice error'; return; }
    submit.disabled = true;
    const body = Object.fromEntries(new FormData(form));
    body.quantity = Number(quantity.value);
    body.booking_date = localToday;
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...customerAuth.headers() }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể đặt lịch');
      if (data.paymentUrl) { location.href = data.paymentUrl; return; }
      location.href = `/order-history?new=${data.order.id}`;
    } catch (error) { message.textContent = error.message; message.className = 'notice error'; submit.disabled = false; }
  });
});
