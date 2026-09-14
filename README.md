# Gedankencockpit

Persönliches Wissens- und Aufgabenmanagement. Gedanken werden per Sprache
oder E-Mail erfasst, von Gemini klassifiziert, in Google Sheets abgelegt und
in einer PWA angezeigt.

Stand: 14.09.2026, nach abgeschlossenem Code-Audit.

---

## Wenn du länger nicht dran warst — lies das hier zuerst

1. **`DECISIONS.md`** enthält Regeln, die nicht umgedreht werden dürfen.
   Bei jeder KI-gestützten Änderung mitgeben.
2. **Deployment funktioniert anders, als du denkst** — siehe unten unter
   „Backend ändern". Das ist die häufigste Fehlerquelle im Projekt.
3. **`selfCheck()`** im Apps Script ausführen, wenn irgendetwas komisch ist.
   Prüft Blätter, Zugangsdaten, Zeitzone und Kalender auf einen Schlag.

---

## Wo was liegt

| Teil | Ort |
|---|---|
| Frontend (PWA) | dieses Repo, ausgeliefert über GitHub Pages |
| Backend | Apps-Script-Projekt in der Google-Tabelle „Gedankencockpit" |
| Backend-Referenzstand | `Code.gs` in diesem Repo (wird nicht ausgeführt) |
| Datenbank | dieselbe Google-Tabelle, 5 Blätter |
| Zugangsdaten | Apps Script → Projekteinstellungen → Skripteigenschaften |
| Erfassung | iOS-Kurzbefehl + E-Mail an die `+cockpit`-Adresse |

**Dateien im Repo:**

- `index.html` — Markup und komplettes CSS
- `app.js` — gesamte Frontend-Logik
- `sw.js` — Service Worker (Network-First)
- `manifest.json`, Icons
- `Code.gs` — Referenzstand des Backends
- `DECISIONS.md` — verbindliche Architekturentscheidungen

**Datenmodell** (alle fünf Blätter gleich):

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Datum | Typ | Inhalt | Status | Unterkategorie | UUID |

Zeile 1 ist Kopfzeile, alle Schleifen starten bei Zeile 2. Spalte F ist die
einzige Identifikation — ohne UUID lässt sich ein Eintrag weder löschen noch
bearbeiten.

---

## Wie die Verarbeitung läuft

```
Kurzbefehl / E-Mail
   │
   ▼
doPost → saveRawEntryFast()          sofort, ohne KI
   │                                  Status: "Wartet auf KI ⏳ [0]"
   ▼
Blatt "Eingang"
   │
   │  Trigger alle 5 Min:
   │  checkMailsToCockpit() → processPendingAITasks()
   ▼
Gemini klassifiziert → ggf. Kalendertermin
   │
   ▼
Zeile wandert ins Zielblatt (Arbeit / Privat / KI / Lesen)
```

Die Trennung ist Absicht: Der Kurzbefehl wartet nicht auf Gemini. Fällt die
API aus, bleibt der Eintrag in der Queue und wird bis zu dreimal wiederholt.

---

## Backend ändern

1. Apps Script öffnen (aus der Tabelle: Erweiterungen → Apps Script)
2. Ändern, speichern
3. **Bereitstellen → Bereitstellungen verwalten → Stiftsymbol →
   Version: Neu → Bereitstellen**

> ⚠️ **Nicht „Neue Bereitstellung" wählen.** Das erzeugt eine neue URL, und
> dann musst du sie in der PWA (Zahnrad → Setup) *und* im iOS-Kurzbefehl
> nachtragen. Das ist mehrfach passiert und sieht jedes Mal wie ein
> Code-Fehler aus, obwohl es keiner ist.

4. Geänderten Stand in `Code.gs` hier im Repo kopieren und committen
5. **Prüfen, ob die neue Version wirklich läuft** — eine sichtbare Änderung
   suchen und bestätigen. Nicht annehmen.

---

## Frontend ändern

1. Datei ändern, committen, pushen
2. GitHub Pages baut automatisch, dauert ein bis zwei Minuten
3. PWA auf dem iPhone öffnen — die Änderung muss da sein

Der Service Worker läuft Network-First. Du brauchst **kein** `?v=`-Anhängsel
und musst die PWA nicht neu installieren. Wenn eine Änderung trotzdem nicht
ankommt, ist etwas mit `sw.js` nicht in Ordnung — siehe `DECISIONS.md`, F3.

---

## Wenn etwas nicht funktioniert

**Erste Anlaufstelle:** Apps Script → links das Listen-Symbol
(*Ausführungen*). Dort steht bei jedem Trigger-Lauf und jedem API-Aufruf,
was passiert ist. Technische Fehlerdetails gehen bewusst dorthin und nicht
in die Tabelle.

