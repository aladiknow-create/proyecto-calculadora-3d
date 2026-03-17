// ── PrintCost · app.js ──────────────────────────────────────────────────────

// ══════════════════════════════════════════════
// FIREBASE INIT
// ══════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyAuyBpvbCinSxDgFewuub6h5wC_kdkoEEI",
  authDomain: "printcost-996e6.firebaseapp.com",
  projectId: "printcost-996e6",
  storageBucket: "printcost-996e6.firebasestorage.app",
  messagingSenderId: "736996315310",
  appId: "1:736996315310:web:4ce3498905a5a029b25d3f",
  measurementId: "G-1Q3F0S2B99"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
try { firebase.analytics(); } catch (e) {}

// ── AUTH STATE VARS ──
let currentUser      = null;
let firestoreHistory = [];
let firestoreDiary   = [];
let unsubHistory     = null;
let unsubDiary       = null;

// ── DOM REFS ──
const $ = id => document.getElementById(id);

// ══════════════════════════════════════════════
// TAB NAVIGATION
// ══════════════════════════════════════════════
const tabCalc  = $('tab-calc');
const tabDiary = $('tab-diary');
const pageCalc  = $('page-calc');
const pageDiary = $('page-diary');

function switchTab(tab) {
  const isCalc = tab === 'calc';
  tabCalc.classList.toggle('active', isCalc);
  tabDiary.classList.toggle('active', !isCalc);
  tabCalc.setAttribute('aria-selected', isCalc);
  tabDiary.setAttribute('aria-selected', !isCalc);
  pageCalc.classList.toggle('page-hidden', !isCalc);
  pageDiary.classList.toggle('page-hidden', isCalc);
  if (!isCalc) renderDiary();
}

tabCalc.addEventListener('click',  () => switchTab('calc'));
tabDiary.addEventListener('click', () => switchTab('diary'));

// ══════════════════════════════════════════════
// CALCULATOR
// ══════════════════════════════════════════════
const inp = {
  materialType:   $('materialType'),
  filamentPrice:  $('filamentPrice'),
  filamentUsed:   $('filamentUsed'),
  wastage:        $('wastage'),
  printerWatts:   $('printerWatts'),
  printHours:     $('printHours'),
  kwhPrice:       $('kwhPrice'),
  laborRate:      $('laborRate'),
  laborHours:     $('laborHours'),
  printerCost:    $('printerCost'),
  printerLife:    $('printerLife'),
  postCost:       $('postCost'),
  packagingCost:  $('packagingCost'),
  failureRisk:    $('failureRisk'),
  profitMargin:   $('profitMargin'),
  vatRate:        $('vatRate'),
  currency:       $('currency'),
  printName:      $('printName'),
};

const sliderLabels = {
  wastage:      { el: $('wastageVal'),      suffix: '%' },
  failureRisk:  { el: $('failureRiskVal'),  suffix: '%' },
  profitMargin: { el: $('profitMarginVal'), suffix: '%' },
  vatRate:      { el: $('vatRateVal'),      suffix: '%' },
};

const out = {
  filament:    $('r-filament'),
  electricity: $('r-electricity'),
  labor:       $('r-labor'),
  depr:        $('r-depr'),
  post:        $('r-post'),
  bMaterial:   $('b-material'),
  bElec:       $('b-electricity'),
  bLabor:      $('b-labor'),
  bDepr:       $('b-depr'),
  bPost:       $('b-post'),
  bSubtotal:   $('b-subtotal'),
  bRisk:       $('b-risk'),
  bMargin:     $('b-margin'),
  bVat:        $('b-vat'),
  finalPrice:  $('finalPrice'),
  perGram:     $('pricePerGram'),
};

// ── CURRENCY ──
let currencySymbol = '€';
function updateCurrencySymbols() {
  currencySymbol = inp.currency.value;
  document.querySelectorAll('.sym').forEach(el => el.textContent = currencySymbol);
}
function fmt(val) {
  return `${val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`;
}

// ── MATERIAL PRESETS ──
const materialPresets = { pla: 20, petg: 25, abs: 22, asa: 28, tpu: 30, resin: 35 };
inp.materialType.addEventListener('change', () => {
  const v = inp.materialType.value;
  if (v !== 'custom' && materialPresets[v] !== undefined) inp.filamentPrice.value = materialPresets[v];
  calculate();
});

// ── SLIDER LABELS ──
Object.entries(sliderLabels).forEach(([id, cfg]) => {
  const el = $(id);
  const update = () => { cfg.el.textContent = el.value + cfg.suffix; };
  el.addEventListener('input', update);
  update();
});

