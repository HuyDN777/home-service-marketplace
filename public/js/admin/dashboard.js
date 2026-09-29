document.addEventListener('DOMContentLoaded', async () => {
  const labels = { PENDING: 'Chờ CTV nhận', OFFERED: 'Offer cũ', ASSIGNED: 'Đã nhận', IN_PROGRESS: 'Đang làm', WORK_DONE: 'Chờ khách xác nhận', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', EXPIRED: 'Không tìm được CTV' };
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const get = async path => { const response = await fetch(path); if (!response.ok) throw new Error('Không tải được thống kê'); return (await response.json()).data || []; };
  const bars = (id, rows, label, value, format = number => Number(number).toLocaleString('vi-VN')) => {
    const root = document.getElementById(id);
    if (!rows.length) { root.innerHTML = '<p>Chưa có dữ liệu.</p>'; return; }
    const max = Math.max(1, ...rows.map(row => Number(row[value]) || 0));
    root.innerHTML = rows.map(row => `<div class="bar-item"><span title="${safe(label(row))}">${safe(label(row))}</span><div class="bar-track"><i style="width:${Math.max(3, Number(row[value]) / max * 100)}%"></i></div><strong>${safe(format(row[value]))}</strong></div>`).join('');
  };
  try {
    const [statuses, services, revenue] = await Promise.all([get('/admin/statistics/orders'), get('/admin/statistics/popular-services'), get('/admin/statistics/revenue')]);
    const count = key => statuses.find(row => row.status === key)?.total_orders || 0;
    document.getElementById('metricPending').textContent = Number(count('PENDING')).toLocaleString('vi-VN');
    document.getElementById('metricAssigned').textContent = Number(count('ASSIGNED')).toLocaleString('vi-VN');
    document.getElementById('metricProgress').textContent = Number(count('IN_PROGRESS')).toLocaleString('vi-VN');
    document.getElementById('metricCompleted').textContent = Number(count('COMPLETED')).toLocaleString('vi-VN');
    bars('statusBars', statuses, row => labels[row.status] || row.status, 'total_orders');
    bars('serviceBars', services, row => row.service_name, 'total_orders');
    bars('revenueBars', revenue.slice(-8), row => row.month, 'total_revenue', value => `${Math.round(Number(value) / 1000).toLocaleString('vi-VN')}k`);
  } catch (error) { const el = document.getElementById('dashboardNotice'); el.hidden = false; el.textContent = error.message; }
});
