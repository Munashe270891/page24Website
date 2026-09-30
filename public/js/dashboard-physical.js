// dashboard-physical.js - Physical Print On Demand logic - Separate to avoid dashboard.js bloat
document.addEventListener('DOMContentLoaded', () => {

  // Re-use same apiFetch helper as dashboard.js but local to avoid conflict
  const apiFetch = async (url, options = {}) => {
    const customOptions = { ...options };
    if (!(customOptions.body instanceof FormData)) {
      customOptions.headers = {
        ...(customOptions.headers || {}),
        'Content-Type': 'application/json'
      };
    }
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...customOptions
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'object' && payload && payload.error
        ? payload.error
        : `Request failed with status ${response.status}`;
      throw new Error(message);
    }
    return payload;
  };

  // --- 1. Toggle print upload group in creator view ---
  const physicalCheck = document.getElementById('is-physical-check');
  const printUploadGroup = document.getElementById('print-upload-group');

  if (physicalCheck && printUploadGroup) {
    physicalCheck.addEventListener('change', (e) => {
      printUploadGroup.classList.toggle('hidden', !e.target.checked);
      // Also set hidden input for backend if needed
      if (e.target.checked) {
        console.log('Physical POD enabled - print upload shown');
      }
    });
  }

  // --- 2. Handle publish form to include is_physical flag ---
  // We intercept AFTER dashboard.js FormData is built by listening to same form
  // dashboard.js already submits, so we need to ensure backend reads is_physical checkbox
  // Your /api/books/publish should check: req.body.is_physical === 'true' or req.body.is_physical === true
  const publishForm = document.getElementById('publish-master-form');
  if (publishForm) {
    // Store original submit to run after
    publishForm.addEventListener('submit', () => {
      // The checkbox with name="is_physical" will be included automatically in FormData
      // No extra work needed, but we log for debug
      if (physicalCheck && physicalCheck.checked) {
        console.log('Publishing as physical book');
      }
    });
  }

  // --- 3. Upload print file for existing book ---
  window.uploadPrintFile = async function(bookId) {
    const fileInput = document.getElementById('print-pdf-file');
    
    // If creator view file exists and has file, use it, else prompt
    let file = fileInput && fileInput.files[0] ? fileInput.files[0] : null;

    if (!file) {
      // Create hidden input on the fly if not in creator view
      const tempInput = document.createElement('input');
      tempInput.type = 'file';
      tempInput.accept = '.pdf';
      tempInput.style.display = 'none';
      document.body.appendChild(tempInput);
      tempInput.click();
      
      await new Promise((resolve) => {
        tempInput.onchange = () => {
          file = tempInput.files[0];
          document.body.removeChild(tempInput);
          resolve();
        };
      });
    }

    if (!file) return alert('No file selected');

    if (file.size > 50 * 1024 * 1024) {
      return alert('File exceeds 50MB limit');
    }

    const fd = new FormData();
    fd.append('bookId', bookId);
    fd.append('printFile', file);
    fd.append('fileType', 'interior');

    try {
      const res = await apiFetch('/api/print-files/upload', {
        method: 'POST',
        body: fd
      });
      alert(`✅ Print file uploaded. Status: ${res.file_status || 'pending_review'}\nAdmin will approve for printing.`);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
      console.error(err);
    }
  };

  // --- 4. Order sample copy with shipping logic ---
  window.orderSampleCopy = async function(bookId) {
    try {
      // Fetch shipping zones
      const zones = await apiFetch('/api/shipping/zones');
      
      if (!zones || zones.length === 0) {
        return alert('No shipping zones configured. Contact admin.');
      }

      let zoneList = zones.map(z => `${z.id}: ${z.zone_name} - $${Number(z.base_fee).toFixed(2)} (${z.estimated_days})`).join('\n');
      
      let zoneIdInput = prompt(`Select Shipping Zone:\n\n${zoneList}\n\nEnter Zone ID (e.g. 1 for Harare Office Pickup = $0):`);
      if (!zoneIdInput) return;
      
      const zoneId = Number(zoneIdInput);
      const selectedZone = zones.find(z => z.id === zoneId);
      if (!selectedZone) return alert('Invalid zone ID');

      // Ask shipping method
      let method = 'platform_checkout';
      if (selectedZone.zone_name.toLowerCase().includes('harare') && Number(selectedZone.base_fee) === 0) {
        method = confirm('Harare Office Pickup is FREE. Click OK for Office Pickup, Cancel for Swift Delivery?') ? 'manual_arrangement' : 'platform_checkout';
        // For Harare pickup we still use manual_arrangement to get 50% refund logic
        if (method === 'manual_arrangement') {
          let confirmRefund = confirm(`Harare Office Pickup:\n- You pay book price only now\n- Come to office to collect\n- If you later arrange own courier, 50% shipping refund applies\n\nProceed?`);
          if (!confirmRefund) return;
        }
      } else {
        let usePlatform = confirm(`Zone: ${selectedZone.zone_name}\nFee: $${selectedZone.base_fee}\n\nOK = Pay Now (Platform arranges Swift)\nCancel = Pay Book Only & Arrange Own Courier (50% refundable shipping?)`);
        method = usePlatform ? 'platform_checkout' : 'manual_arrangement';
      }

      const payload = {
        bookId: Number(bookId),
        shippingZoneId: zoneId,
        shippingMethod: method
      };

      const order = await apiFetch('/api/physical-orders/create-order', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      let msg = `✅ Sample Order Created!\n\nBook: $${order.bookPrice}\nShipping: $${order.shippingFee}\nTotal: $${order.totalPrice}\nStatus: ${order.status}\nOrder ID: ${order.orderId}\n\n`;
      if (method === 'manual_arrangement') {
        msg += `You chose Manual Arrangement.\nPay book price only now. Your shipping fee will be 50% refunded if you handle delivery yourself. Collect from Harare office or arrange courier.`;
      } else {
        msg += `Platform will print & ship via Swift-style logistics to ${selectedZone.zone_name}.`;
      }
      alert(msg);

    } catch (err) {
      alert(`Order failed: ${err.message}`);
      console.error(err);
    }
  };

  console.log('dashboard-physical.js loaded');
});
