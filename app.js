// ======= Firebase Database URL =======
const dbUrl = "https://pharmashortages-default-rtdb.firebaseio.com/shortages.json";

// ======= State Management =======
const selectedItems = new Map(); // key: unique id, value: { name, qty, branch, date }
let currentQtyItemId = null;
let allRecords = [];
// Store drug info per row for event delegation
const rowDataMap = new Map(); // key: itemId, value: { drugName, branch, date }

// ======= Load Data =======
async function loadShortages() {
    const container = document.getElementById('data-container');
    try {
        const response = await fetch(dbUrl);
        const data = await response.json();
        container.innerHTML = '';

        if (!data) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">✅</div>
                    <p>لا توجد أي نواقص مسجلة حالياً</p>
                </div>`;
            return;
        }

        allRecords = Object.entries(data).reverse();

        allRecords.forEach(([key, record], recordIdx) => {
            const card = document.createElement('div');
            card.className = 'branch-card';
            card.style.animationDelay = `${recordIdx * 0.08}s`;

            const lines = record.items.split('\n').filter(l => l.trim() !== '');
            if (lines.length === 0) return;

            const headers = lines[0].split('\t');
            // Drug name is always in the SECOND column (index 1)
            const drugNameColIdx = headers.length > 1 ? 1 : 0;

            // Build header
            const cardHeader = document.createElement('div');
            cardHeader.className = 'card-header';
            cardHeader.innerHTML = `
                <div class="branch-name">
                    <span class="icon">🏥</span>
                    ${escapeHTML(record.pharmacy)}
                </div>
                <div class="card-meta">
                    <span class="date-badge">📅 ${escapeHTML(record.date)}</span>
                    <button class="btn-select-all" id="select-all-${recordIdx}" 
                            data-record-idx="${recordIdx}"
                            data-branch="${escapeAttr(record.pharmacy)}"
                            data-date="${escapeAttr(record.date)}">
                        تحديد الكل
                    </button>
                </div>`;
            card.appendChild(cardHeader);

            // Build table
            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'table-wrapper';

            let tableHTML = '<table class="data-table"><thead><tr>';
            tableHTML += '<th>✓</th>';
            headers.forEach(h => {
                tableHTML += `<th>${escapeHTML(h)}</th>`;
            });
            tableHTML += '<th>الكمية</th>';
            tableHTML += '</tr></thead><tbody>';

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split('\t');
                const drugName = cols[drugNameColIdx]?.trim() || cols[0]?.trim() || `صنف ${i}`;
                const itemId = `${key}_${i}`;

                // Store data for event delegation
                rowDataMap.set(itemId, {
                    drugName: drugName,
                    branch: record.pharmacy,
                    date: record.date
                });

                const isSelected = selectedItems.has(itemId);
                const qty = isSelected ? selectedItems.get(itemId).qty : 1;

                tableHTML += `<tr id="row-${itemId}" class="${isSelected ? 'selected' : ''}" 
                                  data-record-idx="${recordIdx}" data-item-id="${itemId}">`;
                tableHTML += `<td>
                    <div class="custom-checkbox ${isSelected ? 'checked' : ''}" 
                         id="cb-${itemId}"
                         data-action="toggle"
                         data-item-id="${itemId}">
                    </div>
                </td>`;
                cols.forEach(c => {
                    tableHTML += `<td>${escapeHTML(c)}</td>`;
                });
                tableHTML += `<td>
                    <span class="qty-badge ${isSelected ? 'visible' : ''}" id="qty-badge-${itemId}">
                        <span class="qty-value" id="qty-val-${itemId}">${qty}</span>
                        <button class="btn-change-qty" data-action="change-qty" data-item-id="${itemId}">تغيير</button>
                    </span>
                </td>`;
                tableHTML += '</tr>';
            }

            tableHTML += '</tbody></table>';
            tableWrapper.innerHTML = tableHTML;
            card.appendChild(tableWrapper);
            container.appendChild(card);
        });

    } catch (error) {
        console.error("Error fetching data:", error);
        container.innerHTML = `
            <div class="error-state">
                <p>❌ حدث خطأ في تحميل البيانات من قاعدة البيانات.</p>
            </div>`;
    }
}

// ======= Event Delegation (fixes onclick issues) =======
document.addEventListener('click', function(e) {
    // Handle checkbox toggle
    const toggleEl = e.target.closest('[data-action="toggle"]');
    if (toggleEl) {
        e.stopPropagation();
        const itemId = toggleEl.dataset.itemId;
        const info = rowDataMap.get(itemId);
        if (!info) return;

        if (selectedItems.has(itemId)) {
            selectedItems.delete(itemId);
            updateRowUI(itemId, false);
        } else {
            selectedItems.set(itemId, { name: info.drugName, qty: 1, branch: info.branch, date: info.date });
            updateRowUI(itemId, true);
        }
        updateGlobalUI();
        return;
    }

    // Handle change quantity button
    const qtyBtn = e.target.closest('[data-action="change-qty"]');
    if (qtyBtn) {
        e.stopPropagation();
        const itemId = qtyBtn.dataset.itemId;
        const info = rowDataMap.get(itemId);
        if (!info) return;
        openQtyModal(itemId, info.drugName);
        return;
    }

    // Handle select-all button
    const selectAllBtn = e.target.closest('.btn-select-all');
    if (selectAllBtn) {
        const recordIdx = selectAllBtn.dataset.recordIdx;
        const branch = selectAllBtn.dataset.branch;
        const date = selectAllBtn.dataset.date;
        toggleSelectAll(recordIdx, branch, date);
        return;
    }
});

// ======= Toggle Select All =======
function toggleSelectAll(recordIdx, branch, date) {
    const rows = document.querySelectorAll(`tr[data-record-idx="${recordIdx}"]`);
    const btn = document.getElementById(`select-all-${recordIdx}`);
    
    // Check if all are selected
    let allSelected = true;
    const itemIds = [];
    rows.forEach(row => {
        const id = row.dataset.itemId;
        itemIds.push(id);
        if (!selectedItems.has(id)) allSelected = false;
    });

    if (allSelected) {
        // Deselect all
        itemIds.forEach(id => {
            selectedItems.delete(id);
            updateRowUI(id, false);
        });
        btn.classList.remove('active');
        btn.textContent = 'تحديد الكل';
    } else {
        // Select all
        rows.forEach(row => {
            const id = row.dataset.itemId;
            if (!selectedItems.has(id)) {
                const info = rowDataMap.get(id);
                const drugName = info ? info.drugName : 'صنف';
                selectedItems.set(id, { name: drugName, qty: 1, branch, date });
                updateRowUI(id, true);
            }
        });
        btn.classList.add('active');
        btn.textContent = 'إلغاء تحديد الكل';
    }
    updateGlobalUI();
}

// ======= Update Single Row UI =======
function updateRowUI(itemId, isSelected) {
    const row = document.getElementById(`row-${itemId}`);
    const cb = document.getElementById(`cb-${itemId}`);
    const qtyBadge = document.getElementById(`qty-badge-${itemId}`);
    const qtyVal = document.getElementById(`qty-val-${itemId}`);
    
    if (!row) return;

    if (isSelected) {
        row.classList.add('selected');
        cb?.classList.add('checked');
        qtyBadge?.classList.add('visible');
        const item = selectedItems.get(itemId);
        if (qtyVal && item) qtyVal.textContent = item.qty;
    } else {
        row.classList.remove('selected');
        cb?.classList.remove('checked');
        qtyBadge?.classList.remove('visible');
    }
}

// ======= Update Global UI (badge, button) =======
function updateGlobalUI() {
    const count = selectedItems.size;
    const badge = document.getElementById('selected-badge');
    const btn = document.getElementById('btn-open-pdf');
    const countText = document.getElementById('selected-count-text');

    if (count > 0) {
        badge.style.display = 'inline-flex';
        btn.style.display = 'flex';
        countText.textContent = count;
    } else {
        badge.style.display = 'none';
        btn.style.display = 'none';
    }
}

// ======= Quantity Modal =======
function openQtyModal(itemId, drugName) {
    currentQtyItemId = itemId;
    
    document.getElementById('qty-drug-name').textContent = drugName;
    
    const currentQty = selectedItems.has(itemId) ? selectedItems.get(itemId).qty : 1;
    document.getElementById('qty-custom-input').value = currentQty;
    
    // Highlight current preset
    document.querySelectorAll('.qty-preset-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.textContent) === currentQty);
    });

    document.getElementById('qty-modal-overlay').classList.add('open');
    document.getElementById('qty-modal').classList.add('open');
    
    setTimeout(() => document.getElementById('qty-custom-input').focus(), 100);
}

function closeQtyModal() {
    document.getElementById('qty-modal-overlay').classList.remove('open');
    document.getElementById('qty-modal').classList.remove('open');
    currentQtyItemId = null;
}

function setQty(val) {
    document.getElementById('qty-custom-input').value = val;
    document.querySelectorAll('.qty-preset-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.textContent) === val);
    });
}

function stepQty(delta) {
    const input = document.getElementById('qty-custom-input');
    let val = parseInt(input.value) || 1;
    val = Math.max(1, Math.min(999, val + delta));
    input.value = val;
    document.querySelectorAll('.qty-preset-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.textContent) === val);
    });
}

function confirmQty() {
    if (!currentQtyItemId || !selectedItems.has(currentQtyItemId)) {
        closeQtyModal();
        return;
    }
    
    const qty = Math.max(1, parseInt(document.getElementById('qty-custom-input').value) || 1);
    const item = selectedItems.get(currentQtyItemId);
    item.qty = qty;
    
    // Update row display
    const qtyVal = document.getElementById(`qty-val-${currentQtyItemId}`);
    if (qtyVal) qtyVal.textContent = qty;
    
    closeQtyModal();
    
    // If PDF panel is open, refresh it
    if (document.getElementById('pdf-panel').classList.contains('open')) {
        renderPdfPanel();
    }
}

// ======= PDF Panel =======
function openPdfPanel() {
    if (selectedItems.size === 0) return;
    
    document.getElementById('pdf-overlay').classList.add('open');
    document.getElementById('pdf-panel').classList.add('open');
    renderPdfPanel();
}

function closePdfPanel() {
    document.getElementById('pdf-overlay').classList.remove('open');
    document.getElementById('pdf-panel').classList.remove('open');
}

function renderPdfPanel() {
    const list = document.getElementById('pdf-items-list');
    const countEl = document.getElementById('pdf-items-count');
    
    // Get branch and date from first item
    let branch = '-', date = '-';
    for (const [, item] of selectedItems) {
        branch = item.branch;
        date = item.date;
        break;
    }
    
    document.getElementById('pdf-branch-name').textContent = branch;
    document.getElementById('pdf-date').textContent = date;
    countEl.textContent = selectedItems.size;

    list.innerHTML = '';
    let idx = 0;
    for (const [id, item] of selectedItems) {
        const div = document.createElement('div');
        div.className = 'pdf-item';
        div.style.animationDelay = `${idx * 0.05}s`;
        div.innerHTML = `
            <span class="pdf-item-name">${escapeHTML(item.name)}</span>
            <span class="pdf-item-qty">${item.qty} علبة</span>
            <button class="pdf-item-remove" data-remove-id="${id}" title="إزالة">✕</button>
        `;
        // Use event listener instead of inline onclick
        div.querySelector('.pdf-item-remove').addEventListener('click', () => removeFromPdf(id));
        list.appendChild(div);
        idx++;
    }
}

function removeFromPdf(itemId) {
    selectedItems.delete(itemId);
    updateRowUI(itemId, false);
    updateGlobalUI();
    
    if (selectedItems.size === 0) {
        closePdfPanel();
    } else {
        renderPdfPanel();
    }
}

function clearAllSelections() {
    for (const [id] of selectedItems) {
        updateRowUI(id, false);
    }
    selectedItems.clear();
    updateGlobalUI();
    closePdfPanel();
    
    // Reset all select-all buttons
    document.querySelectorAll('.btn-select-all').forEach(btn => {
        btn.classList.remove('active');
        btn.textContent = 'تحديد الكل';
    });
}

// ======= Generate PDF =======
async function generatePDF() {
    if (selectedItems.size === 0) return;

    const btn = document.getElementById('btn-generate-pdf');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> جاري التجهيز...';

    // Get branch & date
    let branch = 'الصيدلية', date = '';
    for (const [, item] of selectedItems) {
        branch = item.branch;
        date = item.date;
        break;
    }

    // Build hidden render area
    const renderArea = document.getElementById('pdf-render-area');
    const todayDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    
    let rowsHTML = '';
    let i = 0;
    for (const [, item] of selectedItems) {
        i++;
        rowsHTML += `<tr>
            <td style="text-align:center;font-weight:700;color:#6b7280">${i}</td>
            <td style="font-weight:600">${escapeHTML(item.name)}</td>
            <td style="text-align:center;font-weight:800;color:#1e40af;font-size:15px">${item.qty}</td>
        </tr>`;
    }

    renderArea.innerHTML = `
        <div class="pdf-page" id="pdf-capture">
            <div class="pdf-header-area">
                <div class="pdf-title">💊 طلبية أدوية - ${escapeHTML(branch)}</div>
                <div class="pdf-subtitle">تاريخ النواقص: ${escapeHTML(date)} | تاريخ الطلبية: ${todayDate}</div>
            </div>
            <div class="pdf-meta">
                <span>🏥 الفرع: ${escapeHTML(branch)}</span>
                <span>📦 عدد الأصناف: ${selectedItems.size}</span>
            </div>
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width:50px">#</th>
                        <th>اسم الصنف</th>
                        <th style="width:100px">الكمية المطلوبة</th>
                    </tr>
                </thead>
                <tbody>${rowsHTML}</tbody>
            </table>
            <div class="pdf-footer-area">
                تم إنشاء هذه الطلبية تلقائياً من نظام إدارة نواقص الصيدليات
            </div>
        </div>
    `;

    try {
        // Wait for fonts
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 300));

        const element = document.getElementById('pdf-capture');
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false
        });

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/png');

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        // Handle multi-page if content is long
        if (pdfHeight <= pdf.internal.pageSize.getHeight()) {
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        } else {
            let position = 0;
            const pageHeight = pdf.internal.pageSize.getHeight();
            while (position < pdfHeight) {
                if (position > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, -position, pdfWidth, pdfHeight);
                position += pageHeight;
            }
        }

        // Clean filename
        const safeBranch = branch.replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '').trim();
        const safeDate = date.replace(/[/:]/g, '-').trim();
        const filename = `طلبية_${safeBranch}_${safeDate}.pdf`;

        pdf.save(filename);

        btn.innerHTML = '<span>✅</span> تم التحميل بنجاح!';
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<span>🖨️</span> طباعة PDF وإرسال للموزع';
        }, 2500);

    } catch (err) {
        console.error('PDF Error:', err);
        btn.innerHTML = '<span>❌</span> حدث خطأ، حاول مرة أخرى';
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<span>🖨️</span> طباعة PDF وإرسال للموزع';
        }, 2000);
    }

    renderArea.innerHTML = '';
}

// ======= Utility Functions =======
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ======= Keyboard shortcuts =======
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.getElementById('qty-modal').classList.contains('open')) {
            closeQtyModal();
        } else if (document.getElementById('pdf-panel').classList.contains('open')) {
            closePdfPanel();
        }
    }
});

// ======= Initialize =======
loadShortages();
