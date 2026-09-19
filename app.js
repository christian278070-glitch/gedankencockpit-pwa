let rawData = [];
let currentTab = "Eingang";
let currentSubcat = "Alle";
let editingId = null;
let editingCat = null;
let pendingDeleteItem = null;
let undoTimeout = null;
let errorTimeout = null;

const els = {
  setupModal: document.getElementById('setup-modal'),
  apiUrl: document.getElementById('input-api-url'),
  apiToken: document.getElementById('input-api-token'),
  cards: document.getElementById('cards-container'),
  tabs: document.getElementById('tabs-container'),
  subTabs: document.getElementById('sub-tabs-container'),
  editModal: document.getElementById('edit-modal'),
  editText: document.getElementById('edit-text'),
  editSubcat: document.getElementById('edit-subcat'),
  moveCat: document.getElementById('move-target-cat'),
  moveHint: document.getElementById('move-hint'),
  search: document.getElementById('search-input'),
  undoBanner: document.getElementById('undo-banner'),
  offlineBanner: document.getElementById('offline-banner'),
  errorBanner: document.getElementById('error-banner'),
  loadingBanner: document.getElementById('loading-banner'),
  btnCancelSetup: document.getElementById('btn-cancel-setup')
};

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function stripSafeCell(text) {
  if (!text) return "";
  return text.replace(/^'([=+<>\-@])/,"$1");
}

function formatStatus(statusStr) {
  if (statusStr.startsWith("In Bearbeitung")) return "KI arbeitet…";
  if (statusStr.startsWith("Wartet auf KI")) return "Wartet auf KI";
  return statusStr;
}

function showError(msg) {
  if (els.errorBanner) {
    clearTimeout(errorTimeout);
    els.errorBanner.textContent = msg;
    els.errorBanner.style.display = 'block';
    errorTimeout = setTimeout(() => els.errorBanner.style.display = 'none', 4000);
  } else {
    console.error(msg);
  }
}

function openModal(el) {
  if (!el) return;
  el.classList.add('open');
  document.body.classList.add('modal-open');
}

function closeModal(el) {
  if (!el) return;
  el.classList.remove('open');
  document.body.classList.remove('modal-open');
}

function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW-Registrierung fehlgeschlagen:', err));
  }

  const oldUrl = localStorage.getItem('gc_api_url');
  const oldToken = localStorage.getItem('gc_api_token');
  if (oldUrl || oldToken) {
    if (oldUrl) localStorage.setItem('cockpit_api_url', oldUrl);
    if (oldToken) localStorage.setItem('cockpit_api_token', oldToken);
    localStorage.removeItem('gc_api_url');
    localStorage.removeItem('gc_api_token');
    localStorage.removeItem('gc_data');
  }

  window.addEventListener('online', () => { 
    if (els.offlineBanner) els.offlineBanner.style.display = 'none'; 
    fetchData(); 
  });
  window.addEventListener('offline', () => {
    if (els.offlineBanner) els.offlineBanner.style.display = 'block';
  });
  
  if (els.search) els.search.addEventListener('input', renderCards);
  
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      els.apiUrl.value = localStorage.getItem('cockpit_api_url') || "";
      els.apiToken.value = localStorage.getItem('cockpit_api_token') || "";
      if (els.btnCancelSetup) els.btnCancelSetup.style.display = 'block';
      openModal(els.setupModal);
    });
  }
  
  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) btnRefresh.addEventListener('click', fetchData);
  
  const btnSaveSetup = document.getElementById('btn-save-setup');
  if (btnSaveSetup) btnSaveSetup.addEventListener('click', saveSetup);
  
  if (els.btnCancelSetup) {
    els.btnCancelSetup.addEventListener('click', () => closeModal(els.setupModal));
  }
  
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => closeModal(els.editModal));
  
  const btnSaveEdit = document.getElementById('btn-save-edit');
  if (btnSaveEdit) btnSaveEdit.addEventListener('click', executeEdit);
  
  const btnDelete = document.getElementById('btn-delete-entry');
  if (btnDelete) btnDelete.addEventListener('click', triggerDelete);
  
  if (els.undoBanner) els.undoBanner.addEventListener('click', cancelDelete);
  
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        if (overlay.id === 'setup-modal' && (!localStorage.getItem('cockpit_api_url') || !localStorage.getItem('cockpit_api_token'))) return;
        closeModal(overlay);
      }
    });
  });

  if (!navigator.onLine && els.offlineBanner) els.offlineBanner.style.display = 'block';

  const cachedData = localStorage.getItem('cockpit_data');
  if (cachedData) {
    try { rawData = JSON.parse(cachedData); renderTabs(); renderCards(); } catch (e) {}
  }

  const url = localStorage.getItem('cockpit_api_url');
  const token = localStorage.getItem('cockpit_api_token');
  if (!url || !token) { 
    if (els.btnCancelSetup) els.btnCancelSetup.style.display = 'none';
    openModal(els.setupModal); 
    return; 
  }
  
  fetchData();
}

