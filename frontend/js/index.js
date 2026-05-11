function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const cfMap = L.map('cfMap', {
    center: [48.4, 31.2],
    zoom: 6,
    minZoom: 6,
    maxBounds: [[44.3, 22.1], [52.4, 40.2]],
    maxBoundsViscosity: 1.0
});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(cfMap);

let cfMarkersLayer = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
}).addTo(cfMap);

const CF_API_BASE = 'http://localhost:5000/api/cityfix';
const MAX_PHOTOS = 5;

const cfCategoriesChips = document.getElementById('cfCategoriesChips');
const cfCategoryIds = document.getElementById('cfCategoryIds');
const cfDetectBtn = document.getElementById('cfDetectBtn');
const cfAddressInput = document.getElementById('cfAddress');
const cfLatInput = document.getElementById('cfLatitude');
const cfLngInput = document.getElementById('cfLongitude');
const cfReportForm = document.getElementById('cfReportForm');
const cfSubmitBtn = document.getElementById('cfSubmitBtn');
const cfPhotoInput = document.getElementById('cfPhotoInput');
const cfPhotoAdd = document.getElementById('cfPhotoAdd');
const cfPhotosGrid = document.getElementById('cfPhotosGrid');
const cfStep2 = document.getElementById('cfStep2');
const cfResultCategory = document.getElementById('cfResultCategory');
const cfResultConfidence = document.getElementById('cfResultConfidence');
const cfSuccess = document.getElementById('cfSuccess');
const cfPopularList = document.getElementById('cfPopularList');
const cfArchiveList = document.getElementById('cfArchiveList');

let uploadedFiles = [];
let allCategories = [];

let pickerMap, pickerMarker;
function initPickerMap() {
    if (pickerMap) return;
    pickerMap = L.map('cfPickerMap', {
        center: [48.4, 31.2], zoom: 6, minZoom: 6,
        maxBounds: [[44.3, 22.1], [52.4, 40.2]],
        maxBoundsViscosity: 1.0, attributionControl: false
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);
    pickerMap.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        setPickerMarker(lat, lng);
        cfLatInput.value = lat; cfLngInput.value = lng;
        cfAddressInput.value = await cfReverseGeocode(lat, lng) || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        updateSubmitButton();
    });
}
function setPickerMarker(lat, lng) {
    if (pickerMarker) pickerMarker.remove();
    pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
}

// Навігація
document.querySelectorAll('.cf-nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageName = link.dataset.page;
        document.querySelectorAll('.cf-nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === pageName));
        document.querySelectorAll('.cf-page').forEach(p => p.classList.remove('active'));
        const page = document.getElementById('page-' + pageName);
        if (page) page.classList.add('active');
        if (pageName === 'home') { cfMap.invalidateSize(); loadCFReports(); loadCFStatistics(); }
        if (pageName === 'archive') loadArchive();
        if (pageName === 'report') setTimeout(() => { initPickerMap(); pickerMap.invalidateSize(); }, 100);
    });
});

document.getElementById('cfLogo').addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.cf-nav-link').forEach(l => l.classList.remove('active'));
    const homeLink = document.querySelector('[data-page=home]');
    if (homeLink) homeLink.classList.add('active');
    document.querySelectorAll('.cf-page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-home').classList.add('active');
    cfMap.invalidateSize();
    loadCFReports();
    loadCFStatistics();
});

async function loadCFCategories() {
    try {
        const res = await fetch(`${CF_API_BASE}/categories`);
        allCategories = await res.json();
        cfCategoriesChips.innerHTML = '';
        allCategories.forEach(cat => {
            const chip = document.createElement('span');
            chip.className = 'cf-chip';
            chip.textContent = cat.name;
            chip.dataset.id = cat.id;
            chip.addEventListener('click', () => { chip.classList.toggle('selected'); updateSelectedCategories(); });
            cfCategoriesChips.appendChild(chip);
        });
    } catch (e) { console.error(e); }
}

