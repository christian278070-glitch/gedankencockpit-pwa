// --- DEINE GOOGLE APPS SCRIPT WEB-APP URL HIER EINTRAGEN ---
const API_URL = "https://script.google.com/macros/s/AKfycbz1x76rzYXPopExypsRJOAUyOMTUe_C3tJT-XqB710bie2af69zCFh_fcIf1-j1EgQ3/exec";

let rawData = [];
let cats = ["Alle", "Eingang", "Arbeit", "Privat", "KI", "Lesen"];
let activeCat = "Alle";
let activeSub = "Alle";
let selectedItem = null;

// 1. Service Worker registrieren (für Kaltstart ohne Internet)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}

// 2. Daten laden & Offline-Handling
async function loadDashboardData() {
  const btnRefresh = document.getElementById("btn-refresh");
  const offlineBanner = document.getElementById("offline-banner");
  const cachedData = localStorage.getItem('gedankencockpit_data');
  
  btnRefresh.innerText = "Lade...";

  if (!navigator.onLine) {
    offlineBanner.style.display = "block";
    if (cachedData) {
      rawData = JSON.parse(cachedData);
      renderAll();
    }
    btnRefresh.innerText = "↻ Laden";
    return;
  }

  offlineBanner.style.display = "none";
  try {
    const res = await fetch(API_URL, { redirect: 'follow' });
    const data = await res.json();
    rawData = data;
    localStorage.setItem('gedankencockpit_data', JSON.stringify(data));
    renderAll();
  } catch (err) {
    console.error("Ladefehler:", err);
    if (cachedData) {
      rawData = JSON.parse(cachedData);
      renderAll();
    }
  } finally {
    btnRefresh.innerText = "↻ Laden";
  }
}

// Event-Listener für Statuswechsel
window.addEventListener('online', loadDashboardData);
window.addEventListener('offline', () => {
  document.getElementById("offline-banner").style.display = "block";
});
document.getElementById("btn-refresh").addEventListener('click', loadDashboardData);

// 3. UI Rendern
function renderAll() {
  renderTabs();
  renderSubtabs();
  renderCards();
}

function escapeAndLinkify(text) {
  const div = document.createElement("div");
  div.textContent = text;
  const safe = div.innerHTML;
  const p = /(\b(https?:\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|]))/ig;
  return safe.replace(p, "<a href=\"$1\" target=\"_blank\" rel=\"noopener\">$1</a>");
}

function renderTabs() {
  document.getElementById("tabs").innerHTML = cats.map(c => 
    `<div class="tab ${c === activeCat ? "active" : ""}" onclick="setCat('${c}')">${c}</div>`
  ).join("");
}

function renderSubtabs() {
  const sDiv = document.getElementById("subtabs");
  if (activeCat === "Alle") { sDiv.innerHTML = ""; return; }
  const subs = ["Alle"];
  rawData.filter(d => d.category === activeCat).forEach(d => {
    if (d.subcat && subs.indexOf(d.subcat) === -1) subs.push(d.subcat);
  });
  if (subs.length <= 1) { sDiv.innerHTML = ""; return; }
  sDiv.innerHTML = subs.map(s => 
    `<div class="subtab ${s === activeSub ? "active" : ""}" onclick="setSub('${s}')">${s}</div>`
  ).join("");
}

function renderCards() {
  const cDiv = document.getElementById("cards");
  let d = rawData;
  if (activeCat !== "Alle") d = d.filter(x => x.category === activeCat);
  if (activeSub !== "Alle") d = d.filter(x => x.subcat === activeSub);
  
  if (!d.length) { cDiv.innerHTML = `<div class="empty">Keine Einträge vorhanden</div>`; return; }
  
  cDiv.innerHTML = d.map((x, idx) => 
    `<div class="card">
      <div class="card-meta">
        <div><span class="badge">${x.category}</span><span class="badge badge-sub">${x.subcat}</span></div>
        <span>${x.date}</span>
      </div>
      <div class="card-text">${escapeAndLinkify(x.text)}</div>
      <div class="card-footer">
        <span>${x.status}</span>
        <button type="button" class="move-btn" onclick="openMoveModal('${x.rawTime}', event)">⇄ Verschieben</button>
      </div>
    </div>`
  ).join("");
}

window.setCat = function(c) { activeCat = c; activeSub = "Alle"; renderAll(); }
window.setSub = function(s) { activeSub = s; renderAll(); }

// 4. Modal & Verschieben via fetch (POST statt google.script.run)
window.openMoveModal = function(rawTimeStr, evt) {
  if (evt) { evt.preventDefault(); evt.stopPropagation(); }
  selectedItem = rawData.find(x => String(x.rawTime) === rawTimeStr);
  if(!selectedItem) return;

  document.getElementById("targetCat").value = selectedItem.category;
  document.getElementById("targetSub").value = (selectedItem.subcat === "Allgemein" ? "" : selectedItem.subcat);
  document.getElementById("moveModal").style.display = "flex";
}

document.getElementById("btnCancelMove").addEventListener('click', () => {
  document.getElementById("moveModal").style.display = "none";
  selectedItem = null;
});

document.getElementById("btnSaveMove").addEventListener('click', async (evt) => {
  if (!selectedItem) return;
  const targetCat = document.getElementById("targetCat").value;
  const targetSub = document.getElementById("targetSub").value.trim() || "Allgemein";
  const btn = document.getElementById("btnSaveMove");
  
  btn.innerText = "Speichere...";
  btn.disabled = true;

  // JSON-Payload für das Backend
  const payload = {
    action: "move",
    fromCat: selectedItem.category,
    toCat: targetCat,
    newSubcat: targetSub,
    origText: selectedItem.origText,
    cleanText: selectedItem.text,
    rawTime: selectedItem.rawTime,
    statusStr: selectedItem.status
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" } // Text/plain umgeht CORS Preflight Probleme in GAS
    });
    const result = await res.json();
    
    if (result.status === "ok") {
      selectedItem.category = targetCat;
      selectedItem.subcat = targetSub;
      document.getElementById("moveModal").style.display = "none";
      renderAll();
    } else {
      alert("Fehler vom Server: " + result.message);
    }
  } catch (err) {
    alert("Netzwerkfehler. Bitte stelle sicher, dass du online bist.");
  } finally {
    btn.innerText = "Speichern";
    btn.disabled = false;
  }
});

// Start
loadDashboardData();