// ── CHART ──
const chartColors = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#fb923c'];
const costChart = new Chart($('costChart').getContext('2d'), {
  type: 'doughnut',
  data: {
    labels: ['Filamento', 'Electricidad', 'Mano de obra', 'Depreciación', 'Post-proc + envío', 'Riesgo fallo'],
    datasets: [{ data: [0,0,0,0,0,0], backgroundColor: chartColors.map(c => c + 'cc'), borderColor: chartColors, borderWidth: 2, hoverOffset: 6 }]
  },
  options: {
    cutout: '68%',
    plugins: {
      legend: { position: 'bottom', labels: { color: '#e8e8f0', font: { family: 'Inter', size: 11 }, padding: 12, boxWidth: 12, boxHeight: 12 } },
      tooltip: { callbacks: { label: ctx => ctx.raw === 0 ? null : ` ${ctx.label}: ${fmt(ctx.raw)}` } }
    },
    animation: { duration: 400, easing: 'easeInOutQuart' }
  }
});

function updateChart(data) {
  costChart.data.datasets[0].data = data;
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  costChart.options.plugins.legend.labels.color = isDark ? '#e8e8f0' : '#1a1a2e';
  costChart.update();
}

// ── MAIN CALCULATION ──
function calculate() {
  const filamentPricePerKg = parseFloat(inp.filamentPrice.value) || 0;
  const gramsUsed          = parseFloat(inp.filamentUsed.value)   || 0;
  const wastePct           = parseFloat(inp.wastage.value)        || 0;
  const printerW           = parseFloat(inp.printerWatts.value)   || 0;
  const printH             = parseFloat(inp.printHours.value)     || 0;
  const kwhPrice           = parseFloat(inp.kwhPrice.value)       || 0;
  const laborRate          = parseFloat(inp.laborRate.value)      || 0;
  const laborH             = parseFloat(inp.laborHours.value)     || 0;
  const printerCost        = parseFloat(inp.printerCost.value)    || 0;
  const printerLife        = parseFloat(inp.printerLife.value)    || 1;
  const postCost           = parseFloat(inp.postCost.value)       || 0;
  const packagingCost      = parseFloat(inp.packagingCost.value)  || 0;
  const failureRisk        = parseFloat(inp.failureRisk.value)    || 0;
  const profitMargin       = parseFloat(inp.profitMargin.value)   || 0;
  const vatRate            = parseFloat(inp.vatRate.value)        || 0;

  const gramsWithWaste  = gramsUsed * (1 + wastePct / 100);
  const filamentCost    = (gramsWithWaste / 1000) * filamentPricePerKg;
  const electricityCost = (printerW / 1000) * printH * kwhPrice;
  const laborCost       = laborRate * laborH;
  const deprCost        = (printerCost / printerLife) * printH;
  const postTotal       = postCost + packagingCost;
  const subtotal        = filamentCost + electricityCost + laborCost + deprCost + postTotal;
  const riskCost        = subtotal * (failureRisk / 100);
  const baseWithRisk    = subtotal + riskCost;
  const marginCost      = baseWithRisk * (profitMargin / 100);
  const beforeVat       = baseWithRisk + marginCost;
  const vatCost         = beforeVat * (vatRate / 100);
  const total           = beforeVat + vatCost;

  out.filament.textContent    = fmt(filamentCost);
  out.electricity.textContent = fmt(electricityCost);
  out.labor.textContent       = fmt(laborCost);
  out.depr.textContent        = fmt(deprCost);
  out.post.textContent        = fmt(postTotal);
  out.bMaterial.textContent   = fmt(filamentCost);
  out.bElec.textContent       = fmt(electricityCost);
  out.bLabor.textContent      = fmt(laborCost);
  out.bDepr.textContent       = fmt(deprCost);
  out.bPost.textContent       = fmt(postTotal);
  out.bSubtotal.textContent   = fmt(subtotal);
  out.bRisk.textContent       = fmt(riskCost);
  out.bMargin.textContent     = fmt(marginCost);
  out.bVat.textContent        = fmt(vatCost);

  const prevText = out.finalPrice.textContent;
  out.finalPrice.textContent = fmt(total);
  if (prevText !== out.finalPrice.textContent) {
    out.finalPrice.classList.remove('price-pulse');
    void out.finalPrice.offsetWidth;
    out.finalPrice.classList.add('price-pulse');
  }
  out.perGram.textContent = gramsUsed > 0
    ? `${(total / gramsUsed).toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${currencySymbol}/g`
    : `— ${currencySymbol}/g`;

  updateChart([filamentCost, electricityCost, laborCost, deprCost, postTotal, riskCost]);
}

