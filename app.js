// ======= Firebase Database URL =======
const dbUrl = "https://pharmashortages-default-rtdb.firebaseio.com/shortages.json";

// ======= State Management =======
const selectedItems = new Map(); // key: unique id, value: { name, qty, branch, date }
let currentQtyItemId = null;
let allRecords = [];
// Store drug info per row for event delegation
const rowDataMap = new Map(); // key: itemId, value: { drugName, branch, date }

// ======= Delete and Archive Functions =======
function parseRecordDate(dateStr) {
    if (!dateStr) return null;
    const normalized = dateStr.replace(/\//g, '-');
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
}

async function deleteRecord(key) {
    if (!confirm("هل أنت متأكد من حذف قائمة النواقص هذه نهائياً؟")) return;
    try {
        const deleteUrl = `https://pharmashortages-default-rtdb.firebaseio.com/shortages/${key}.json`;
        const response = await fetch(deleteUrl, { method: 'DELETE' });
        if (response.ok) {
            // Remove selected items related to this key
            for (const [id] of selectedItems) {
                if (id.startsWith(key + '_')) {
                    selectedItems.delete(id);
                }
            }
            updateGlobalUI();
            loadShortages();
        } else {
            alert("❌ حدث خطأ أثناء محاولة حذف القائمة.");
        }
    } catch (error) {
        console.error("Error deleting record:", error);
        alert("❌ فشل الاتصال بقاعدة البيانات لعملية الحذف.");
    }
}

async function deleteRecordInBackground(key) {
    try {
        const deleteUrl = `https://pharmashortages-default-rtdb.firebaseio.com/shortages/${key}.json`;
        await fetch(deleteUrl, { method: 'DELETE' });
    } catch (error) {
        console.error("Background auto-delete error for key:", key, error);
    }
}

// ======= Debounce Helper =======
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

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

        const now = new Date();
        const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
        let visibleIdx = 0;

        allRecords.forEach(([key, record], recordIdx) => {
            // Automatic Deletion Check (3 days)
            const recordDateObj = parseRecordDate(record.date);
            if (recordDateObj && (now.getTime() - recordDateObj.getTime() > threeDaysInMs)) {
                deleteRecordInBackground(key);
                return; // Skip rendering
            }

            const card = document.createElement('div');
            card.className = 'branch-card';
            card.style.animationDelay = `${visibleIdx * 0.08}s`;
            visibleIdx++;

            const lines = record.items.split('\n').filter(l => l.trim() !== '');
            if (lines.length === 0) return;

            const headers = lines[0].split('\t');
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
                    <button class="btn-delete-list" data-action="delete-list" data-key="${key}" title="حذف القائمة">
                        🗑️ حذف
                    </button>
                </div>`;
            card.appendChild(cardHeader);

            // Build table
            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'table-wrapper';

            let tableHTML = '<table class="data-table"><thead><tr>';
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
                cols.forEach(c => {
                    const text = c ? c.trim() : '';
                    tableHTML += `<td>${text ? escapeHTML(text) : '<span style="opacity: 0.35;">—</span>'}</td>`;
                });
                tableHTML += `<td>
                    <span class="qty-badge ${isSelected ? 'visible' : ''}" id="qty-badge-${itemId}">
                        <span class="qty-value" id="qty-val-${itemId}" data-action="change-qty" data-item-id="${itemId}" title="اضغط لتغيير الكمية">${qty}</span>
                    </span>
                </td>`;
                tableHTML += '</tr>';
            }

            tableHTML += '</tbody></table>';
            tableWrapper.innerHTML = tableHTML;
            card.appendChild(tableWrapper);
            container.appendChild(card);
        });

        if (visibleIdx === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">✅</div>
                    <p>لا توجد أي نواقص مسجلة حالياً</p>
                </div>`;
        }

        setTimeout(updateMobileStickyHeaders, 50);

    } catch (error) {
        console.error("Error fetching data:", error);
        container.innerHTML = `
            <div class="error-state">
                <p>❌ حدث خطأ في تحميل البيانات من قاعدة البيانات.</p>
            </div>`;
    }
}