function updateSelectedCategories() {
    const selected = document.querySelectorAll('.cf-chip.selected');
    cfCategoryIds.value = Array.from(selected).map(c => c.dataset.id).join(',');
    updateSubmitButton();
}

function updatePhotoAddVisibility() {
    cfPhotoAdd.style.display = uploadedFiles.length >= MAX_PHOTOS ? 'none' : 'flex';
}

function renderPhotoThumb(file, index) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'cf-photo-thumb-wrapper';
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.className = 'cf-photo-thumb';
        img.dataset.index = index;
        img.addEventListener('click', () => {
            document.querySelectorAll('.cf-photo-thumb').forEach(t => t.classList.remove('selected'));
            img.classList.add('selected');
        });
        const removeBtn = document.createElement('button');
        removeBtn.className = 'cf-photo-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removePhoto(index); });
        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        cfPhotosGrid.insertBefore(wrapper, cfPhotoAdd);
        if (uploadedFiles.length === 1) img.classList.add('selected');
        updatePhotoAddVisibility();
    };
    reader.readAsDataURL(file);
}

function removePhoto(index) {
    uploadedFiles.splice(index, 1);
    const thumbs = cfPhotosGrid.querySelectorAll('.cf-photo-thumb');
    thumbs.forEach(t => { if (parseInt(t.dataset.index) === index) t.closest('.cf-photo-thumb-wrapper').remove(); });
    const remaining = cfPhotosGrid.querySelectorAll('.cf-photo-thumb');
    remaining.forEach((img, i) => { img.dataset.index = i; });
    if (remaining.length === 0) {
        cfStep2.style.display = 'none';
        cfCategoryIds.value = '';
        document.querySelectorAll('.cf-chip').forEach(c => c.classList.remove('selected'));
    } else {
        const sel = cfPhotosGrid.querySelector('.cf-photo-thumb.selected');
        if (!sel && remaining.length > 0) remaining[0].classList.add('selected');
    }
    updatePhotoAddVisibility();
    updateSubmitButton();
    classifyAllPhotos();
}

cfPhotoAdd.addEventListener('click', () => cfPhotoInput.click());
cfPhotoInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const remaining = MAX_PHOTOS - uploadedFiles.length;
    if (remaining <= 0) { cfPhotoInput.value = ''; return; }
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) alert(`Ліміт. Додано лише ${remaining} фото.`);
    for (const file of toAdd) { uploadedFiles.push(file); renderPhotoThumb(file, uploadedFiles.length - 1); }
    cfPhotoInput.value = '';
    updateSubmitButton();
    classifyAllPhotos();
});

async function classifyAllPhotos() {
    if (uploadedFiles.length === 0) return;
    cfStep2.style.display = 'block';
    cfResultCategory.textContent = 'Аналізую...';
    cfResultConfidence.textContent = '';
    document.querySelectorAll('.cf-chip').forEach(c => c.classList.remove('selected'));
    cfCategoryIds.value = '';
    const fd = new FormData();
    uploadedFiles.forEach(f => fd.append('photos', f));
    try {
        const res = await fetch(`${CF_API_BASE}/classify-batch`, { method: 'POST', body: fd });
        if (res.ok) {
            const data = await res.json();
            if (data.confidence >= 0.5 && data.category) {
                cfResultCategory.textContent = data.category;
                cfResultConfidence.textContent = Math.round(data.confidence * 100) + '%';
                document.querySelectorAll('.cf-chip').forEach(c => { if (c.textContent === data.category) c.classList.add('selected'); });
            } else { cfResultCategory.textContent = 'Не визначено'; cfResultConfidence.textContent = ''; }
        }
    } catch { cfResultCategory.textContent = 'Помилка'; }
    updateSelectedCategories();
}

