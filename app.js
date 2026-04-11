// ── PrintCost · app.js ──────────────────────────────────────────────────────
// 100% Static — localStorage only. Compatible with GitHub Pages.

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
// PRINT HISTORY (localStorage)
// ══════════════════════════════════════════════
const HISTORY_KEY = 'printcost_history';
const loadHistory = () => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
};
const saveHistory = list => localStorage.setItem(HISTORY_KEY, JSON.stringify(list));

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

window.deleteHistoryItem = function(idx) {
  const list = loadHistory();
  list.splice(idx, 1);
  saveHistory(list);
  renderHistory();
};

$('btnSave').addEventListener('click', () => {
  const name = inp.printName.value.trim() || `Print #${Date.now()}`;
  const now  = new Date();
  const item = {
    name,
    date: now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
    price: out.finalPrice.textContent,
    grams: inp.filamentUsed.value,
    material: inp.materialType.options[inp.materialType.selectedIndex].text.split('—')[0].trim(),
  };
  const list = loadHistory();
  list.unshift(item);
  if (list.length > 50) list.pop();
  saveHistory(list);
  renderHistory();
  showToast('💾 Guardado en historial');
  const btn = $('btnSave');
  btn.textContent = '✅ Guardado!';
  setTimeout(() => { btn.textContent = '💾 Guardar en historial'; }, 1500);
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
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
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
// DIARY (localStorage)
// ══════════════════════════════════════════════
const DIARY_KEY = 'printcost_diary';
const loadDiary = () => {
  try { return JSON.parse(localStorage.getItem(DIARY_KEY)) || []; } catch { return []; }
};
const saveDiary = list => localStorage.setItem(DIARY_KEY, JSON.stringify(list));

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

window.deleteDiaryItem = function(idx) {
  const data = loadDiary();
  data.splice(idx, 1);
  saveDiary(data);
  renderDiary();
};

$('typeBuy').addEventListener('click',  () => { currentType = 'buy';  updateTypeUI(); });
$('typeSell').addEventListener('click', () => { currentType = 'sell'; updateTypeUI(); });
function updateTypeUI() {
  $('typeBuy').classList.toggle('active',  currentType === 'buy');
  $('typeSell').classList.toggle('active', currentType === 'sell');
  $('buy-fields').classList.toggle('hidden',  currentType !== 'buy');
  $('sell-fields').classList.toggle('hidden', currentType !== 'sell');
}

$('dBtnAdd').addEventListener('click', () => {
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
  const data = loadDiary();
  data.unshift(entry);
  saveDiary(data);
  renderDiary();
  showToast('💾 Entrada guardada');
  $('dEntryName').value = ''; $('dAmount').value = ''; $('dNotes').value = '';
  const btn = $('dBtnAdd');
  btn.textContent = '✅ Añadido!';
  setTimeout(() => { btn.textContent = '➕ Añadir entrada'; }, 1500);
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
    localStorage.removeItem(DIARY_KEY);
    renderDiary();
  }
});

$('dDate').valueAsDate = new Date();

// ── HELPERS ──
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// ── TOAST ──
function showToast(msg, isError = false) {
  let toast = $('appToast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'appToast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.className = 'toast' + (isError ? ' toast-error' : '') + ' visible';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

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

// ── CSV IMPORT ──
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  function parseLine(line) {
    const fields = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  }
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-záéíóúüñ]/gi, ''));
  const idx = {
    tipo:      headers.findIndex(h => h.includes('tipo')),
    nombre:    headers.findIndex(h => h.includes('desc') || h.includes('nombre') || h.includes('product')),
    categoria: headers.findIndex(h => h.includes('categ')),
    importe:   headers.findIndex(h => h.includes('import') || h.includes('amount') || h.includes('precio')),
    fecha:     headers.findIndex(h => h.includes('fecha') || h.includes('date')),
    notas:     headers.findIndex(h => h.includes('nota') || h.includes('note') || h.includes('coment')),
  };
  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (!cols.length || (cols.length === 1 && !cols[0])) continue;
    const get = (key) => idx[key] >= 0 ? (cols[idx[key]] || '').trim() : '';
    const tipoRaw = get('tipo').toLowerCase();
    const type = tipoRaw.includes('venta') || tipoRaw === 'sell' ? 'sell' : 'buy';
    const name = get('nombre');
    if (!name) continue;
    const amountRaw = get('importe').replace(',', '.').replace(/[^\d.-]/g, '');
    const amount = parseFloat(amountRaw) || 0;
    const rawCat = get('categoria').toLowerCase().replace(/\s+/g, '');
    const buyCatMap  = { filamento:'filamento', resina:'resina', repuesto:'repuesto', herramienta:'herramienta', embalaje:'embalaje' };
    const sellCatMap = { pieza:'pieza', prototipo:'prototipo', figura:'figura', funcional:'funcional' };
    const catNorm = buyCatMap[rawCat] || sellCatMap[rawCat] || 'otro';
    const fecha = get('fecha') || new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
    const notas = get('notas');
    entries.push({ type, name, category: catNorm, amount, date: fecha, notes: notas });
  }
  return entries;
}

$('dBtnImport').addEventListener('click', () => $('dImportFile').click());
$('dImportFile').addEventListener('change', async function() {
  const file = this.files[0];
  if (!file) return;
  this.value = '';
  const text = await file.text();
  const imported = parseCSV(text);
  if (!imported.length) { showToast('⚠️ No se encontraron entradas válidas en el CSV', true); return; }
  const existing = loadDiary();
  const key = e => `${e.type}|${e.name}|${e.amount}|${e.date}`;
  const existingKeys = new Set(existing.map(key));
  const newEntries = imported.filter(e => !existingKeys.has(key(e)));
  const skipped = imported.length - newEntries.length;
  if (!newEntries.length) { showToast(`⚠️ Todas las entradas ya existían (${skipped} omitidas)`, true); return; }
  const merged = [...newEntries, ...existing];
  saveDiary(merged);
  renderDiary();
  let msg = `✅ ${newEntries.length} entradas importadas`;
  if (skipped) msg += ` (${skipped} duplicadas omitidas)`;
  showToast(msg);
});

// ── INIT ──
updateCurrencySymbols();
calculate();
renderHistory();
