// dashboard-physical.js - Physical Print-on-Demand logic
document.addEventListener('DOMContentLoaded', () => {
  
  const apiFetch = async (url, options = {}) => {
    // same as your dashboard.js version
    const customOptions = { ...options };
    if (!(customOptions.body instanceof FormData)) {
        customOptions.headers = { ...(customOptions.headers || {}), 'Content-Type': 'application/json' };
    }
    const response = await fetch(url, { credentials: 'same-origin', ...customOptions });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(payload.error || `Failed ${response.status}`);
    return payload;
  };

  // Hook into publish form to add is_physical
  const publishForm = document.getElementById('publish-master-form');
  const physicalCheck = document.getElementById('is-physical-check'); // you add this checkbox in HTML
  const printUploadGroup = document.getElementById('print-upload-group');

  if (physicalCheck && printUploadGroup) {
    physicalCheck.addEventListener('change', (e) => {
      printUploadGroup.classList.toggle('hidden', !e.target.checked);
    });
  }

  // Upload print file after book is created
  window.uploadPrintFile = async function(bookId) {
    const fileInput = document.getElementById('print-pdf-file');
    if (!fileInput || !fileInput.files[0]) return alert('Select print-ready PDF');

    const fd = new FormData();
    fd.append('bookId', bookId);
    fd.append('printFile', fileInput.files[0]);
    fd.append('fileType', 'interior');

    try {
      const res = await apiFetch('/api/print-files/upload', { method: 'POST', body: fd });
      alert('Print file uploaded. Status: pending approval');
      console.log(res);
    } catch (err) { alert(err.message); }
  };

  // Sample Order button handler (added to your book cards)
  window.orderSampleCopy = async function(bookId) {
    if (!confirm('Order sample copy? You will pay book price + shipping. This is 50% refundable if you handle shipping manually?')) return;
    // For now just open checkout with is_physical flag
    try {
      const zones = await apiFetch('/api/shipping/zones');
      const zoneId = prompt(`Enter zone ID:\n${zones.map(z => `${z.id}: ${z.zone_name} - $${z.base_fee}`).join('\n')}`);
      if (!zoneId) return;
      const order = await apiFetch('/api/physical-orders/create-order', {
        method: 'POST',
        body: JSON.stringify({ bookId, shippingZoneId: Number(zoneId), shippingMethod: 'platform_checkout' })
      });
      alert(`Sample order created: $${order.totalPrice} total`);
    } catch (err) { alert(err.message); }
  };
});