cfDetectBtn.addEventListener('click', () => {
    cfDetectBtn.textContent = 'Визначаю...'; cfDetectBtn.disabled = true;
    if (!navigator.geolocation) { alert('Геолокація не підтримується'); cfDetectBtn.textContent = 'Визначити…'; cfDetectBtn.disabled = false; return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        cfLatInput.value = lat; cfLngInput.value = lng;
        initPickerMap(); pickerMap.setView([lat, lng], 15); setPickerMarker(lat, lng);
        cfAddressInput.value = await cfReverseGeocode(lat, lng) || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        cfDetectBtn.textContent = 'Місце визначено'; cfDetectBtn.disabled = false;
        updateSubmitButton();
    }, () => { alert('Не вдалося'); cfDetectBtn.textContent = 'Визначити…'; cfDetectBtn.disabled = false; }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});

cfAddressInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const a = cfAddressInput.value.trim();
        if (a && a.length > 3) {
            const c = await cfGeocodeAddress(a);
            if (c) { cfLatInput.value = c.lat; cfLngInput.value = c.lng; initPickerMap(); pickerMap.setView([c.lat, c.lng], 15); setPickerMarker(c.lat, c.lng); updateSubmitButton(); }
        }
    }
});

function updateSubmitButton() { cfSubmitBtn.disabled = !(uploadedFiles.length > 0 && cfLatInput.value && cfCategoryIds.value); }

async function cfGeocodeAddress(a) { const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(a)}`); const d = await r.json(); return d.length ? { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) } : null; }
async function cfReverseGeocode(lat, lng) { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`); const d = await r.json(); return d.display_name || ''; }

cfReportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!cfCategoryIds.value) { alert('Оберіть категорію'); return; }
    if (!cfLatInput.value) { alert('Визначте місцезнаходження'); return; }
    const fd = new FormData();
    fd.append('category_ids', cfCategoryIds.value);
    fd.append('latitude', cfLatInput.value); fd.append('longitude', cfLngInput.value);
    fd.append('address', cfAddressInput.value);
    fd.append('description', document.getElementById('cfDescription').value);
    uploadedFiles.forEach(f => fd.append('photos', f));
    try {
        const res = await fetch(`${CF_API_BASE}/reports`, { method: 'POST', body: fd });
        if (res.ok) { cfReportForm.style.display = 'none'; cfSuccess.style.display = 'block'; loadCFReports(); loadCFStatistics(); }
        else { const err = await res.json(); alert('Помилка: ' + (err.error || 'невідома')); }
    } catch { alert('Помилка сервера'); }
});

