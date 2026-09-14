document.addEventListener("DOMContentLoaded", () => {
  let rawData = [];
  let currentCategory = "Alle";
  let currentSubcategory = "Alle"; 
  const categories = ["Alle", "Eingang", "Arbeit", "Privat", "KI", "Lesen"];
  
  let apiUrl = localStorage.getItem("gc_api_url") || "";
  let apiToken = localStorage.getItem("gc_api_token") || "";

  const cardsContainer = document.getElementById("cards-container");
  const tabsContainer = document.getElementById("tabs-container");
  const subTabsContainer = document.getElementById("sub-tabs-container"); 
  const searchInput = document.getElementById("search-input");
  const errorBanner = document.getElementById("error-banner");
  
  const setupModal = document.getElementById("setup-modal");
  const moveModal = document.getElementById("move-modal");
  const editModal = document.getElementById("edit-modal");
  
  let itemToMoveId = null; 
  let itemToMoveCat = null;
  let itemToMoveText = null; 
  let itemToEdit = null;

  let pendingDeleteTimer = null;
  let pendingDeleteItem = null;

  init();

  function init() {
    renderTabs();
    
    document.getElementById("btn-refresh").addEventListener("click", fetchData);
    document.getElementById("btn-settings").addEventListener("click", openSetupModal);
    searchInput.addEventListener("input", renderCards);
    
    document.getElementById("btn-cancel-move").addEventListener("click", closeModals);
    document.getElementById("btn-confirm-move").addEventListener("click", executeMove);
    document.getElementById("btn-save-setup").addEventListener("click", saveSetup);
    
    const btnCancelEdit = document.getElementById("btn-cancel-edit");
    const btnSaveEdit = document.getElementById("btn-save-edit");
    if (btnCancelEdit) btnCancelEdit.addEventListener("click", closeModals);
    if (btnSaveEdit) btnSaveEdit.addEventListener("click", executeEdit);

    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModals();
      });
    });

    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    updateNetworkStatus();

    if (!apiUrl || !apiToken) {
      openSetupModal();
    } else {
      loadLocalData();
      fetchData();
    }
  }

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

  function updateNetworkStatus() {
    const offlineBanner = document.getElementById("offline-banner");
    if (offlineBanner) {
      offlineBanner.style.display = navigator.onLine ? "none" : "block";
    }
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.style.display = "block";
    setTimeout(() => errorBanner.style.display = "none", 4000);
  }

  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add("open");
    document.body.classList.add("modal-open");
  }

  function closeModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
    document.body.classList.remove("modal-open");
    itemToMoveId = null;
    itemToMoveCat = null;
    itemToMoveText = null;
    itemToEdit = null;
  }

  function loadLocalData() {
    const cached = localStorage.getItem("gc_data");
    if (cached) {
      try { rawData = JSON.parse(cached); renderSubTabs(); renderCards(); } catch(e) {}
    }
  }

  // --- NEUE FEHLERDIFFERENZIERUNG HIER ---
  async function fetchData() {
    if (!apiUrl || !apiToken || !navigator.onLine) return;
    cardsContainer.innerHTML = '<div class="loading-text">Synchronisiere...</div>';
    
    try {
      const res = await fetch(`${apiUrl}?token=${encodeURIComponent(apiToken)}`);
      
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error("Auth-Fehler: API-Token falsch.");
        if (res.status === 404) throw new Error("URL-Fehler: Backend nicht gefunden (404).");
        if (res.status === 500) throw new Error("Server-Fehler: Apps Script ist abgestürzt (500).");
        throw new Error(`HTTP Fehler ${res.status}`);
      }
      
      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error("JSON Parse Error:", parseErr);
        throw new Error("Datenfehler: Google hat kein JSON zurückgegeben.");
      }
      
      if (data.status === "error") throw new Error(data.message || "Auth fehlgeschlagen");
      
      rawData = data;
      localStorage.setItem("gc_data", JSON.stringify(rawData));
      renderSubTabs();
      renderCards();
    } catch(err) {
      console.error("Fetch Error:", err);
      showError(err.message || "Unbekannter Fehler beim Laden.");
      loadLocalData(); 
    }
  }

  function renderTabs() {
    tabsContainer.innerHTML = "";
    categories.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = `tab ${cat === currentCategory ? "active" : ""}`;
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        currentCategory = cat;
        currentSubcategory = "Alle"; 
        renderTabs();
        renderSubTabs();
        renderCards();
      });
      tabsContainer.appendChild(btn);
    });
  }

  function renderSubTabs() {
    if (!subTabsContainer) return;
    subTabsContainer.innerHTML = "";
    if (currentCategory === "Alle") return;

    const subcats = new Set();
    rawData.forEach(item => {
      if (item.category === currentCategory && item.subcat) {
        subcats.add(item.subcat);
      }
    });

    if (subcats.size === 0) return;
    const sortedSubcats = ["Alle", ...Array.from(subcats).sort()];

    sortedSubcats.forEach(sub => {
      const btn = document.createElement("button");
      btn.className = `sub-tab ${sub === currentSubcategory ? "active" : ""}`;
      btn.textContent = sub;
      btn.addEventListener("click", () => {
        currentSubcategory = sub;
        renderSubTabs();
        renderCards();
      });
      subTabsContainer.appendChild(btn);
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
      if (m.index > last) {
        container.appendChild(document.createTextNode(str.slice(last, m.index)));
      }

      let url = m[0];
      let suffix = "";
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
      if (suffix) container.appendChild(document.createTextNode(suffix));
      last = m.index + m[0].length;
    }
    if (last < str.length) container.appendChild(document.createTextNode(str.slice(last)));
  }

  function renderCards() {
    cardsContainer.innerHTML = "";
    const searchTerm = searchInput.value.toLowerCase();

    const filtered = rawData.filter(x => {
      const matchCat = currentCategory === "Alle" || x.category === currentCategory;
      const matchSub = currentCategory === "Alle" || currentSubcategory === "Alle" || x.subcat === currentSubcategory;
      const safeText = x.text ? x.text.toLowerCase() : "";
      const safeSubcat = x.subcat ? x.subcat.toLowerCase() : "";
      const matchSearch = searchTerm === "" || safeText.includes(searchTerm) || safeSubcat.includes(searchTerm);
      
      return matchCat && matchSub && matchSearch;
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
      renderTextInto(textBody, entry.text || "");
      
      const statusDiv = document.createElement("div");
      statusDiv.style.fontSize = "12px";
      statusDiv.style.color = "var(--text-muted)";
      statusDiv.textContent = `Status: ${entry.status || ""}`;

      const actions = document.createElement("div");
      actions.className = "card-actions";
      
      const isDone = entry.status === "Erledigt";
      if (isDone) {
        card.classList.add("is-done");
      }

      const btnDone = document.createElement("button");
      btnDone.className = "btn-done" + (isDone ? " done-active" : "");
      btnDone.textContent = isDone ? "↺" : "✓";
      btnDone.addEventListener("click", () => executeToggleDone(entry));

      const btnEdit = document.createElement("button");
      btnEdit.className = "btn-edit";
      btnEdit.textContent = "Bearbeiten";
      btnEdit.addEventListener("click", () => openEditModal(entry));

      const btnMove = document.createElement("button");
      btnMove.className = "btn-move";
      btnMove.textContent = "Verschieben";
      btnMove.addEventListener("click", () => {
        itemToMoveId = entry.id;
        itemToMoveCat = entry.category;
        itemToMoveText = entry.text; 
        document.getElementById("move-target-cat").value = entry.category;
        document.getElementById("move-target-subcat").value = entry.subcat || "";
        openModal(moveModal);
      });

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-delete";
      btnDelete.textContent = "Löschen";
      btnDelete.addEventListener("click", () => scheduleDelete(entry));

      actions.appendChild(btnDone);
      actions.appendChild(btnEdit);
      actions.appendChild(btnMove);
      actions.appendChild(btnDelete);

      card.appendChild(header);
      card.appendChild(textBody);
      card.appendChild(statusDiv);
      card.appendChild(actions);

      cardsContainer.appendChild(card);
    });
  }

  function openEditModal(entry) {
    itemToEdit = entry;
    const textInput = document.getElementById("edit-text");
    const subcatInput = document.getElementById("edit-subcat");
    if (textInput) textInput.value = entry.text || "";
    if (subcatInput) subcatInput.value = entry.subcat || "";
    openModal(editModal);
  }

  async function executeEdit() {
    if (!navigator.onLine) { showError("Bearbeiten nur online möglich."); return; }
    if (!itemToEdit) return;

    const newText = document.getElementById("edit-text").value.trim();
    const newSubcat = document.getElementById("edit-subcat").value.trim();
    const entryId = itemToEdit.id;
    const category = itemToEdit.category;
    const oldTextFallback = itemToEdit.text; 
    const oldEntry = { ...itemToEdit };

    itemToEdit.text = newText;
    itemToEdit.subcat = newSubcat;
    itemToEdit.status = "Erfasst, bearbeitet";
    localStorage.setItem("gc_data", JSON.stringify(rawData));
    renderSubTabs(); 
    renderCards();
    closeModals();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "edit",
          id: entryId,
          category: category,
          newText: newText,
          newSubcat: newSubcat,
          text: oldTextFallback, 
          token: apiToken
        })
      });
      const result = await res.json();
      if (result.status !== "ok") throw new Error(result.message);
    } catch (err) {
      console.error("Edit Error:", err);
      showError("Bearbeiten fehlgeschlagen. Stelle Original wieder her.");
      const idx = rawData.findIndex(x => x.id === entryId);
      if (idx !== -1) rawData[idx] = oldEntry;
      localStorage.setItem("gc_data", JSON.stringify(rawData));
      renderSubTabs();
      renderCards();
    }
  }

  function scheduleDelete(entry) {
    if (pendingDeleteTimer) {
      clearTimeout(pendingDeleteTimer);
      commitDelete(pendingDeleteItem);
    }

    const backupItem = entry;
    pendingDeleteItem = entry;

    rawData = rawData.filter(x => x.id !== entry.id);
    localStorage.setItem("gc_data", JSON.stringify(rawData));
    renderSubTabs();
    renderCards();

    const banner = document.getElementById("undo-banner");
    const undoBtn = document.getElementById("btn-undo");
    if (banner) banner.style.display = "flex";

    if (undoBtn) {
      undoBtn.onclick = () => {
        clearTimeout(pendingDeleteTimer);
        pendingDeleteTimer = null;
        pendingDeleteItem = null;
        if (banner) banner.style.display = "none";
        
        rawData.unshift(backupItem);
        localStorage.setItem("gc_data", JSON.stringify(rawData));
        renderSubTabs();
        renderCards();
      };
    }

    pendingDeleteTimer = setTimeout(() => {
      if (banner) banner.style.display = "none";
      commitDelete(backupItem);
      pendingDeleteTimer = null;
      pendingDeleteItem = null;
    }, 5000);
  }

  async function commitDelete(item) {
    if (!navigator.onLine) {
      showError("Löschen fehlgeschlagen: Kein Netz.");
      return;
    }

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ 
          action: "delete", 
          id: item.id, 
          category: item.category, 
          text: item.text, 
          token: apiToken 
        })
      });
      const result = await res.json();
      if (result.status !== "ok") throw new Error(result.message);
    } catch(err) {
      console.error("Delete Error:", err);
      showError("Fehler beim Löschen auf dem Server.");
      rawData.unshift(item);
      localStorage.setItem("gc_data", JSON.stringify(rawData));
      renderSubTabs();
      renderCards();
    }
  }

  async function executeMove() {
    if (!navigator.onLine) { showError("Nur im Online-Modus möglich."); return; }
    if (!itemToMoveId && !itemToMoveText) return; 

    const targetCat = document.getElementById("move-target-cat").value;
    const targetSub = document.getElementById("move-target-subcat").value.trim();
    const entryId = itemToMoveId;
    const fromCat = itemToMoveCat;
    const oldTextFallback = itemToMoveText; 
    
    closeModals();
    cardsContainer.innerHTML = '<div class="loading-text">Verschiebe...</div>';

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ 
          action: "move", 
          id: entryId, 
          fromCat: fromCat, 
          toCat: targetCat, 
          newSubcat: targetSub, 
          text: oldTextFallback, 
          token: apiToken 
        })
      });
      const result = await res.json();
      if (result.status !== "ok") throw new Error(result.message);
      
      fetchData(); 
    } catch(err) {
      console.error(err);
      showError("Verschieben fehlgeschlagen.");
      renderCards();
    }
  }

  // --- ERLEDIGT LOGIK ---
  async function executeToggleDone(entry) {
    if (!navigator.onLine) { showError("Nur im Online-Modus möglich."); return; }
    
    const oldStatus = entry.status;
    const newStatus = (oldStatus === "Erledigt") ? "Erfasst, bearbeitet" : "Erledigt";

    entry.status = newStatus;
    localStorage.setItem("gc_data", JSON.stringify(rawData));
    renderCards();

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ 
          action: "toggle_done", 
          id: entry.id, 
          category: entry.category, 
          text: entry.text, 
          token: apiToken 
        })
      });
      const result = await res.json();
      if (result.status !== "ok") throw new Error(result.message);
    } catch(err) {
      console.error(err);
      showError("Status-Update fehlgeschlagen.");
      entry.status = oldStatus;
      localStorage.setItem("gc_data", JSON.stringify(rawData));
      renderCards();
    }
  }
});