// ══════════════════════════════════════════════
// PRINT HISTORY (localStorage + Firestore)
// ══════════════════════════════════════════════
const HISTORY_KEY = 'printcost_history';
const loadHistory = () => {
  if (currentUser) return firestoreHistory;
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
};
const saveHistory = l => {
  if (!currentUser) localStorage.setItem(HISTORY_KEY, JSON.stringify(l));
};

function renderHistory() {
  const list = loadHistory();
  const container = $('historyList');
  if (!list.length) { container.innerHTML = '<p class="history-empty">Sin impresiones guardadas aún.</p>'; return; }
  container.innerHTML = list.map((item, idx) => `
    <div class="history-item">
      <div class="history-item-info">
        <div class="history-item-name">${escapeHtml(item.name || 'Sin nombre')}</div>
        <div class="history-item-date">${item.date} · ${item.grams}g ${item.material}</div>
      </div>
      <span class="history-item-price">${item.price}</span>
      <button class="history-item-del" onclick="deleteHistoryItem(${idx})" title="Eliminar">×</button>
    </div>`).join('');
}

function deleteHistoryItem(idx) {
  if (currentUser) {
    const item = firestoreHistory[idx];
    if (item && item._id) db.collection(`users/${currentUser.uid}/history`).doc(item._id).delete();
  } else {
    const list = loadHistory(); list.splice(idx, 1); saveHistory(list); renderHistory();
  }
}