const debouncedLoadShortages = debounce(loadShortages, 300);

// ======= Event Delegation (fixes onclick issues) =======
document.addEventListener('click', function(e) {
    // Handle delete-list button
    const deleteBtn = e.target.closest('[data-action="delete-list"]');
    if (deleteBtn) {
        e.stopPropagation();
        const key = deleteBtn.dataset.key;
        deleteRecord(key);
        return;
    }

    // Handle row selection (entire row except quantity column or buttons)
    const rowEl = e.target.closest('tr[data-item-id]');
    if (rowEl) {
        const targetTd = e.target.closest('td');
        const isQtyCell = targetTd && !targetTd.nextElementSibling;
        const isButton = e.target.closest('button');

        if (!isQtyCell && !isButton) {
            e.stopPropagation();
            const itemId = rowEl.dataset.itemId;
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
    const qtyBadge = document.getElementById(`qty-badge-${itemId}`);
    const qtyVal = document.getElementById(`qty-val-${itemId}`);
    
    if (!row) return;

    if (isSelected) {
        row.classList.add('selected');
        qtyBadge?.classList.add('visible');
        const item = selectedItems.get(itemId);
        if (qtyVal && item) qtyVal.textContent = item.qty;
    } else {
        row.classList.remove('selected');
        qtyBadge?.classList.remove('visible');
    }
}

// ======= Update Global UI (badge, button) =======
function updateGlobalUI() {
    const count = selectedItems.size;
    const badge = document.getElementById('selected-badge');
    const btn = document.getElementById('btn-open-pdf');
    const btnClear = document.getElementById('btn-clear-all');
    const countText = document.getElementById('selected-count-text');

    if (count > 0) {
        badge.style.display = 'inline-flex';
        btn.style.display = 'flex';
        if (btnClear) btnClear.style.display = 'flex';
        countText.textContent = count;
    } else {
        badge.style.display = 'none';
        btn.style.display = 'none';
        if (btnClear) btnClear.style.display = 'none';
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
            <span class="pdf-item-qty" title="اضغط لتغيير الكمية">${item.qty} علبة</span>
            <button class="pdf-item-remove" data-remove-id="${id}" title="إزالة">✕</button>
        `;
        // Use event listeners
        div.querySelector('.pdf-item-qty').addEventListener('click', () => openQtyModal(id, item.name));
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

// ======= Send WhatsApp =======
function sendWhatsApp() {
    if (selectedItems.size === 0) return;

    // Get branch & date
    let branch = 'الصيدلية', date = '';
    for (const [, item] of selectedItems) {
        branch = item.branch;
        date = item.date;
        break;
    }

    // Build the formatted text using WhatsApp-friendly typography
    let messageText = `💊 *طلب أدوية ونواقص - ${branch}*\n`;
    messageText += `_تاريخ النواقص: ${date}_\n`;
    messageText += `_تاريخ الطلبية: ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}_\n\n`;
    messageText += `*الأصناف المطلوبة (العدد: ${selectedItems.size}):*\n`;
    messageText += `=========================\n\n`;

    let i = 0;
    for (const [, item] of selectedItems) {
        i++;
        messageText += `*${i}. ${item.name}*\n`;
        messageText += `👈 الكمية المطلوبة: *${item.qty}* علبة\n\n`;
    }

    messageText += `=========================\n`;
    messageText += `📦 _تم تجهيز الطلبية تلقائياً عبر نظام إدارة النواقص الذكي_`;

    // Encode text for URL query
    const encodedText = encodeURIComponent(messageText);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;

    // Open WhatsApp Web or app in a new tab
    window.open(whatsappUrl, '_blank');
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

// ======= Theme Management =======
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const toggleIcon = document.querySelector('.theme-icon');
    if (savedTheme === 'light') {
        document.documentElement.classList.add('light-theme');
        if (toggleIcon) toggleIcon.textContent = '🌙';
    } else {
        document.documentElement.classList.remove('light-theme');
        if (toggleIcon) toggleIcon.textContent = '☀️';
    }
}

function toggleTheme() {
    const isLight = document.documentElement.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    const toggleIcon = document.querySelector('.theme-icon');
    if (toggleIcon) {
        toggleIcon.textContent = isLight ? '🌙' : '☀️';
    }
}

// ======= Real-time Listener =======
let realtimeEventSource = null;

function setupRealtimeListener() {
    if (realtimeEventSource) {
        realtimeEventSource.close();
    }

    try {
        // Firebase RTDB SSE endpoint
        realtimeEventSource = new EventSource("https://pharmashortages-default-rtdb.firebaseio.com/shortages.json");

        realtimeEventSource.addEventListener('put', function(e) {
            debouncedLoadShortages();
        });

        realtimeEventSource.addEventListener('patch', function(e) {
            debouncedLoadShortages();
        });

        realtimeEventSource.onerror = function(err) {
            console.error("Real-time listener encountered an error, reconnecting in 5s...", err);
            if (realtimeEventSource) {
                realtimeEventSource.close();
            }
            setTimeout(setupRealtimeListener, 5000);
        };
    } catch (error) {
        console.error("Failed to setup real-time listener:", error);
    }
}

// ======= Smart Sticky Header =======
function initSmartHeader() {
    let lastWindowScrollY = window.scrollY;
    const lastScrollTopMap = new Map(); // tracks scrollTop per scrollable table container
    const header = document.getElementById('main-header');
    if (!header) return;

    // Use capturing (true) to catch scroll events on dynamically rendered .table-wrapper divs!
    window.addEventListener('scroll', (e) => {
        const target = e.target;

        if (target === document || target === window) {
            // Page scroll
            const currentScrollY = window.scrollY;
            if (currentScrollY > lastWindowScrollY && currentScrollY > 100) {
                header.classList.add('header-hidden');
            } else if (currentScrollY < lastWindowScrollY) {
                header.classList.remove('header-hidden');
            }
            lastWindowScrollY = currentScrollY;
        } else if (target && target.classList && target.classList.contains('table-wrapper')) {
            // Scroll inside dynamic drug table wrapper
            const currentScrollTop = target.scrollTop;
            const lastScrollTop = lastScrollTopMap.get(target) || 0;

            if (currentScrollTop > lastScrollTop && currentScrollTop > 40) {
                header.classList.add('header-hidden');
            } else if (currentScrollTop < lastScrollTop) {
                header.classList.remove('header-hidden');
            }
            lastScrollTopMap.set(target, currentScrollTop);
        }
    }, true);
}

// ======= Mobile Sticky Headers Synchronization =======
function updateMobileStickyHeaders() {
    if (window.innerWidth > 768) {
        document.querySelectorAll('.data-table thead th').forEach(th => {
            th.style.top = '';
        });
        return;
    }

    const header = document.getElementById('main-header');
    const isHeaderHidden = header ? header.classList.contains('header-hidden') : false;
    const threshold = isHeaderHidden ? 0 : 60;

    const wrappers = document.querySelectorAll('.table-wrapper');
    wrappers.forEach(wrapper => {
        const rect = wrapper.getBoundingClientRect();
        const y = rect.top;
        const ths = wrapper.querySelectorAll('.data-table thead th');
        const offset = Math.max(0, threshold - y);
        ths.forEach(th => {
            th.style.setProperty('top', offset + 'px', 'important');
        });
    });
}

// ======= Initialize =======
initTheme();
initSmartHeader();
debouncedLoadShortages();
setupRealtimeListener();

// Register listeners
window.addEventListener('scroll', updateMobileStickyHeaders, { passive: true });
window.addEventListener('resize', updateMobileStickyHeaders);