function showDetailPage(report) {
    document.querySelectorAll('.cf-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.cf-nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('page-detail').classList.add('active');
    const st = { pending: 'На розгляді', in_progress: 'В процесі', resolved: 'Вирішено' };
    const dateStr = report.created_at ? new Date(report.created_at).toLocaleString('uk-UA') : '—';
    const addressStr = report.address || 'Адреса не вказана';
    const descStr = report.description || 'Опис відсутній';
    const photos = report.photos || [];
    let html = `<h2>${escapeHtml(report.category_name || 'Категорія')}</h2><span class="cf-detail-status ${report.status}">${escapeHtml(st[report.status] || report.status)}</span>`;
    html += `<div class="cf-detail-section"><div class="cf-detail-label">Місце на карті</div><div id="cfDetailMap" class="cf-detail-map"></div></div>`;
    if (photos.length > 0) {
        html += '<div class="cf-detail-photos">';
        photos.forEach(fn => { const url = `http://localhost:5000/cityfix_uploads/${fn}`; html += `<img src="${url}" class="cf-detail-photo" onclick="openLightbox('${url}')" alt="Фото">`; });
        html += '</div>';
    }
    html += `<div class="cf-detail-section"><div class="cf-detail-label">Адреса</div><div class="cf-detail-text">${escapeHtml(addressStr)}</div></div>`;
    html += `<div class="cf-detail-section"><div class="cf-detail-label">Опис проблеми</div><div class="cf-detail-text">${escapeHtml(descStr)}</div></div>`;
    html += `<div class="cf-detail-section"><div class="cf-detail-label">Дата створення</div><div class="cf-detail-text">${escapeHtml(dateStr)}</div></div>`;
    html += `<div style="display:flex; gap:12px; margin-top:20px;"><button class="cf-btn-primary" onclick="document.querySelector('[data-page=home]').click()">Назад на головну</button>${report.status !== 'resolved' ? `<button class="cf-btn-primary" style="background:#34a853;" onclick="markAsResolved(${report.id})">Позначити як вирішену</button>` : ''}</div>`;
    document.getElementById('cfDetailContent').innerHTML = html;
    window.scrollTo(0,0);
    setTimeout(() => { const detailMap = L.map('cfDetailMap', { center: [report.latitude, report.longitude], zoom: 15, scrollWheelZoom: false, dragging: true }); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(detailMap); L.marker([report.latitude, report.longitude]).addTo(detailMap); }, 100);
}

function openLightbox(url) { const lb = document.getElementById('cfLightbox'), img = document.getElementById('cfLightboxImg'); if (lb && img) { img.src = url; lb.classList.add('active'); document.body.style.overflow = 'hidden'; } }
function closeLightbox() { const lb = document.getElementById('cfLightbox'); if (lb) { lb.classList.remove('active'); document.body.style.overflow = ''; document.getElementById('cfLightboxImg').src = ''; } }

async function loadCFReports() {
    try {
        const res = await fetch(`${CF_API_BASE}/reports?show_resolved=0`);
        const reports = await res.json();
        cfMarkersLayer.clearLayers();

        // Створюємо стандартну синю іконку з правильними параметрами
        const defaultIcon = L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],     // реальний розмір картинки
            iconAnchor: [12, 41],   // точка (x,y) на картинці, яка буде прив'язана до координат
            popupAnchor: [1, -34],  // відносне положення попапу
            shadowSize: [41, 41]
        });

        reports.forEach(r => {
            // Використовуємо явно створену іконку
            const marker = L.marker([r.latitude, r.longitude], { icon: defaultIcon }).addTo(cfMarkersLayer);

            const st = { pending: 'На розгляді', in_progress: 'В процесі', resolved: 'Вирішено' };
            const descShort = r.description ? (r.description.length > 60 ? r.description.substring(0, 60) + '...' : r.description) : '';
            const addrShort = r.address ? (r.address.length > 40 ? r.address.substring(0, 40) + '...' : r.address) : '';
            const photos = r.photos || [];
            const mainImg = photos.length ? `<img src="http://localhost:5000/cityfix_uploads/${photos[0]}" class="cf-popup-photo">` : '';

            const popupContent = `
                <div class="cf-marker-popup">
                    <div class="cf-popup-title">${escapeHtml(r.category_name)}</div>
                    <div class="cf-popup-status ${r.status}">${escapeHtml(st[r.status])}</div>
                    ${mainImg}
                    <div class="cf-popup-desc">${escapeHtml(descShort)}</div>
                    <div class="cf-popup-address">${escapeHtml(addrShort)}</div>
                    <button class="cf-popup-btn" onclick="event.stopPropagation();fetchAndShowReport(${r.id})">Детально</button>
                </div>
            `;
            marker.bindPopup(popupContent);
        });
    } catch (e) { console.error(e); }
}

async function fetchAndShowReport(id) {
    try {
        const res = await fetch(`${CF_API_BASE}/reports?show_resolved=1`);
        const reports = await res.json();
        const report = reports.find(r => r.id === id);
        if (report) showDetailPage(report);
    } catch (e) { console.error(e); }
}