function saveSetup() {
  const urlVal = els.apiUrl.value.trim().replace(/\/u\/\d+\//, '/');
  const tokenVal = els.apiToken.value.trim();
  
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(urlVal)) {
    showError("Ungültige Web-App URL. Muss auf /exec enden.");
    return;
  }
  if (!tokenVal) {
    showError("Token fehlt.");
    return;
  }
  
  localStorage.setItem('cockpit_api_url', urlVal);
  localStorage.setItem('cockpit_api_token', tokenVal);
  closeModal(els.setupModal);
  fetchData();
}

async function apiCall(payload) {
  if (!navigator.onLine && payload.action !== "list") {
    throw new Error("Offline: Änderungen können nicht gespeichert werden.");
  }
  const url = localStorage.getItem('cockpit_api_url');
  payload.token = localStorage.getItem('cockpit_api_token');
  if (payload.action !== "list") payload.requestId = generateUUID();
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, 
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) throw new Error("HTTP Fehler " + res.status);
  
  let data;
  try { data = await res.json(); } catch (e) { throw new Error("Ungültige Serverantwort"); }
  
  if (data && !Array.isArray(data) && data.status === "error") {
    throw new Error(data.message || "Serverfehler");
  }
  return data;
}

async function fetchData() {
  if (!navigator.onLine) return;
  if (els.loadingBanner) els.loadingBanner.style.display = 'block';
  try {
    const data = await apiCall({ action: "list" });
    if (!Array.isArray(data)) throw new Error("Unerwartete Serverantwort (kein Array)");
    
    rawData = data.filter(item => !(pendingDeleteItem && item.id === pendingDeleteItem.id));
    localStorage.setItem('cockpit_data', JSON.stringify(rawData));
    renderTabs();
    renderCards();
  } catch (err) {
    showError(err.message);
  } finally {
    if (els.loadingBanner) els.loadingBanner.style.display = 'none';
  }
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const frag = document.createDocumentFragment();
  let lastIdx = 0;
  text.replace(urlRegex, (match, url, offset) => {
    frag.appendChild(document.createTextNode(text.slice(lastIdx, offset)));
    
    let cleanUrl = url;
    let trailingPunctuation = "";
    const pMatch = cleanUrl.match(/([.,;!?)]+)$/);
    if (pMatch) {
      trailingPunctuation = pMatch[1];
      cleanUrl = cleanUrl.substring(0, cleanUrl.length - trailingPunctuation.length);
    }
    
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        const a = document.createElement('a');
        a.href = cleanUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = cleanUrl;
        frag.appendChild(a);
        if (trailingPunctuation) frag.appendChild(document.createTextNode(trailingPunctuation));
      } else {
        frag.appendChild(document.createTextNode(match));
      }
    } catch(e) {
      frag.appendChild(document.createTextNode(match));
    }
    
    lastIdx = offset + match.length;
  });
  frag.appendChild(document.createTextNode(text.slice(lastIdx)));
  return frag;
}