$('btnSave').addEventListener('click', async () => {
  const name = inp.printName.value.trim() || `Print #${Date.now()}`;
  const now  = new Date();
  const item = {
    name,
    date: now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
    price: out.finalPrice.textContent,
    grams: inp.filamentUsed.value,
    material: inp.materialType.options[inp.materialType.selectedIndex].text.split('—')[0].trim(),
  };
  const btn = $('btnSave');
  btn.textContent = '⏳ Guardando...'; btn.disabled = true;

  console.log('🔍 Intento de guardado en historial. Usuario autenticado:', !!currentUser, 'UID:', currentUser?.uid);
  
  if (currentUser) {
    try {
      console.log('📤 Guardando en Firestore/users/' + currentUser.uid + '/history');
      const ref = await db.collection(`users/${currentUser.uid}/history`).add({ ...item, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      console.log('✅ Guardado exitoso en Firestore:', ref.id);
      showToast('☁️ ✅ Guardado exitosamente en la nube');
      btn.textContent = '✅ ¡Guardado en nube!';
    } catch (e) {
      console.error('❌ Error Firestore - Code:', e.code, 'Message:', e.message, 'Stack:', e.stack);
      showToast(`❌ Error: ${e.code || e.message}`, true);
      setTimeout(() => {
        showToast('💾 Guardando en localStorage como respaldo...', true);
        const list = loadHistory(); list.unshift(item); if (list.length > 50) list.pop(); saveHistory(list); renderHistory();
        btn.textContent = '⚠️ Guardado localmente';
      }, 2000);
    }
  } else {
    console.log('💾 Usuario no autenticado, guardando en localStorage');
    const list = loadHistory(); list.unshift(item); if (list.length > 50) list.pop(); saveHistory(list); renderHistory();
    showToast('💾 Guardado localmente');
    btn.textContent = '✅ Guardado!';
  }
  setTimeout(() => { btn.textContent = '💾 Guardar en historial'; btn.disabled = false; }, 1800);
});

// Two-step clear
let clearHistoryPending = false, clearHistoryTimer = null;
$('btnClear').addEventListener('click', () => {
  if (!clearHistoryPending) {
    clearHistoryPending = true;
    const btn = $('btnClear');
    btn.textContent = '⚠️ ¿Confirmar borrado?';
    btn.style.color = 'var(--red)'; btn.style.borderColor = 'rgba(248,113,113,0.5)';
    clearHistoryTimer = setTimeout(() => {
      clearHistoryPending = false;
      btn.textContent = '🗑️ Limpiar historial'; btn.style.color = ''; btn.style.borderColor = '';
    }, 3000);
  } else {
    clearTimeout(clearHistoryTimer); clearHistoryPending = false;
    const btn = $('btnClear');
    btn.textContent = '🗑️ Limpiar historial'; btn.style.color = ''; btn.style.borderColor = '';
    if (currentUser) {
      const batch = db.batch();
      firestoreHistory.forEach(i => { if (i._id) batch.delete(db.collection(`users/${currentUser.uid}/history`).doc(i._id)); });
      batch.commit();
    } else { localStorage.removeItem(HISTORY_KEY); renderHistory(); }
  }
});

// ── THEME TOGGLE ──
$('themeToggle').addEventListener('click', () => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
  $('iconSun').classList.toggle('hidden', !isLight);
  $('iconMoon').classList.toggle('hidden', isLight);
  updateChart(costChart.data.datasets[0].data);
  if (diaryBarChart) updateDiaryChart();
});

// ── CURRENCY ──
inp.currency.addEventListener('change', () => { updateCurrencySymbols(); calculate(); renderDiaryStats(); renderDiary(); });

// ── INPUT LISTENERS ──
Object.values(inp).forEach(el => {
  if (!el) return;
  const event = el.tagName === 'INPUT' && el.type === 'range' ? 'input' : 'change';
  el.addEventListener(event, calculate);
  if (el.tagName === 'INPUT' && el.type !== 'range') el.addEventListener('input', calculate);
});

// ══════════════════════════════════════════════
// DIARY (localStorage + Firestore)
// ══════════════════════════════════════════════
const DIARY_KEY = 'printcost_diary';
const loadDiary = () => {
  if (currentUser) return firestoreDiary;
  try { return JSON.parse(localStorage.getItem(DIARY_KEY)) || []; } catch { return []; }
};
const saveDiary = l => { if (!currentUser) localStorage.setItem(DIARY_KEY, JSON.stringify(l)); };

let diaryFilter = 'all', diarySearch = '', currentType = 'buy';

// ── BAR CHART ──
let diaryBarChart = null;
function initDiaryChart() {
  if (diaryBarChart) return;
  diaryBarChart = new Chart($('diaryChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Filamento','Resina','Repuesto','Herramienta','Embalaje','Otro (compra)','Pieza','Prototipo','Figura','Funcional','Otro (venta)'],
      datasets: [
        { label: 'Compras', data: new Array(11).fill(0), backgroundColor: 'rgba(248,113,113,0.7)', borderColor: '#f87171', borderWidth: 1.5, borderRadius: 6 },
        { label: 'Ventas',  data: new Array(11).fill(0), backgroundColor: 'rgba(52,211,153,0.7)',  borderColor: '#34d399', borderWidth: 1.5, borderRadius: 6 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e8e8f0', font: { family: 'Inter', size: 11 }, padding: 12, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } }
      },
      scales: {
        x: { ticks: { color: '#8888a8', font: { size: 10 }, maxRotation: 30 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#8888a8', font: { size: 10 }, callback: v => `${v}${currencySymbol}` }, grid: { color: 'rgba(255,255,255,0.04)' } }
      },
      animation: { duration: 400 }
    }
  });
}

const buyCats  = ['filamento','resina','repuesto','herramienta','embalaje','otro'];
const sellCats = ['pieza','prototipo','figura','funcional','otro'];

function updateDiaryChart() {
  if (!diaryBarChart) return;
  const data = loadDiary();
  const buyData = new Array(11).fill(0), sellData = new Array(11).fill(0);
  data.forEach(item => {
    const amount = parseFloat(item.amount) || 0;
    if (item.type === 'buy') { const i = buyCats.indexOf(item.category); if (i >= 0) buyData[i] += amount; }
    else { const i = sellCats.indexOf(item.category); if (i >= 0) sellData[6 + i] += amount; }
  });
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const lc = isDark ? '#e8e8f0' : '#1a1a2e', gc = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
  diaryBarChart.data.datasets[0].data = buyData;
  diaryBarChart.data.datasets[1].data = sellData;
  diaryBarChart.options.plugins.legend.labels.color = lc;
  diaryBarChart.options.scales.x.ticks.color = isDark ? '#8888a8' : '#555577';
  diaryBarChart.options.scales.y.ticks.color = isDark ? '#8888a8' : '#555577';
  diaryBarChart.options.scales.x.grid.color = gc;
  diaryBarChart.options.scales.y.grid.color = gc;
  diaryBarChart.update();
}

function renderDiaryStats() {
  const data = loadDiary();
  const totalBuys  = data.filter(i => i.type === 'buy').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalSells = data.filter(i => i.type === 'sell').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const profit = totalSells - totalBuys;
  $('d-total-buys').textContent  = fmt(totalBuys);
  $('d-total-sells').textContent = fmt(totalSells);
  $('d-entries').textContent = data.length;
  const profitEl = $('d-profit'), profitCard = $('stat-profit-card'), profitIcon = $('d-profit-icon');
  profitEl.textContent = (profit >= 0 ? '+' : '') + fmt(profit);
  profitCard.classList.remove('is-profit','is-loss');
  if (profit > 0) { profitCard.classList.add('is-profit'); profitIcon.textContent = '📈'; }
  else if (profit < 0) { profitCard.classList.add('is-loss'); profitIcon.textContent = '📉'; }
  else { profitIcon.textContent = '📊'; }
}

const catIcons = { filamento:'🧵',resina:'🧪',repuesto:'🔧',herramienta:'🛠️',embalaje:'📦',pieza:'🖨️',prototipo:'🔩',figura:'🎭',funcional:'⚙️',otro:'🗂️' };

function renderDiary() {
  initDiaryChart(); renderDiaryStats(); updateDiaryChart();
  const data = loadDiary(), container = $('diaryList'), search = diarySearch.toLowerCase();
  const filtered = data.filter((item, idx) => {
    item._idx = idx;
    return (diaryFilter === 'all' || item.type === diaryFilter) &&
      (!search || item.name.toLowerCase().includes(search) || (item.notes || '').toLowerCase().includes(search));
  });
  if (!filtered.length) { container.innerHTML = '<p class="history-empty">Sin entradas que coincidan.</p>'; return; }
  container.innerHTML = filtered.map(item => {
    const icon = catIcons[item.category] || (item.type === 'buy' ? '🛒' : '💵');
    const sign = item.type === 'buy' ? '−' : '+', label = item.type === 'buy' ? 'Compra' : 'Venta';
    return `<div class="diary-item is-${item.type}">
      <span class="diary-item-badge">${icon}</span>
      <div class="diary-item-body">
        <div class="diary-item-name">${escapeHtml(item.name)}</div>
        <div class="diary-item-meta">
          <span>${label}</span><span>·</span><span>${escapeHtml(item.category)}</span><span>·</span><span>${item.date}</span>
          ${item.notes ? `<span>·</span><span>${escapeHtml(item.notes)}</span>` : ''}
        </div>
      </div>
      <span class="diary-item-amount">${sign}${fmt(parseFloat(item.amount)||0)}</span>
      <button class="diary-item-del" onclick="deleteDiaryItem(${item._idx})" title="Eliminar">×</button>
    </div>`;
  }).join('');
}

function deleteDiaryItem(idx) {
  if (currentUser) {
    const item = firestoreDiary[idx];
    if (item && item._id) db.collection(`users/${currentUser.uid}/diary`).doc(item._id).delete();
  } else { const data = loadDiary(); data.splice(idx, 1); saveDiary(data); renderDiary(); }
}

$('typeBuy').addEventListener('click',  () => { currentType = 'buy';  updateTypeUI(); });
$('typeSell').addEventListener('click', () => { currentType = 'sell'; updateTypeUI(); });
function updateTypeUI() {
  $('typeBuy').classList.toggle('active',  currentType === 'buy');
  $('typeSell').classList.toggle('active', currentType === 'sell');
  $('buy-fields').classList.toggle('hidden',  currentType !== 'buy');
  $('sell-fields').classList.toggle('hidden', currentType !== 'sell');
}

$('dBtnAdd').addEventListener('click', async () => {
  const name = $('dEntryName').value.trim(), amount = parseFloat($('dAmount').value);
  const date = $('dDate').value, notes = $('dNotes').value.trim();
  const cat  = currentType === 'buy' ? $('dBuyCategory').value : $('dSellCategory').value;
  if (!name)           { alert('Por favor introduce una descripción.'); $('dEntryName').focus(); return; }
  if (!amount || amount <= 0) { alert('Por favor introduce un importe válido.'); $('dAmount').focus(); return; }
  const now = new Date();
  const dateStr = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  const entry = { type: currentType, name, category: cat, amount, date: dateStr, notes };
  const btn = $('dBtnAdd'); btn.textContent = '⏳ Guardando...'; btn.disabled = true;

  console.log('🔍 Intento de añadir entrada. Usuario autenticado:', !!currentUser, 'UID:', currentUser?.uid);

  if (currentUser) {
    try {
      console.log('📤 Guardando en Firestore/users/' + currentUser.uid + '/diary');
      const ref = await db.collection(`users/${currentUser.uid}/diary`).add({ ...entry, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      console.log('✅ Entrada guardada exitosamente en Firestore:', ref.id);
      showToast('☁️ ✅ Entrada guardada en la nube');
    } catch (e) {
      console.error('❌ Error Firestore - Code:', e.code, 'Message:', e.message, 'Stack:', e.stack);
      showToast(`❌ Error: ${e.code || e.message}`, true);
      setTimeout(() => {
        showToast('💾 Guardando en localStorage como respaldo...', true);
        const data = loadDiary(); data.unshift(entry); saveDiary(data); renderDiary();
      }, 2000);
    }
  } else {
    console.log('💾 Usuario no autenticado, guardando entrada en localStorage');
    const data = loadDiary(); data.unshift(entry); saveDiary(data); renderDiary();
    showToast('💾 Guardado localmente');
  }
  $('dEntryName').value = ''; $('dAmount').value = ''; $('dNotes').value = '';
  btn.textContent = '✅ Añadido!';
  setTimeout(() => { btn.textContent = '➕ Añadir entrada'; btn.disabled = false; }, 1500);
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); diaryFilter = btn.dataset.filter; renderDiary();
  });
});

$('dSearch').addEventListener('input', e => { diarySearch = e.target.value; renderDiary(); });

let clearDiaryPending = false, clearDiaryTimer = null;
$('dBtnClearAll').addEventListener('click', () => {
  if (!clearDiaryPending) {
    clearDiaryPending = true;
    const btn = $('dBtnClearAll');
    btn.textContent = '⚠️ ¿Confirmar borrado total?'; btn.style.color = 'var(--red)'; btn.style.borderColor = 'rgba(248,113,113,0.5)';
    clearDiaryTimer = setTimeout(() => { clearDiaryPending = false; btn.textContent = '🗑️ Borrar todo el registro'; btn.style.color = ''; btn.style.borderColor = ''; }, 3000);
  } else {
    clearTimeout(clearDiaryTimer); clearDiaryPending = false;
    const btn = $('dBtnClearAll'); btn.textContent = '🗑️ Borrar todo el registro'; btn.style.color = ''; btn.style.borderColor = '';
    if (currentUser) {
      const batch = db.batch();
      firestoreDiary.forEach(i => { if (i._id) batch.delete(db.collection(`users/${currentUser.uid}/diary`).doc(i._id)); });
      batch.commit();
    } else { localStorage.removeItem(DIARY_KEY); renderDiary(); }
  }
});

$('dDate').valueAsDate = new Date();

// ── HELPERS ──
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// ── CALCULAR BUTTON ──
const btnCalcular = $('btnCalcular');
if (btnCalcular) {
  btnCalcular.addEventListener('click', () => {
    calculate(); btnCalcular.textContent = '✅ Calculado!';
    setTimeout(() => { btnCalcular.textContent = '🔢 Calcular'; }, 1200);
  });
}

// ── CSV EXPORT ──
function downloadCSV(filename, rows) {
  const BOM = '\uFEFF';
  const csv = BOM + rows.map(r => r.map(cell => { const s = String(cell ?? '').replace(/"/g, '""'); return /[,"\n\r]/.test(s) ? `"${s}"` : s; }).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}
$('btnExportHistory').addEventListener('click', () => {
  const list = loadHistory();
  if (!list.length) { alert('No hay datos en el historial para exportar.'); return; }
  downloadCSV(`printcost_historial_${new Date().toISOString().slice(0,10)}.csv`, [['Nombre','Fecha','Gramos (g)','Material','Precio final'], ...list.map(i => [i.name, i.date, i.grams, i.material, i.price])]);
});
$('dBtnExport').addEventListener('click', () => {
  const data = loadDiary();
  if (!data.length) { alert('No hay datos en el diario para exportar.'); return; }
  downloadCSV(`printcost_diario_${new Date().toISOString().slice(0,10)}.csv`, [['Tipo','Descripcion','Categoria',`Importe (${currencySymbol})`,'Fecha','Notas'], ...data.map(i => [i.type === 'buy' ? 'Compra' : 'Venta', i.name, i.category, i.amount, i.date, i.notes || ''])]);
});

// ══════════════════════════════════════════════
// AUTH UI
// ══════════════════════════════════════════════
let authMode = 'login';

function showAuthModal() {
  $('authBackdrop').classList.remove('hidden');
  requestAnimationFrame(() => $('authBackdrop').classList.add('visible'));
  setTimeout(() => $('authEmail').focus(), 150);
}
function hideAuthModal() {
  $('authBackdrop').classList.remove('visible');
  setTimeout(() => $('authBackdrop').classList.add('hidden'), 250);
  $('authError').classList.add('hidden');
  $('authEmail').value = ''; $('authPassword').value = ''; $('authPasswordConfirm').value = '';
}
function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  $('authModalTitle').textContent = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
  $('btnAuthSubmit').textContent  = isLogin ? 'Iniciar sesión' : 'Registrarse';
  $('authToggleText').textContent = isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
  $('authToggleMode').textContent = isLogin ? 'Regístrate' : 'Inicia sesión';
  $('authPasswordConfirmGroup').classList.toggle('hidden', isLogin);
  $('authError').classList.add('hidden');
}

function updateAuthUI(user) {
  const loginBtn = $('authLoginBtn'), userAvatar = $('authUserAvatar');
  if (user) {
    loginBtn.classList.add('hidden'); userAvatar.classList.remove('hidden');
    const avatarImg = $('authAvatarImg'), avatarInit = $('authAvatarInitial');
    if (user.photoURL) { avatarImg.src = user.photoURL; avatarImg.classList.remove('hidden'); avatarInit.classList.add('hidden'); }
    else { avatarImg.classList.add('hidden'); avatarInit.classList.remove('hidden'); avatarInit.textContent = (user.displayName || user.email || '?')[0].toUpperCase(); }
    $('authUserName').textContent  = user.displayName || 'Usuario';
    $('authUserEmail').textContent = user.email || '';
  } else {
    loginBtn.classList.remove('hidden'); userAvatar.classList.add('hidden');
    $('authUserMenu')?.classList.remove('visible');
  }
}

function showToast(msg, isError = false) {
  let toast = $('appToast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'appToast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.className = 'toast' + (isError ? ' toast-error' : '') + ' visible';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ── MIGRATION from localStorage to Firestore ──
const MIGRATION_KEY = 'printcost_migration_done';
function offerMigration(user) {
  const migrationDone = localStorage.getItem(MIGRATION_KEY);
  if (migrationDone) {
    console.log('✅ Migración ya realizada anteriormente, no mostrar banner');
    return;
  }
  const lh = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  const ld = JSON.parse(localStorage.getItem(DIARY_KEY)   || '[]');
  if (!lh.length && !ld.length) { localStorage.setItem(MIGRATION_KEY, 'true'); return; }
  setTimeout(() => {
    if (firestoreHistory.length > 0 || firestoreDiary.length > 0) { localStorage.setItem(MIGRATION_KEY, 'true'); return; }
    const total = lh.length + ld.length; if (!total) return;
    const banner = document.createElement('div');
    banner.id = 'migrationBanner'; banner.className = 'migration-banner';
    banner.innerHTML = `<div class="migration-inner"><span>📦 Tienes ${total} entradas locales. ¿Subirlas a la nube?</span><div class="migration-actions"><button id="btnMigYes" class="btn-mig-yes">☁️ Subir</button><button id="btnMigNo" class="btn-mig-no">No, descartar</button></div></div>`;
    document.body.appendChild(banner);
    $('btnMigYes').addEventListener('click', async () => {
      banner.remove();
      const batch = db.batch();
      lh.forEach(item => { const ref = db.collection(`users/${user.uid}/history`).doc(); batch.set(ref, { ...item, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); });
      ld.forEach(item => { const ref = db.collection(`users/${user.uid}/diary`).doc(); batch.set(ref, { ...item, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); });
      try { 
        await batch.commit(); 
        localStorage.removeItem(HISTORY_KEY); 
        localStorage.removeItem(DIARY_KEY);
        localStorage.setItem(MIGRATION_KEY, 'true');
        console.log(`✅ ${total} entradas subidas a la nube`);
        showToast(`✅ ${total} entradas subidas a la nube`); 
      }
      catch (e) { 
        console.error('Error migración:', e);
        showToast('❌ Error al migrar datos', true); 
      }
    });
    $('btnMigNo').addEventListener('click', () => { 
      localStorage.setItem(MIGRATION_KEY, 'true');
      banner.remove(); 
      showToast('💾 Datos locales mantenidos');
    });
  }, 1500);
}

// ── AUTH EVENT LISTENERS ──
$('authLoginBtn').addEventListener('click', () => { setAuthMode('login'); showAuthModal(); });
$('authUserAvatar').addEventListener('click', e => { e.stopPropagation(); $('authUserMenu').classList.toggle('visible'); });
document.addEventListener('click', e => { if (!$('authUserAvatar').contains(e.target)) $('authUserMenu')?.classList.remove('visible'); });
$('authLogout').addEventListener('click', () => { auth.signOut(); showToast('👋 Sesión cerrada'); });
$('authClose').addEventListener('click', hideAuthModal);
$('authBackdrop').addEventListener('click', e => { if (e.target === $('authBackdrop')) hideAuthModal(); });
$('authToggleMode').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));

$('btnGoogle').addEventListener('click', async () => {
  try {
    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    hideAuthModal(); showToast('✅ Sesión iniciada con Google');
  } catch (e) {
    $('authError').textContent = 'Error al iniciar con Google. ' + (e.message || '');
    $('authError').classList.remove('hidden');
  }
});

$('btnAuthSubmit').addEventListener('click', async () => {
  const email = $('authEmail').value.trim(), pass = $('authPassword').value, pass2 = $('authPasswordConfirm').value;
  const errEl = $('authError'); errEl.classList.add('hidden');
  if (!email || !pass) { errEl.textContent = 'Rellena el correo y la contraseña.'; errEl.classList.remove('hidden'); return; }
  if (authMode === 'register') {
    if (pass !== pass2) { errEl.textContent = 'Las contraseñas no coinciden.'; errEl.classList.remove('hidden'); return; }
    if (pass.length < 6) { errEl.textContent = 'La contraseña necesita al menos 6 caracteres.'; errEl.classList.remove('hidden'); return; }
    try { await auth.createUserWithEmailAndPassword(email, pass); hideAuthModal(); showToast('✅ Cuenta creada. ¡Bienvenido!'); }
    catch (e) { errEl.textContent = translateAuthError(e.code); errEl.classList.remove('hidden'); }
  } else {
    try { await auth.signInWithEmailAndPassword(email, pass); hideAuthModal(); showToast('✅ Sesión iniciada'); }
    catch (e) { errEl.textContent = translateAuthError(e.code); errEl.classList.remove('hidden'); }
  }
});
$('authPassword').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAuthSubmit').click(); });
$('authPasswordConfirm').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAuthSubmit').click(); });

function translateAuthError(code) {
  const m = { 'auth/user-not-found':'No existe cuenta con ese correo.', 'auth/wrong-password':'Contraseña incorrecta.', 'auth/email-already-in-use':'Ya existe una cuenta con ese correo.', 'auth/invalid-email':'El correo no es válido.', 'auth/too-many-requests':'Demasiados intentos. Inténtalo más tarde.', 'auth/weak-password':'Contraseña demasiado débil.', 'auth/invalid-credential':'Correo o contraseña incorrectos.' };
  return m[code] || 'Error de autenticación. Inténtalo de nuevo.';
}

// ── FIREBASE AUTH STATE ──
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    console.log('✅ Usuario autenticado:', user.uid, user.email);
    updateAuthUI(user);
    // Subscribe to Firestore history
    unsubHistory = db.collection(`users/${user.uid}/history`)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        snap => { 
          console.log('📋 Historial cargado:', snap.docs.length, 'documentos');
          firestoreHistory = snap.docs.map(d => ({ _id: d.id, ...d.data() })); 
          renderHistory(); 
        },
        error => { 
          console.error('❌ Error al cargar historial:', error.code, error.message);
          showToast(`❌ Error cargando historial: ${error.code}`, true);
        }
      );
    // Subscribe to Firestore diary
    unsubDiary = db.collection(`users/${user.uid}/diary`)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        snap => { 
          console.log('📒 Diario cargado:', snap.docs.length, 'documentos');
          firestoreDiary = snap.docs.map(d => ({ _id: d.id, ...d.data() })); 
          if (!$('page-diary').classList.contains('page-hidden')) renderDiary(); 
        },
        error => { 
          console.error('❌ Error al cargar diario:', error.code, error.message);
          showToast(`❌ Error cargando diario: ${error.code}`, true);
        }
      );
    offerMigration(user);
  } else {
    currentUser = null;
    console.log('🚪 Usuario desconectado');
    if (unsubHistory) { unsubHistory(); unsubHistory = null; }
    if (unsubDiary)   { unsubDiary();   unsubDiary   = null; }
    firestoreHistory = []; firestoreDiary = [];
    updateAuthUI(null); renderHistory();
    if (!$('page-diary').classList.contains('page-hidden')) renderDiary();
  }
});

// ── INIT ──
updateCurrencySymbols();
calculate();
renderHistory();
