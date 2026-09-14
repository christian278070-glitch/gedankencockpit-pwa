# Gedankencockpit – Finales Projekt-Protokoll & Setup-Guide
**Status:** Audit erfolgreich abgeschlossen / Produktionsreif 🚀
**Architektur:** Google Sheets (Backend/Datenbank) + Google Apps Script (API) + PWA auf GitHub Pages (Frontend) + Apple iOS Kurzbefehle (Ingest)

---

## 1. Übersicht & Sicherheitsmerkmale
Das System ist vollständig asynchron, ausfallsicher und gehärtet:
- **XSS-Schutz:** Das Frontend baut alle dynamischen Elemente über die sichere DOM-API (z.B. `document.createElement`), bösartiger Code wird als reiner Text behandelt.
- **Asynchrone Queue:** Siri-Diktate und E-Mails landen sofort im Sheet. Ein zeitgesteuerter Trigger (Cronjob) schickt die Einträge alle 5 Minuten blockweise an die Gemini-KI, um API-Timeouts zu verhindern.
- **Lock-Service:** Parallel eintreffende Diktate oder Verschiebungen blockieren sich nicht gegenseitig, sondern werden sauber hintereinander abgearbeitet.
- **Siri-Bug-Filter:** Ein hartnäckiger iOS-Fehler, bei dem ungefragt das Wort "Text" in den Datenstrom geschmuggelt wird, wird vom Backend automatisch per RegEx (`/^Text(?=[A-ZÄÖÜ])/g`) gefiltert.

---

## 2. Setup-Anleitung (für neue Nutzer)

Da Frontend und Backend strikt getrennt sind, kann die App problemlos geteilt werden, ohne den Code neu hosten zu müssen.

### Schritt A: Das Backend kopieren
1. Das Original-Google-Sheet im Browser öffnen.
2. In der URL das Wort `edit` durch `copy` ersetzen und aufrufen.
3. Die Kopie im eigenen Google Drive speichern. (Der Backend-Code kopiert sich automatisch mit).

### Schritt B: API-Schlüssel eintragen
1. Im neuen Google Sheet auf **Erweiterungen > Apps Script** klicken.
2. Links auf das **Zahnrad (Projekteinstellungen)** klicken.
3. Unter **Skripteigenschaften** drei Keys anlegen:
   - `APP_TOKEN` (Ein selbst ausgedachtes Passwort, z.B. "Geheim123")
   - `GEMINI_API_KEY` (Der eigene Google Gemini API-Schlüssel)
   - `INGEST_ADDRESS` (Die eigene E-Mail, an die Mails weitergeleitet werden)

### Schritt C: Backend live schalten (Deployment)
1. Im Editor oben rechts auf **Bereitstellen > Neue Bereitstellung**.
2. Typ: **Web-App** auswählen.
3. Ausführen als: *Ich* | Zugriff: ***Jeder*** (WICHTIG!)
4. Bereitstellen klicken, Google-Rechte gewähren und die generierte **Web-App-URL** kopieren.
*(Bei zukünftigen Updates des Codes immer über "Bereitstellungen verwalten > Version: Neu" gehen!)*

### Schritt D: Den Hintergrund-Roboter (KI) starten
1. Im Apps Script Editor links auf die **Uhr (Trigger)** klicken.
2. **Trigger hinzufügen**:
   - Funktion: `checkMailsToCockpit`
   - Ereignisquelle: `Zeitgesteuert` -> `Minuten-Timer` -> `Alle 5 Minuten`
3. Speichern.

### Schritt E: Frontend & iOS Kurzbefehl verbinden
1. Die PWA-URL (GitHub Pages) im Browser öffnen.
2. Im erscheinenden Setup-Dialog die **Web-App-URL** (aus Schritt C) und das **APP_TOKEN** eintragen.
3. Den iOS-Kurzbefehl (per iCloud-Link) importieren und im Kurzbefehl-Editor die eigene Web-App-URL und das APP_TOKEN eintragen.

---

## 3. Finaler Backend-Code (`Code.gs`)

*(Dieser Code liegt im Google Apps Script Editor des Sheets)*