function renderTabs() {
  if (!els.tabs || !els.subTabs) return;
  const cats = ["Alle", "Eingang", "Arbeit", "Privat", "KI", "Lesen"];
  els.tabs.innerHTML = "";
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `tab ${cat === currentTab ? 'active' : ''}`;
    btn.textContent = cat;
    btn.onclick = () => { currentTab = cat; currentSubcat = "Alle"; renderTabs(); renderCards(); };
    els.tabs.appendChild(btn);
  });
  
  let activeItems = rawData;
  if (currentTab !== "Alle") {
    activeItems = activeItems.filter(i => i.category === currentTab);
  }
  
  const subs = ["Alle", ...new Set(activeItems.map(i => stripSafeCell(i.subcat)).filter(Boolean))];
  els.subTabs.innerHTML = "";
  subs.forEach(sub => {
    const btn = document.createElement('button');
    btn.className = `sub-tab ${sub === currentSubcat ? 'active' : ''}`;
    btn.textContent = sub;
    btn.onclick = () => { currentSubcat = sub; renderTabs(); renderCards(); };
    els.subTabs.appendChild(btn);
  });
}

function renderCards() {
  if (!els.cards) return;
  els.cards.innerHTML = "";
  const query = (els.search ? els.search.value.toLowerCase() : "");
  const hasQuery = query.length > 0;
  
  let filtered = rawData;
  
  if (!hasQuery && currentTab !== "Alle") {
    filtered = filtered.filter(i => i.category === currentTab);
  }
  if (!hasQuery && currentSubcat !== "Alle") {
    filtered = filtered.filter(i => stripSafeCell(i.subcat) === currentSubcat);
  }
  if (hasQuery) {
    filtered = filtered.filter(i => 
      stripSafeCell(i.text).toLowerCase().includes(query) || 
      stripSafeCell(i.subcat).toLowerCase().includes(query)
    );
  }
  
  filtered.sort((a, b) => {
    if (a.done === b.done) return b.rawTime - a.rawTime;
    return a.done ? 1 : -1;
  });
  
  if (filtered.length === 0) {
    els.cards.innerHTML = `<div style="text-align:center; color:var(--text-muted)">Keine Einträge</div>`;
    return;
  }
  
  filtered.forEach(item => {
    const isPending = item.status.includes("Wartet auf KI") || item.status.includes("In Bearbeitung");
    const card = document.createElement('div');
    card.className = `card ${item.done ? 'is-done' : ''}`;
    if (isPending) card.style.borderLeft = "4px solid var(--accent)";
    
    const header = document.createElement('div');
    header.className = "card-header";
    
    const metaSpan = document.createElement('span');
    metaSpan.textContent = `${item.date} · ${formatStatus(item.status)}`;
    
    const catBadge = document.createElement('span');
    catBadge.className = "badge";
    const showCat = currentTab === "Alle" || hasQuery;
    catBadge.textContent = showCat ? `${item.category}: ${stripSafeCell(item.subcat)}` : stripSafeCell(item.subcat);
    
    header.appendChild(metaSpan);
    header.appendChild(catBadge);
    
    const content = document.createElement('div');
    content.className = "card-text";
    content.appendChild(linkify(stripSafeCell(item.text)));
    
    const actions = document.createElement('div');
    actions.className = "card-actions";
    
    const btnDone = document.createElement('button');
    btnDone.className = `btn-action btn-done ${item.done ? 'active' : ''}`;
    btnDone.textContent = item.done ? "Wieder öffnen" : "Erledigen";
    btnDone.onclick = () => toggleDone(item.category, item.id, !item.done);
    
    const btnEdit = document.createElement('button');
    btnEdit.className = "btn-action";
    btnEdit.textContent = "Bearbeiten";
    btnEdit.onclick = () => openEditModal(item);
    
    actions.appendChild(btnDone);
    actions.appendChild(btnEdit);
    
    card.appendChild(header);
    card.appendChild(content);
    card.appendChild(actions);
    els.cards.appendChild(card);
  });
}

