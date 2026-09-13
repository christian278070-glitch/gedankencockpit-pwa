document.addEventListener("DOMContentLoaded", () => {
  // --- GLOBALE STATE VARIABLEN ---
  let rawData = [];
  let currentCategory = "Alle";
  const categories = ["Alle", "Eingang", "Arbeit", "Privat", "KI", "Lesen"];
  
  // Lade Secrets aus dem lokalen iPhone Speicher (Niemals auf GitHub!)
  let apiUrl = localStorage.getItem("gc_api_url") || "";
  let apiToken = localStorage.getItem("gc_api_token") || "";

  const cardsContainer = document.getElementById("cards-container");
  const tabsContainer = document.getElementById("tabs-container");
  const searchInput = document.getElementById("search-input");
  const errorBanner = document.getElementById("error-banner");
  
  const setupModal = document.getElementById("setup-modal");
  const moveModal = document.getElementById("move-modal");
  let itemToMoveId = null; 
  let itemToMoveCat = null;

  // --- START ---
  init();

  function init() {
    renderTabs();
    
    document.getElementById("btn-refresh").addEventListener("click", fetchData);
    document.getElementById("btn-settings").addEventListener("click", openSetupModal);
    searchInput.addEventListener("input", renderCards); // Live-Suche
    
    document.getElementById("btn-cancel-move").addEventListener("click", closeModals);
    document.getElementById("btn-confirm-move").addEventListener("click", executeMove);
    document.getElementById("btn-save-setup").addEventListener("click", saveSetup);
    
    // Modal bei Klick auf Hintergrund schließen (Auditor Fix)
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", (e) => {
        if(e.target === overlay) closeModals();
      });
    });

    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    updateNetworkStatus();

    // Wenn API URL fehlt, zwinge den Nutzer ins Setup
    if (!apiUrl || !apiToken) {
      openSetupModal();
    } else {
      loadLocalData();
      fetchData();
    }
  }

  // --- AUTH / SETUP ---
  function openSetupModal() {
    document.getElementById("input-api-url").value = apiUrl;
    document.getElementById("input-api-token").value = apiToken;
    openModal(setupModal);
  }

  function saveSetup() {
    apiUrl = document.getElementById("input-api-url").value.trim();
    apiToken = document.getElementById("input-api-token").value.trim();
    localStorage.setItem("gc_api_url", apiUrl);
    localStorage.setItem("gc_api_token", apiToken);
    closeModals();
    fetchData();
  }

  // --- UI UTILS ---
  function updateNetworkStatus() {
    document.getElementById("offline-banner").style.display = navigator.onLine ? "none" : "block";
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.style.display = "block";
    setTimeout(() => errorBanner.style.display = "none", 4000);
  }

  function openModal(modalEl) {
    modalEl.classList.add("open");
    document.body.classList.add("modal-open");
  }

  function closeModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
    document.body.classList.remove("modal-open");
    itemToMoveId = null;
  }

  // --- DATENLADEN ---
  function loadLocalData() {
    const cached = localStorage.getItem("gc_data");
    if (cached) {
      try { rawData = JSON.parse(cached); renderCards(); } catch(e) {}
    }
  }

  async function fetchData() {
    if (!apiUrl || !apiToken || !navigator.onLine) return;
    
    cardsContainer.innerHTML = '<div class="loading-text">Synchronisiere...</div>';
    
    try {
      const res = await fetch(`${apiUrl}?token=${encodeURIComponent(apiToken)}`);
      if (!res.ok) throw new Error("HTTP Fehler " + res.status);
      const data = await res.json();
      
      if (data.status === "error") throw new Error(data.message || "Auth fehlgeschlagen");
      
      rawData = data;
      localStorage.setItem("gc_data", JSON.stringify(rawData));
      renderCards();
    } catch(err) {
      console.error("Fetch Error:", err);
      showError("Netzwerkfehler beim Laden.");
      loadLocalData(); 
    }
  }

  // --- RENDERING (100% Sicher vor XSS via DOM-Erzeugung) ---
  function renderTabs() {
    tabsContainer.innerHTML = "";
    categories.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = `tab ${cat === currentCategory ? "active" : ""}`;
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        currentCategory = cat;
        renderTabs();
        renderCards();
      });
      tabsContainer.appendChild(btn);
    });
  }

  function renderTextInto(container, text) {
    container.innerHTML = "";
    if (!text) return;
    
    const str = String(text);
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    let last = 0;
    let m;

    while ((m = urlRegex.exec(str)) !== null) {
      // Normaler Text vor der URL
      if (m.index > last) {
        container.appendChild(document.createTextNode(str.slice(last, m.index)));
      }

      let url = m[0];
      let suffix = "";
      
      // Satzzeichen am Link-Ende abtrennen
      const trailingMatch = url.match(/[.,;!?)]+$/);
      if (trailingMatch) {
        suffix = trailingMatch[0];
        url = url.slice(0, -suffix.length);
      }

      let isValidUrl = false;
      try {
        const u = new URL(url);
        isValidUrl = (u.protocol === "https:" || u.protocol === "http:");
      } catch (e) {
        isValidUrl = false;
      }

      if (isValidUrl) {
        const a = document.createElement("a");
        a.href = url;
        a.textContent = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        container.appendChild(a);
      } else {
        container.appendChild(document.createTextNode(url));
      }

      if (suffix) {
        container.appendChild(document.createTextNode(suffix));
      }

      last = m.index + m[0].length;
    }

    // Restlicher Text nach der letzten URL
    if (last < str.length) {
      container.appendChild(document.createTextNode(str.slice(last)));
    }
  }

  function renderCards() {
    cardsContainer.innerHTML = "";
    const searchTerm = searchInput.value.toLowerCase();

    const filtered = rawData.filter(x => {
      const matchCat = currentCategory === "Alle" || x.category === currentCategory;
      
      const safeText = x.text ? x.text.toLowerCase() : "";
      const safeSubcat = x.subcat ? x.subcat.toLowerCase() : "";
      
      const matchSearch = searchTerm === "" || 
                          safeText.includes(searchTerm) || 
                          safeSubcat.includes(searchTerm);
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      cardsContainer.innerHTML = '<div class="loading-text">Keine Einträge gefunden.</div>';
      return;
    }

    filtered.forEach(entry => {
      const card = document.createElement("div");
      card.className = "card";

      const header = document.createElement("div");
      header.className = "card-header";
      
      const badgeGroup = document.createElement("div");
      const catBadge = document.createElement("span");
      catBadge.className = "badge";
      catBadge.textContent = entry.category;
      
      const subBadge = document.createElement("span");
      subBadge.className = "badge";
      subBadge.style.marginLeft = "8px";
      subBadge.style.background = "#475569";
      subBadge.textContent = entry.subcat || "";
      
      badgeGroup.appendChild(catBadge);
      badgeGroup.appendChild(subBadge);

      const dateSpan = document.createElement("span");
      dateSpan.textContent = entry.date;
      
      header.appendChild(badgeGroup);
      header.appendChild(dateSpan);

      const textBody = document.createElement("div");
      textBody.className = "card-text";
      // Aufruf der sicheren DOM-Renderfunktion
      renderTextInto(textBody, entry.text || "");
      
      const statusDiv = document.createElement("div");
      statusDiv.style.fontSize = "12px";
      statusDiv.style.color = "var(--text-muted)";
      statusDiv.textContent = `Status: ${entry.status || ""}`;

      const actions = document.createElement("div");
      actions.className = "card-actions";
      
      const btnMove = document.createElement("button");
      btnMove.className = "btn-move";
      btnMove.textContent = "Verschieben";
      btnMove.addEventListener("click", () => {
        itemToMoveId = entry.id;
        itemToMoveCat = entry.category;
        document.getElementById("move-target-cat").value = entry.category;
        document.getElementById("move-target-subcat").value = entry.subcat || "";
        openModal(moveModal);
      });

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-delete";
      btnDelete.textContent = "Löschen";
      btnDelete.addEventListener("click", () => executeDelete(entry.id, entry.category));

      actions.appendChild(btnMove);
      actions.appendChild(btnDelete);

      card.appendChild(header);
      card.appendChild(textBody);
      card.appendChild(statusDiv);
      card.appendChild(actions);

      cardsContainer.appendChild(card);
    });
  }

  // --- SERVER AKTIONEN (mit echter UUID!) ---
  async function executeDelete(id, category) {
    if (!navigator.onLine) { showError("Löschen nur im Online-Modus möglich."); return; }
    if (!confirm("Diesen Eintrag endgültig löschen?")) return;

    const backupData = [...rawData];
    
    // Optimistic UI: Sofort ausblenden
    rawData = rawData.filter(x => x.id !== id);
    localStorage.setItem("gc_data", JSON.stringify(rawData));
    renderCards();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "delete", id: id, category: category, token: apiToken })
      });
      const result = await res.json();
      if (result.status !== "ok") throw new Error(result.message);
    } catch(err) {
      console.error(err);
      showError("Fehler beim Löschen. Stelle Karte wieder her.");
      rawData = backupData; // Rollback
      localStorage.setItem("gc_data", JSON.stringify(rawData));
      renderCards();
    }
  }

  async function executeMove() {
    if (!navigator.onLine) { showError("Nur im Online-Modus möglich."); return; }
    if (!itemToMoveId) return;

    const targetCat = document.getElementById("move-target-cat").value;
    const targetSub = document.getElementById("move-target-subcat").value.trim();
    const entryId = itemToMoveId;
    const fromCat = itemToMoveCat;
    
    closeModals();
    cardsContainer.innerHTML = '<div class="loading-text">Verschiebe...</div>';

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "move", id: entryId, fromCat: fromCat, toCat: targetCat, newSubcat: targetSub, token: apiToken })
      });
      const result = await res.json();
      if (result.status !== "ok") throw new Error(result.message);
      
      fetchData(); // Lädt frische Daten vom Server
    } catch(err) {
      console.error(err);
      showError("Verschieben fehlgeschlagen.");
      renderCards();
    }
  }
});