**Zweite Anlaufstelle:** Browser-Konsole. Safari am Mac, Rechtsklick →
Element untersuchen. Das Frontend loggt alle Fehler mit `console.error`.

| Symptom | Ursache |
|---|---|
| „unauthorized" | Token in der App ≠ `APP_TOKEN` in den Skripteigenschaften |
| „URL-Fehler (404)" | Alte Web-App-URL in der App oder im Kurzbefehl |
| Einträge bleiben auf „Wartet auf KI" | Trigger fehlt, API-Key falsch, oder Modellname liefert 404 |
| „Erfasst (ohne KI)" | Drei Versuche gescheitert. Grund steht in den Ausführungen |
| „Eintrag ohne ID" | Zeile ohne UUID. `migrateUUIDs()` ausführen |
| Termine eine Stunde daneben | Projekt-Zeitzone steht nicht auf Europe/Berlin |
| Erster Eintrag eines Blatts fehlt | Kopfzeile in Zeile 1 gelöscht |
| Frontend-Änderung kommt nicht an | Service Worker, siehe `DECISIONS.md` F3 |

---

## Offene Punkte

Alles hier ist bekannt und bewusst liegengeblieben. Kein Sicherheits- oder
Datenintegritätsproblem.

### Kleinere Frontend-Baustellen

- **Setup-Modal ist wegklickbar.** Beim Erststart neben das Sheet getippt →
  App steht leer da. Fix: im Overlay-Handler
  `if (overlay.id === "setup-modal" && (!apiUrl || !apiToken)) return;`
- **`commitDelete` ohne Rollback bei Netzverlust.** Der `return` beim
  Offline-Check kommt vor dem Wiederherstellen. Eintrag ist lokal weg, im
  Sheet noch da.
- **Keine Validierung in `saveSetup()`.** Tippfehler in der URL führt zu
  einer Fehlermeldung, die nicht auf die Ursache zeigt.
- **Keine Debounce auf der Suche.** Kompletter DOM-Neuaufbau pro Tastendruck.
- **Inline-Styles in `app.js`** (`subBadge.style.background`,
  `statusDiv.style.fontSize`) gehören ins CSS.
- **Keine Datalist für Unterkategorien.** Tippfehler erzeugen dauerhaft neue
  Kategorien.
- **Keine CSP** in `index.html`. Wäre jetzt möglich, da kein `innerHTML` mit
  Fremddaten mehr vorkommt.

### Fehlende Features

- **Papierkorb.** `deleteRow()` ist endgültig, nur 5 Sekunden Undo im
  Frontend. Konzept: Blatt „Papierkorb" mit zwei Zusatzspalten
  (Herkunftskategorie, Löschdatum), sonst ist Wiederherstellen nicht möglich.
- **Paging in `doGet`.** Lädt immer alles. Bei einigen tausend Einträgen
  spürbar.
- **Offline-Erfassen.** Kein Puffer, weder in der PWA noch im Kurzbefehl.
- **Erfassen in der PWA.** Einträge entstehen nur über Kurzbefehl und Mail.
- **Klassifizierung für „Lesen".** Mail-Importe im Blatt „Lesen" werden vom
  Roboter nicht angefasst.

### Bekannte Eigenheiten

- Token läuft bei `doGet` im Query-String mit (Apps Script kann keine
  eigenen Request-Header lesen). Alternative: Lesen ebenfalls per POST.
- `cleanLeadingText()` kann legitime Satzanfänge kürzen („Notiz an die
  Redaktion: …"). Die Regel existiert wegen eines Siri-Verhaltens, das
  eigentlich im Kurzbefehl behoben gehört.
- Daten liegen unverschlüsselt in Google Sheets und im `localStorage`.

---

## Wenn du einen KI-Assistenten dazuholst

Prompt-Vorlage:

> Hier sind die Architekturentscheidungen für dieses Projekt. Sie sind
> verbindlich — keine davon darf durch deine Änderung umgedreht werden.
> Wenn du glaubst, dass eine davon falsch ist, sag es mir, aber ändere sie
> nicht eigenmächtig.
>
> [Inhalt von DECISIONS.md]
>
> [betroffene Datei]
>
> Meine Aufgabe: …

Und danach: **jede Änderung einmal wirklich auslösen, bevor sie als erledigt
gilt.** Im Audit trug sechsmal eine Maßnahme das Etikett einer anderen — der
Code sah richtig aus, die Begründung klang plausibel, und es funktionierte
trotzdem nicht.

---

## Zweite Instanz einrichten

Siehe `gedankencockpit-setup.md`. Jede Person braucht eigene Tabelle,
eigenes Apps-Script-Projekt, eigenen Token, eigenen Gemini-Key. Das System
ist Single-Tenant — es gibt keine Trennung zwischen Nutzern.