async function toggleDone(cat, id, targetState) {
  const item = rawData.find(i => i.id === id);
  if (item) { item.done = targetState; renderCards(); }
  try {
    await apiCall({ action: "set_done", category: cat, id: id, done: targetState });
    localStorage.setItem('cockpit_data', JSON.stringify(rawData));
  } catch (err) {
    if (item) { item.done = !targetState; renderCards(); }
    showError("Fehler beim Speichern: " + err.message);
  }
}

function openEditModal(item) {
  editingId = item.id;
  editingCat = item.category;
  els.editText.value = stripSafeCell(item.text);
  els.editSubcat.value = stripSafeCell(item.subcat);
  els.moveCat.value = item.category;
  
  const isPending = item.status.includes("Wartet auf KI") || item.status.includes("In Bearbeitung");
  els.moveCat.disabled = isPending;
  if (els.moveHint) els.moveHint.style.display = isPending ? 'block' : 'none';
  
  openModal(els.editModal);
}

async function executeEdit() {
  const id = editingId;
  const fromCat = editingCat;
  const newCat = els.moveCat.value;
  const newText = els.editText.value.trim();
  const newSubcat = els.editSubcat.value.trim();
  
  if (!newText) {
    showError("Text darf nicht leer sein.");
    return;
  }
  
  closeModal(els.editModal);
  
  try {
    if (newCat !== fromCat && !els.moveCat.disabled) {
      await apiCall({ action: "move", fromCat: fromCat, toCat: newCat, id: id, newSubcat: newSubcat });
    }
    
    const item = rawData.find(i => i.id === id);
    if (item && (stripSafeCell(item.text) !== newText || stripSafeCell(item.subcat) !== newSubcat)) {
      await apiCall({ action: "edit", category: newCat, id: id, newText: newText, newSubcat: newSubcat });
    }
    
    fetchData();
  } catch (err) {
    showError("Fehler beim Speichern: " + err.message);
    fetchData();
  }
}

function triggerDelete() {
  closeModal(els.editModal);
  const idx = rawData.findIndex(i => i.id === editingId);
  if (idx === -1) return;
  
  if (pendingDeleteItem) {
    clearTimeout(undoTimeout);
    commitDelete(); 
  }
  
  pendingDeleteItem = rawData.splice(idx, 1)[0];
  renderTabs(); renderCards();
  
  if (els.undoBanner) els.undoBanner.style.display = 'block';
  undoTimeout = setTimeout(() => commitDelete(), 5000);
}

function cancelDelete() {
  clearTimeout(undoTimeout);
  if (els.undoBanner) els.undoBanner.style.display = 'none';
  if (pendingDeleteItem) {
    rawData.push(pendingDeleteItem);
    rawData.sort((a, b) => b.rawTime - a.rawTime);
    pendingDeleteItem = null;
    renderTabs(); renderCards();
  }
}

async function commitDelete() {
  if (els.undoBanner) els.undoBanner.style.display = 'none';
  if (!pendingDeleteItem) return;
  const toDelete = pendingDeleteItem;
  pendingDeleteItem = null;
  try {
    await apiCall({ action: "delete", category: toDelete.category, id: toDelete.id });
    localStorage.setItem('cockpit_data', JSON.stringify(rawData));
  } catch(err) {
    showError("Fehler beim Löschen. Eintrag wird wiederhergestellt.");
    rawData.push(toDelete);
    rawData.sort((a, b) => b.rawTime - a.rawTime);
    renderCards();
  }
}

init();