```javascript
// ===================================================================
// HILFSFUNKTIONEN & SICHERHEIT
// ===================================================================

function checkAuth_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty("APP_TOKEN");
  if (!expected || String(token) !== expected) {
    throw new Error("unauthorized");
  }
}

function parseToBerlinDate(dateStr) {
  if (!dateStr) return null;
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(dateStr)) return new Date(dateStr);
  var probe = new Date(dateStr + "Z");
  var offset = Utilities.formatDate(probe, "Europe/Berlin", "Z"); 
  return new Date(dateStr + offset.slice(0,3) + ":" + offset.slice(3));
}

function cleanLeadingText(str) {
  if (!str) return "";
  var s = String(str).trim();
  
  if (s.toLowerCase() === "text") return "";
  s = s.replace(/^(text|inhalt|notiz)[\s:\-\.\n]+/gi, "");
  s = s.replace(/^Text(?=[A-ZÄÖÜ])/g, "");
  
  return s.trim();
}

function migrateUUIDs() {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var categories = ["Eingang", "Arbeit", "Privat", "KI", "Lesen"];
  categories.forEach(function(cat) {
    var sheet = doc.getSheetByName(cat);
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (!data[i][5]) { 
          sheet.getRange(i + 1, 6).setValue(Utilities.getUuid());
        }
      }
    }
  });
}

function kalenderErlauben() { CalendarApp.getDefaultCalendar(); }

// ===================================================================
// WEB-APP API & SERVER-AKTIONEN
// ===================================================================
function doGet(e) {
  try {
    try { checkAuth_(e && e.parameter ? e.parameter.token : null); } 
    catch (err) { return ContentService.createTextOutput(JSON.stringify({status:"error", message: "unauthorized"})).setMimeType(ContentService.MimeType.JSON); }

    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var categories = ["Eingang", "Arbeit", "Privat", "KI", "Lesen"];
    var allEntries = [];

    categories.forEach(function(cat) {
      var sheet = doc.getSheetByName(cat);
      if (sheet) {
        var rows = sheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) { 
          var row = rows[i];
          if (!row[0] && !row[2]) continue;
          var dateVal = row[0];
          var rawTime = (dateVal instanceof Date) ? dateVal.getTime() : (new Date(dateVal).getTime() || 0);
          var dateFormatted = (dateVal instanceof Date) ? Utilities.formatDate(dateVal, "Europe/Berlin", "dd.MM.yyyy HH:mm") : String(dateVal);

          allEntries.push({
            id: String(row[5] || ""), rawTime: rawTime, date: dateFormatted,
            type: row[1] || "GEDANKE", text: String(row[2] || ""),
            status: String(row[3] || "Erfasst"), subcat: String(row[4] || ""), category: cat
          });
        }
      }
    });
    allEntries.sort(function(a, b) { return b.rawTime - a.rawTime; });
    return ContentService.createTextOutput(JSON.stringify(allEntries)).setMimeType(ContentService.MimeType.JSON);
  } catch (fatal) { return ContentService.createTextOutput(JSON.stringify({ status: "error" })).setMimeType(ContentService.MimeType.JSON); }
}

function saveRawEntryFast(rawText, type, timestamp) {
  var safeText = String(rawText || "").substring(0, 2000); 
  var text = cleanLeadingText(safeText);
  if (!text || text.trim() === "") throw new Error("Leerer Eintrag");
  
  var entryId = Utilities.getUuid();
  var initialStatus = "Wartet auf KI ⏳ [0]"; 
  var subcat = "Ausstehend";

  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { throw new Error("Server ausgelastet."); }
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Eingang");
    sheet.appendRow([timestamp, type, text, initialStatus, subcat, entryId]);
    return { status: "ok", category: "Eingang", subcategory: subcat, message: "Erfasst" };
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    var data = {};
    try { data = JSON.parse(body); } catch (err) { data = { text: body }; }
    try { checkAuth_(data.token); } catch (err) { return ContentService.createTextOutput(JSON.stringify({status:"error", message: "unauthorized"})).setMimeType(ContentService.MimeType.JSON); }
    
    // (Aktions-Routing wie delete, move, edit, toggle_done... hier der Einfachheit halber gekürzt. Code.gs referenzieren!)
    try {
      var result = saveRawEntryFast(data.text, data.type || "GEDANKE", new Date());
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    } catch(err) { return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.message })).setMimeType(ContentService.MimeType.JSON); }
  } catch (fatal) { return ContentService.createTextOutput(JSON.stringify({ status: "error" })).setMimeType(ContentService.MimeType.JSON); }
}

// ===================================================================
// DER KI-ROBOTER (Cronjob)
// ===================================================================
function processPendingAITasks() {
  // Vollständige Funktion aus dem finalen Audit-Schritt...
}
function checkMailsToCockpit() {
  // Vollständige E-Mail Import Funktion...
}