async function markAsResolved(reportId) {
    if (!confirm('Позначити цю проблему як вирішену?')) return;
    try {
        const res = await fetch(`${CF_API_BASE}/reports/${reportId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) });
        if (res.ok) { alert('Статус оновлено'); loadCFReports(); loadCFStatistics(); document.querySelector('[data-page=home]').click(); }
        else { const err = await res.json(); alert('Помилка: ' + err.error); }
    } catch { alert('Помилка сервера'); }
}

async function loadCFStatistics() {
    try {
        const r = await fetch(`${CF_API_BASE}/statistics`);
        const s = await r.json();
        document.getElementById('cfReportsLastWeek').textContent = s.reports_last_week;
        document.getElementById('cfResolvedLastMonth').textContent = s.resolved_last_month;
        document.getElementById('cfTotalReports').textContent = (s.reports_last_week||0)+(s.resolved_last_month||0);
        cfPopularList.innerHTML = '';
        s.popular_reports.forEach(rep => {
            const c = document.createElement('div');
            c.className = 'cf-issue-card';
            let descText = rep.description || rep.address || '';
            if (descText.length > 50) descText = descText.substring(0, 50) + '...';
            c.innerHTML = `<div class="cf-issue-category">${escapeHtml(rep.category)}</div><div class="cf-issue-desc">${escapeHtml(descText)}</div>`;
            c.addEventListener('click', () => fetchAndShowReport(rep.id));
            cfPopularList.appendChild(c);
        });
    } catch (e) { console.error(e); }
}

let currentArchiveFilter = 'all';

async function loadArchive(filter = 'all') {
    try {
        currentArchiveFilter = filter;

        document.querySelectorAll('.cf-archive-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        const res = await fetch(`${CF_API_BASE}/reports?show_resolved=1`);
        const reports = await res.json();

        let filtered = [];
        if (filter === 'resolved') {
            filtered = reports.filter(r => r.status === 'resolved');
        } else if (filter === 'pending') {
            filtered = reports.filter(r => r.status !== 'resolved');
        } else {
            filtered = reports;
        }

        cfArchiveList.innerHTML = '';

        if (filtered.length === 0) {
            cfArchiveList.innerHTML = '<p style="color:#5f6368; text-align:center;">Немає скарг.</p>';
            return;
        }

        const borderColors = {
            pending: '#e37400',
            in_progress: '#1a73e8',
            resolved: '#34a853'
        };

        filtered.forEach(r => {
            const statusLabels = { pending: 'На розгляді', in_progress: 'В процесі', resolved: 'Вирішено' };
            const card = document.createElement('div');
            card.className = 'cf-archive-card';
            card.style.borderLeftColor = borderColors[r.status] || '#34a853';
            card.innerHTML = `
                <strong>${escapeHtml(r.category_name)}</strong>
                <small>${escapeHtml(r.description || 'Без опису')}</small>
                <small style="color:#5f6368;">${escapeHtml(r.address || '')}</small>
                <small style="color:${borderColors[r.status]}; font-weight:600;">${statusLabels[r.status]}</small>
            `;
            card.addEventListener('click', () => showDetailPage(r));
            cfArchiveList.appendChild(card);
        });
    } catch (e) { console.error(e); }
}


document.addEventListener('DOMContentLoaded', () => {
    loadCFCategories();
    loadCFReports();
    loadCFStatistics();

    const lb = document.getElementById('cfLightbox');
    if (lb) {
        lb.addEventListener('click', (e) => {
            if (e.target === lb || e.target.classList.contains('cf-lightbox-close')) {
                closeLightbox();
            }
        });
    }

    updatePhotoAddVisibility();

    setInterval(() => {
        if (document.getElementById('page-home').classList.contains('active')) {
            loadCFReports();
            loadCFStatistics();
        }
    }, 30000);

    const filterBtns = document.querySelectorAll('.cf-archive-filter-btn');
    if (filterBtns.length > 0) {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Видаляємо клас 'active' у всіх кнопок
                filterBtns.forEach(b => b.classList.remove('active'));
                // Додаємо 'active' натиснутій кнопці
                btn.classList.add('active');
                // Завантажуємо архів з вибраним фільтром
                loadArchive(btn.dataset.filter);
            });
        });
    }
});