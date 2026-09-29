document.addEventListener('DOMContentLoaded', () => {
  const page = document.querySelector('[data-page]')?.dataset.page;
  const ui = window.adminUi;
  const json = (url, method, body) => ui.json(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const run = async (button, action) => { if (button) button.disabled = true; try { await action(); location.reload(); } catch (error) { ui.notice(error.message, false); if (button) button.disabled = false; } };

  if (page === 'employees') {
    document.querySelectorAll('[data-partner-id]').forEach(button => button.addEventListener('click', async () => {
      if (button.dataset.partnerAction === 'suspend' && !await ui.confirm('Tạm khóa CTV này?', 'Tạm khóa')) return;
      run(button, () => ui.json(`/admin/employees/${button.dataset.partnerId}/${button.dataset.partnerAction}`, { method: 'PUT' }));
    }));
    document.getElementById('employeeForm').addEventListener('submit', event => { event.preventDefault(); const form = event.target; run(form.querySelector('button[type=submit]'), async () => {
      const file = form.elements.image.files[0];
      const body = { ...Object.fromEntries(new FormData(form)), profile_image_url: await ui.upload(file) };
      delete body.image;
      await json('/admin/employees/add', 'POST', body);
    }); });
  }

  if (page === 'services') {
    const form = document.getElementById('serviceForm');
    const dialog = document.getElementById('serviceDialog');
    form.elements.description.closest('label').insertAdjacentHTML('beforebegin', `<label class="form-field">Cách tính giá<select name="pricing_model" required><option value="HOURLY">Theo giờ</option><option value="PER_UNIT">Theo số lượng</option><option value="FIXED">Trọn gói</option><option value="INSPECTION">Phí khảo sát</option></select></label><label class="form-field">Thời lượng mặc định (phút)<input name="default_duration_minutes" type="number" min="30" step="30" value="120" required></label>`);
    const pricingData = fetch('/api/services?page=1&pageSize=100', { cache: 'no-store' }).then(response => response.json()).then(result => result.data || []).catch(() => []);
    document.getElementById('newService').addEventListener('click', () => { form.reset(); form.elements.id.value = ''; form.elements.existingImage.value = ''; form.elements.pricing_model.value = 'FIXED'; form.elements.default_duration_minutes.value = '120'; document.getElementById('serviceDialogTitle').textContent = 'Thêm dịch vụ'; });
    document.querySelectorAll('[data-edit-service]').forEach(button => button.addEventListener('click', async () => {
      form.reset();
      for (const key of ['id','name','price','unit','description','Categoryid']) form.elements[key].value = button.dataset[key === 'Categoryid' ? 'category' : key] || '';
      const pricing = (await pricingData).find(item => String(item.id) === String(button.dataset.id));
      form.elements.pricing_model.value = pricing?.pricing_model || 'FIXED';
      form.elements.default_duration_minutes.value = pricing?.default_duration_minutes || 120;
      form.elements.existingImage.value = button.dataset.image || '';
      document.getElementById('serviceDialogTitle').textContent = 'Sửa dịch vụ';
      dialog.showModal();
    }));
    form.addEventListener('submit', event => { event.preventDefault(); run(form.querySelector('button[type=submit]'), async () => {
      const fields = Object.fromEntries(new FormData(form));
      const image_url = form.elements.image.files[0] ? await ui.upload(form.elements.image.files[0]) : fields.existingImage;
      if (fields.id) await json(`/admin/services/${fields.id}`, 'PUT', { name: fields.name, price: Number(fields.price), unit: fields.unit, pricing_model: fields.pricing_model, default_duration_minutes: Number(fields.default_duration_minutes), description: fields.description, Categoryid: fields.Categoryid, image_url });
      else await json('/admin/services/add', 'POST', { serviceName: fields.name, servicePrice: Number(fields.price), serviceUnit: fields.unit, pricing_model: fields.pricing_model, default_duration_minutes: Number(fields.default_duration_minutes), serviceDescription: fields.description, serviceCategory: fields.Categoryid, image_url });
    }); });
  }

  if (page === 'categories') {
    const form = document.getElementById('categoryForm');
    const dialog = document.getElementById('categoryDialog');
    document.getElementById('newCategory').addEventListener('click', () => { form.reset(); form.elements.id.value = ''; document.getElementById('categoryDialogTitle').textContent = 'Thêm danh mục'; });
    document.querySelectorAll('[data-edit-category]').forEach(button => button.addEventListener('click', () => { form.elements.id.value = button.dataset.id; form.elements.name.value = button.dataset.name; form.elements.description.value = button.dataset.description; document.getElementById('categoryDialogTitle').textContent = 'Sửa danh mục'; dialog.showModal(); }));
    form.addEventListener('submit', event => { event.preventDefault(); run(form.querySelector('button[type=submit]'), async () => {
      const body = Object.fromEntries(new FormData(form));
      if (body.id) await json(`/admin/categories/${body.id}`, 'PUT', { name: body.name, description: body.description });
      else await json('/admin/categories/add', 'POST', { name: body.name, description: body.description });
    }); });
    document.querySelectorAll('[data-delete-category]').forEach(button => button.addEventListener('click', async () => { if (!await ui.confirm('Xóa danh mục này?', 'Xóa danh mục')) return; run(button, () => ui.json(`/admin/categories/${button.dataset.deleteCategory}`, { method: 'DELETE' })); }));
  }

  if (page === 'coupons') {
    const form = document.getElementById('couponForm');
    form.addEventListener('submit', event => { event.preventDefault(); run(form.querySelector('button[type=submit]'), async () => {
      const body = Object.fromEntries(new FormData(form));
      if (new Date(body.end_date) <= new Date(body.start_date)) throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
      body.start_date = body.start_date.replace('T', ' ');
      body.end_date = body.end_date.replace('T', ' ');
      await json('/admin/coupons/add', 'POST', body);
    }); });
    document.querySelectorAll('[data-delete-coupon]').forEach(button => button.addEventListener('click', async () => { if (!await ui.confirm('Xóa mã giảm giá này?', 'Xóa mã')) return; run(button, () => ui.json(`/admin/coupons/${button.dataset.deleteCoupon}`, { method: 'DELETE' })); }));
  }

  if (page === 'feedback') {
    document.querySelectorAll('[data-reply-id]').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); run(form.querySelector('button[type=submit]'), () => json(`/admin/feedback/${form.dataset.replyId}/reply`, 'PUT', { admin_reply: form.elements.admin_reply.value.trim() })); }));
  }

  if (page === 'disputes') {
    document.querySelectorAll('[data-dispute-order]').forEach(group => group.addEventListener('click', async event => {
      const button = event.target.closest('[data-dispute-decision]');
      if (!button) return;
      const decision = button.dataset.disputeDecision;
      const label = decision === 'COMPLETE' ? 'Chốt hoàn thành' : 'Yêu cầu làm lại';
      if (!await ui.confirm(`${label} đơn #${group.dataset.disputeOrder}?`, label)) return;
      run(button, () => json(`/admin/orders/${group.dataset.disputeOrder}/dispute`, 'PUT', { decision }));
    }));
  }
});
