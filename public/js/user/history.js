document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('ordersList');
  const paging = document.getElementById('orderPagination');
  const notice = document.getElementById('pageNotice');
  const debtNotice = document.getElementById('debtNotice');
  const cancelDialog = document.getElementById('cancelDialog');
  const cancelForm = document.getElementById('cancelOrderForm');
  const cancelReason = document.getElementById('cancelReason');
  const cancelSubmit = document.getElementById('cancelSubmit');
  const cancelPolicy = document.getElementById('cancelPolicy');
  const actionDialog = document.getElementById('actionDialog');
  const actionDialogTitle = document.getElementById('actionDialogTitle');
  const actionDialogMessage = document.getElementById('actionDialogMessage');
  const actionDialogSubmit = document.getElementById('actionDialogSubmit');
  const labels = { PENDING: 'Chờ CTV nhận', OFFERED: 'Chờ CTV nhận', ASSIGNED: 'CTV đã nhận', IN_PROGRESS: 'Đang thực hiện', WORK_DONE: 'Chờ bạn xác nhận', DISPUTED: 'Đang được hỗ trợ', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', EXPIRED: 'Không tìm được CTV' };
  const paymentLabels = { UNPAID: 'Chưa thanh toán', PENDING: 'Đang xử lý', PAID: 'Đã thanh toán', FAILED: 'Thanh toán lỗi', PENDING_REFUND: 'Đang chờ hoàn tiền', REFUND_FAILED: 'Hoàn tiền chưa thành công', REFUNDED: 'Đã hoàn tiền' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const date = value => value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  const renderFeedback = feedback => {
    if (!feedback) return '';
    const rating = Math.max(1, Math.min(5, Number(feedback.rating) || 1));
    return `<section class="customer-feedback"><div class="customer-feedback-head"><strong>Đánh giá của bạn</strong><span class="feedback-stars" aria-label="${rating} trên 5 sao">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span></div><p>${esc(feedback.comment)}</p>${feedback.admin_reply ? `<div class="admin-reply"><span>Phản hồi từ Dọn Nhà Vui</span><p>${esc(feedback.admin_reply)}</p></div>` : ''}</section>`;
  };
  let orders = [], filter = 'all', page = 1, selectedOrder = null, dialogTrigger = null, pendingAction = null;
  const pageSize = 6;
  function closeCancelDialog() {
    cancelDialog.hidden = true;
    document.body.classList.remove('dialog-open');
    selectedOrder = null;
    dialogTrigger?.focus();
  }
  function openCancelDialog(order, trigger) {
    selectedOrder = order;
    dialogTrigger = trigger;
    cancelForm.reset();
    document.getElementById('cancelOrderName').textContent = `Đơn #${order.id} · ${order.service_name}`;
    document.getElementById('cancelOrderTime').textContent = date(order.start_datetime);
    const late = order.status === 'ASSIGNED' && new Date(order.start_datetime).getTime() - Date.now() <= 2 * 60 * 60 * 1000;
    cancelPolicy.classList.toggle('no-fee', !late);
    if (late) {
      cancelPolicy.textContent = order.payment_method === 'ONLINE'
        ? 'Ca đã có CTV nhận và còn dưới 2 giờ. Phí hủy dự kiến là 20%; 80% số tiền đã thanh toán sẽ được gửi yêu cầu hoàn qua VNPAY.'
        : 'Ca đã có CTV nhận và còn dưới 2 giờ. Phí hủy dự kiến là 20% giá trị đơn và sẽ được ghi nhận vào tài khoản của bạn.';
    } else {
      cancelPolicy.textContent = order.payment_method === 'ONLINE'
        ? 'Đơn này được miễn phí hủy. Toàn bộ số tiền đã thanh toán sẽ được gửi yêu cầu hoàn qua VNPAY.'
        : 'Đơn này được miễn phí hủy.';
    }
    cancelDialog.hidden = false;
    document.body.classList.add('dialog-open');
    cancelReason.focus();
  }
  function closeActionDialog() {
    actionDialog.hidden = true;
    document.body.classList.remove('dialog-open');
    pendingAction?.trigger?.focus();
    pendingAction = null;
  }
  function openActionDialog({ title, message, confirmText, danger = false, trigger, run }) {
    pendingAction = { trigger, run };
    actionDialogTitle.textContent = title;
    actionDialogMessage.textContent = message;
    actionDialogSubmit.textContent = confirmText;
    actionDialogSubmit.classList.toggle('button-danger', danger);
    actionDialog.hidden = false;
    document.body.classList.add('dialog-open');
    actionDialogSubmit.focus();
  }
  function render() {
    const visible = orders.filter(o => filter === 'all' || (filter === 'done' ? ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(o.status) : !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(o.status)));
    const pages = Math.max(1, Math.ceil(visible.length / pageSize));
    page = Math.min(page, pages);
    list.innerHTML = visible.slice((page - 1) * pageSize, page * pageSize).map(o => `<article class="order-row"><div class="order-row-head"><div><small>ĐƠN #${o.id}</small><h2>${esc(o.service_name)}</h2></div><span class="status-badge status-${esc(o.status)}">${labels[o.status] || esc(o.status)}</span></div><div class="order-details"><div>Thời gian<strong>${date(o.start_datetime)}</strong></div><div>Địa chỉ<strong>${esc(o.address || '-')}</strong></div><div>CTV<strong>${esc(o.employee_name || 'Chưa có người nhận')}</strong></div><div>Thanh toán<strong>${paymentLabels[o.payment_status] || esc(o.payment_status)}</strong></div>${o.employee_phone ? `<div>Liên hệ CTV<strong>${esc(o.employee_phone)}</strong></div>` : ''}${Number(o.cancellation_fee) ? `<div>Phí hủy<strong>${Number(o.cancellation_fee).toLocaleString('vi-VN')}đ · ${o.cancellation_fee_status === 'UNPAID' ? 'Chưa thanh toán' : 'Đã ghi nhận'}</strong></div>` : ''}${Number(o.refund_amount) ? `<div>Tiền hoàn<strong>${Number(o.refund_amount).toLocaleString('vi-VN')}đ</strong></div>` : ''}${o.note ? `<div>Ghi chú<strong>${esc(o.note)}</strong></div>` : ''}</div>${o.dispute_reason ? `<div class="admin-reply"><span>Yêu cầu hỗ trợ</span><p>${esc(o.dispute_reason)}</p>${o.dispute_admin_note ? `<p><strong>Phản hồi:</strong> ${esc(o.dispute_admin_note)}</p>` : ''}</div>` : ''}<div class="order-actions">${['PENDING', 'OFFERED', 'ASSIGNED'].includes(o.status) ? `<button class="button button-outline" data-cancel="${o.id}">Hủy đơn</button>` : ''}${o.status === 'WORK_DONE' ? `<button class="button" data-confirm="${o.id}">Xác nhận hoàn thành</button><button class="button button-outline" data-dispute="${o.id}">Yêu cầu hỗ trợ</button>` : ''}${o.payment_status === 'PENDING_REFUND' ? `<button class="button button-outline" data-refund-status="${o.id}">Kiểm tra hoàn tiền</button>` : ''}${o.status === 'COMPLETED' && !o.feedback ? `<button class="button button-outline" data-review="${o.id}">Đánh giá</button>` : ''}</div>${renderFeedback(o.feedback)}</article>`).join('') || '<div class="empty-state">Chưa có đơn trong mục này. <a href="/services">Khám phá dịch vụ</a></div>';
    paging.innerHTML = pages > 1 ? `<button data-page="prev" ${page === 1 ? 'disabled' : ''}>‹</button><span>Trang ${page} / ${pages}</span><button data-page="next" ${page === pages ? 'disabled' : ''}>›</button>` : '';
    enhanceQuotes(visible.slice((page - 1) * pageSize, page * pageSize));
  }
  function enhanceQuotes(pageOrders) {
    pageOrders.forEach(order => {
      if (!order.quote_status) return;
      const row = [...list.querySelectorAll('.order-row')].find(el => el.querySelector('small')?.textContent.includes(`#${order.id}`));
      if (!row) return;
      if (order.quote_status === 'PENDING') row.querySelector('[data-confirm]')?.remove();
      const total = Number(order.labor_amount) + Number(order.material_amount);
      const noRepairNeeded = order.quote_status === 'NOT_REQUIRED';
      const itemRows = (order.quote_items || []).map(item => `<div class="quote-line"><span>${esc(item.item_name)} <small>${Number(item.quantity)} ${esc(item.unit)}</small>${item.item_type === 'CUSTOM' ? '<em>Phát sinh</em>' : ''}</span><strong>${Number(item.line_total).toLocaleString('vi-VN')}đ</strong></div>`).join('');
      row.insertAdjacentHTML('beforeend', `<section class="quote-summary"><h3>${noRepairNeeded ? 'Kết quả khảo sát' : 'Báo giá sửa chữa'}</h3><p>${esc(order.quote_diagnosis)}</p>${noRepairNeeded ? '<p class="no-repair-result">CTV kết luận hiện tại không cần sửa chữa.</p>' : `<div class="quote-lines">${itemRows}</div><div class="quote-costs"><span>Tiền công <strong>${Number(order.labor_amount).toLocaleString('vi-VN')}đ</strong></span><span>Vật liệu <strong>${Number(order.material_amount).toLocaleString('vi-VN')}đ</strong></span><span>Tổng cộng <strong>${total.toLocaleString('vi-VN')}đ</strong></span><span>Thời gian dự kiến <strong>${Number(order.estimated_duration_minutes)} phút</strong></span></div>${Number(order.requires_review) ? '<p class="quote-warning">Báo giá có hạng mục ngoài bảng giá tiêu chuẩn. Vui lòng kiểm tra kỹ trước khi đồng ý.</p>' : ''}${order.quote_status === 'PENDING' ? `<form class="quote-response" data-quote-order="${order.id}"><label class="form-field">Chọn thời điểm sửa<input name="start_datetime" type="datetime-local" required></label><div><button class="button button-outline" type="button" data-quote-reject="${order.id}">Từ chối</button><button class="button" type="submit">Đồng ý và đặt lịch sửa</button></div></form>` : `<p class="hint">${order.quote_status === 'ACCEPTED' ? `Đã chấp nhận · Ca sửa #${order.repair_order_id}` : 'Đã từ chối báo giá'}</p>`}`}</section>`);
      if (!noRepairNeeded && Number(order.material_amount) > 0) {
        row.querySelector('.quote-costs')?.insertAdjacentHTML('afterend', '<p class="hint">Tiền vật liệu thanh toán trực tiếp cho CTV.</p>');
      }
      const quoteForm = row.querySelector('.quote-response');
      if (quoteForm) {
        const actions = quoteForm.lastElementChild;
        actions.insertAdjacentHTML('beforebegin', `<fieldset class="choice-row"><legend>Thanh toán ca sửa chữa</legend><label class="choice"><input type="radio" name="payment_method" value="CASH" checked><span>Tiền mặt sau khi hoàn thành</span></label><label class="choice"><input type="radio" name="payment_method" value="ONLINE"><span>Thanh toán ngay qua VNPay</span></label></fieldset><p class="hint payment-rule">Ca bắt đầu trong vòng 2 giờ chỉ hỗ trợ thanh toán online.</p>`);
      }
      const scheduleInput = row.querySelector('.quote-response input[type="datetime-local"]');
      if (scheduleInput) {
        const earliest = new Date(Date.now() + 60 * 60000);
        scheduleInput.min = new Date(earliest.getTime() - earliest.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const syncPaymentPolicy = () => {
          const form = scheduleInput.form;
          const cash = form.querySelector('[name="payment_method"][value="CASH"]');
          const online = form.querySelector('[name="payment_method"][value="ONLINE"]');
          const startTime = new Date(scheduleInput.value).getTime();
          const onlineOnly = Number.isFinite(startTime) && startTime - Date.now() <= 2 * 60 * 60 * 1000;
          cash.disabled = onlineOnly;
          if (onlineOnly) online.checked = true;
        };
        scheduleInput.addEventListener('change', syncPaymentPolicy);
      }
    });
  }
  async function load() {
    if (!customerAuth.token()) { location.href = `/login?next=${encodeURIComponent('/order-history')}`; return; }
    try {
      const response = await fetch('/api/user/orders/history?page=1&pageSize=100', { headers: customerAuth.headers(), cache: 'no-store' });
      if (!response.ok) throw new Error('Không tải được đơn hàng');
      orders = (await response.json()).orders || [];
      render();
    } catch (error) { list.innerHTML = `<p class="empty-state">${esc(error.message)}</p>`; }
  }
  async function loadDebt() {
    try {
      const response = await fetch('/api/user/debt', { headers: customerAuth.headers(), cache: 'no-store' });
      if (!response.ok) return;
      const debt = await response.json();
      debtNotice.innerHTML = debt.amount > 0
        ? `<section class="debt-notice"><div><strong>Phí hủy chưa thanh toán</strong><span>${Number(debt.amount).toLocaleString('vi-VN')}đ</span><p>Thanh toán khoản này để tiếp tục đặt dịch vụ.</p></div><button class="button" type="button" id="payDebt">Thanh toán</button></section>`
        : '';
    } catch (_) {
      debtNotice.innerHTML = '';
    }
  }
  const query = new URLSearchParams(location.search);
  if (query.has('new')) { notice.textContent = 'Đã đăng việc thành công. Đơn đang chờ CTV phù hợp nhận ca.'; notice.className = 'notice success'; }
  if (query.has('debtPaid')) { notice.textContent = 'Đã thanh toán phí hủy.'; notice.className = 'notice success'; }
  debtNotice.addEventListener('click', async event => {
    const button = event.target.closest('#payDebt');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Đang chuyển...';
    try {
      const response = await fetch('/api/user/debt/pay', { method: 'POST', headers: customerAuth.headers() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể tạo giao dịch');
      location.href = result.paymentUrl;
    } catch (error) {
      notice.textContent = error.message;
      notice.className = 'notice error';
      button.disabled = false;
      button.textContent = 'Thanh toán';
    }
  });
  document.getElementById('statusFilters').addEventListener('click', event => { const button = event.target.closest('[data-status]'); if (!button) return; filter = button.dataset.status; page = 1; document.querySelectorAll('#statusFilters .chip').forEach(chip => chip.classList.toggle('is-active', chip === button)); render(); });
  paging.addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (!button) return; page += button.dataset.page === 'next' ? 1 : -1; render(); });
  list.addEventListener('click', async event => {
    const confirmButton = event.target.closest('[data-confirm]');
    const cancelButton = event.target.closest('[data-cancel]');
    const reviewButton = event.target.closest('[data-review]');
    const refundButton = event.target.closest('[data-refund-status]');
    const disputeButton = event.target.closest('[data-dispute]');
    if (disputeButton) {
      const row = disputeButton.closest('.order-row');
      row.querySelector('.order-actions').innerHTML = `<form class="dispute-form" data-id="${disputeButton.dataset.dispute}"><label class="review-comment"><span>Mô tả vấn đề</span><textarea name="reason" minlength="10" maxlength="500" required placeholder="Cho chúng tôi biết điều gì chưa ổn"></textarea></label><div class="review-actions"><button class="button button-outline" type="button" data-dispute-cancel>Quay lại</button><button class="button" type="submit">Gửi yêu cầu</button></div></form>`;
      row.querySelector('textarea').focus();
      return;
    }
    if (event.target.closest('[data-dispute-cancel]')) { render(); return; }
    if (cancelButton) {
      const order = orders.find(item => Number(item.id) === Number(cancelButton.dataset.cancel));
      if (order) openCancelDialog(order, cancelButton);
      return;
    }
    if (confirmButton) {
      openActionDialog({
        title: 'Xác nhận hoàn thành',
        message: 'Bạn xác nhận công việc đã được hoàn tất đúng yêu cầu?',
        confirmText: 'Xác nhận hoàn thành',
        trigger: confirmButton,
        run: async () => {
          const response = await fetch(`/api/user/orders/${confirmButton.dataset.confirm}/confirm`, { method: 'PUT', headers: customerAuth.headers() });
          const result = await response.json();
          notice.textContent = result.message || result.error;
          notice.className = `notice ${response.ok ? 'success' : 'error'}`;
          if (response.ok) await load();
        }
      });
      return;
    }
    if (refundButton) {
      const lastCheck = Number(sessionStorage.getItem(`refund-check-${refundButton.dataset.refundStatus}`) || 0);
      if (Date.now() - lastCheck < 2 * 60 * 1000) {
        notice.textContent = 'VNPAY đang xử lý. Bạn có thể kiểm tra lại sau 2 phút.';
        notice.className = 'notice success';
        return;
      }
      refundButton.disabled = true;
      refundButton.textContent = 'Đang kiểm tra...';
      try {
        const response = await fetch(`/api/user/orders/${refundButton.dataset.refundStatus}/refund-status`, { method: 'PUT', headers: customerAuth.headers() });
        const result = await response.json();
        notice.textContent = result.message || result.error;
        notice.className = `notice ${response.ok ? 'success' : 'error'}`;
        if (response.ok && result.refund?.status !== 'COMPLETED') {
          sessionStorage.setItem(`refund-check-${refundButton.dataset.refundStatus}`, String(Date.now()));
        }
        await load();
      } catch (error) {
        notice.textContent = 'Chưa kết nối được VNPAY. Vui lòng thử lại sau.';
        notice.className = 'notice error';
        refundButton.disabled = false;
        refundButton.textContent = 'Kiểm tra hoàn tiền';
      }
    }
    if (reviewButton) {
      const row = reviewButton.closest('.order-row');
      row.querySelector('.order-actions').innerHTML = `<form class="review-form" data-id="${reviewButton.dataset.review}"><fieldset class="star-rating"><legend>Chất lượng dịch vụ</legend>${[5, 4, 3, 2, 1].map(value => `<input id="rating-${reviewButton.dataset.review}-${value}" name="rating" type="radio" value="${value}" ${value === 5 ? 'checked' : ''}><label for="rating-${reviewButton.dataset.review}-${value}" title="${value} sao"><span aria-hidden="true">★</span><span class="sr-only">${value} sao</span></label>`).join('')}</fieldset><label class="review-comment"><span>Nhận xét của bạn</span><textarea name="comment" placeholder="Chia sẻ trải nghiệm của bạn" maxlength="500" required></textarea></label><div class="review-actions"><button class="button button-outline" type="button" data-review-cancel>Quay lại</button><button class="button" type="submit">Gửi đánh giá</button></div></form>`;
      row.querySelector('.review-form textarea').focus();
      return;
    }
    if (event.target.closest('[data-review-cancel]')) {
      render();
    }
  });
  cancelDialog.addEventListener('click', event => {
    if (event.target === cancelDialog || event.target.closest('[data-dialog-close]')) closeCancelDialog();
  });
  actionDialog.addEventListener('click', event => {
    if (event.target === actionDialog || event.target.closest('[data-action-dialog-close]')) closeActionDialog();
  });
  actionDialogSubmit.addEventListener('click', async () => {
    if (!pendingAction) return;
    const run = pendingAction.run;
    actionDialogSubmit.disabled = true;
    try { closeActionDialog(); await run(); }
    finally { actionDialogSubmit.disabled = false; }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!actionDialog.hidden) closeActionDialog();
    else if (!cancelDialog.hidden) closeCancelDialog();
  });
  cancelForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedOrder) return;
    cancelSubmit.disabled = true;
    cancelSubmit.textContent = 'Đang hủy...';
    try {
      const response = await fetch(`/api/user/orders/${selectedOrder.id}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...customerAuth.headers() },
        body: JSON.stringify({ reason: cancelReason.value.trim() })
      });
      const result = await response.json();
      notice.textContent = result.message || result.error;
      notice.className = `notice ${response.ok ? 'success' : 'error'}`;
      if (response.ok) {
        closeCancelDialog();
        await load();
        notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      notice.textContent = 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
      notice.className = 'notice error';
    } finally {
      cancelSubmit.disabled = false;
      cancelSubmit.textContent = 'Xác nhận hủy';
    }
  });
  list.addEventListener('submit', async event => {
    const disputeForm = event.target.closest('.dispute-form');
    if (disputeForm) {
      event.preventDefault();
      const response = await fetch(`/api/user/orders/${disputeForm.dataset.id}/dispute`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...customerAuth.headers() }, body: JSON.stringify({ reason: disputeForm.elements.reason.value.trim() }) });
      const result = await response.json();
      notice.textContent = result.message || result.error;
      notice.className = `notice ${response.ok ? 'success' : 'error'}`;
      if (response.ok) await load();
      return;
    }
    const quoteForm = event.target.closest('.quote-response');
    if (quoteForm) {
      event.preventDefault();
      const submit = quoteForm.querySelector('button[type=submit]'); submit.disabled = true;
      const formData = new FormData(quoteForm);
      const response = await fetch(`/api/user/orders/${quoteForm.dataset.quoteOrder}/quote`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...customerAuth.headers() }, body: JSON.stringify({ decision: 'ACCEPTED', start_datetime: formData.get('start_datetime'), payment_method: formData.get('payment_method') }) });
      const result = await response.json();
      if (response.ok && result.paymentUrl) { location.href = result.paymentUrl; return; }
      notice.textContent = result.message || result.error; notice.className = `notice ${response.ok ? 'success' : 'error'}`; if (response.ok) await load(); else submit.disabled = false;
      return;
    }
    const form = event.target.closest('.review-form'); if (!form) return;
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', ...customerAuth.headers() }, body: JSON.stringify({ order_id: Number(form.dataset.id), rating: Number(body.rating), comment: body.comment }) });
    const result = await response.json(); notice.textContent = result.message || result.error; notice.className = `notice ${response.ok ? 'success' : 'error'}`; if (response.ok) await load();
  });
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-quote-reject]');
    if (!button) return;
    openActionDialog({
      title: 'Từ chối báo giá',
      message: 'Báo giá sửa chữa sẽ bị từ chối và đơn khảo sát được kết thúc. Bạn vẫn có thể đặt một dịch vụ khác sau đó.',
      confirmText: 'Từ chối báo giá',
      danger: true,
      trigger: button,
      run: async () => {
        const response = await fetch(`/api/user/orders/${button.dataset.quoteReject}/quote`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...customerAuth.headers() }, body: JSON.stringify({ decision: 'REJECTED' }) });
        const result = await response.json(); notice.textContent = result.message || result.error; notice.className = `notice ${response.ok ? 'success' : 'error'}`; if (response.ok) await load();
      }
    });
  });
  let realtimeRefresh;
  const hasInteractiveDraft = () => {
    const quoteSchedule = list.querySelector('.quote-response input[name="start_datetime"]');
    const review = list.querySelector('.review-form');
    return Boolean(
      (quoteSchedule && quoteSchedule.value)
      || (review && (review.elements.comment.value.trim() || review.elements.rating.value !== '5'))
      || !cancelDialog.hidden
    );
  };
  window.RealtimeUpdates?.subscribe(update => {
    if (update.type !== 'orders_changed') return;
    clearTimeout(realtimeRefresh);
    realtimeRefresh = setTimeout(() => { if (!hasInteractiveDraft()) load(); }, 150);
  });
  load();
  loadDebt();
});
