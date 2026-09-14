# Gedankencockpit — Einrichtung deiner eigenen Instanz

Diese Anleitung führt dich durch die komplette Einrichtung. Plan dafür etwa
zwei bis drei Stunden ein, am besten an einem Rechner mit dem iPhone daneben.

**Wichtig vorweg:** Du baust eine eigene, komplett getrennte Instanz. Deine
Daten und die von Christian haben nichts miteinander zu tun. Verwende an
keiner Stelle seine URL, seinen Token oder seinen API-Key — sonst schreibt
ihr beide in dieselbe Tabelle und denselben Kalender.

Nach jedem Abschnitt steht ein **Test**. Mach ihn wirklich. Fast alle
Fehler in diesem System zeigen sich später als etwas, das nicht nach seiner
Ursache aussieht.

---

## Was du brauchst

- Ein Google-Konto (Gmail, Tabellen, Kalender)
- Ein GitHub-Konto (kostenlos)
- Ein iPhone mit der Kurzbefehle-App
- Einen Gemini-API-Key (kostenlos, Anleitung in Schritt 3)

---

## Schritt 1 — Google-Tabelle anlegen

1. Gehe auf [sheets.google.com](https://sheets.google.com) und erstelle eine
   neue, leere Tabelle. Nenne sie zum Beispiel „Gedankencockpit".

2. Lege **fünf** Tabellenblätter an, exakt so benannt (Groß-/Kleinschreibung
   zählt):

   ```
   Eingang
   Arbeit
   Privat
   KI
   Lesen
   ```

   Das erste Blatt heißt anfangs „Tabellenblatt1" — benenne es per
   Rechtsklick in `Eingang` um, dann die anderen vier über das Plus unten
   links hinzufügen.

3. Schreibe in **jedes** der fünf Blätter in Zeile 1 diese Kopfzeile:

   | A | B | C | D | E | F |
   |---|---|---|---|---|---|
   | Datum | Typ | Inhalt | Status | Unterkategorie | UUID |

   Das ist keine Kosmetik. Das Skript überspringt beim Lesen immer Zeile 1.
   Fehlt die Kopfzeile, verschwindet der erste Eintrag des Blatts spurlos
   aus der App.

**Test:** Fünf Blätter, in jedem steht in A1 „Datum" und in F1 „UUID".

---

## Schritt 2 — Apps Script einrichten

1. In der Tabelle: **Erweiterungen → Apps Script**. Es öffnet sich ein neuer
   Tab mit einem Code-Editor.

2. Lösche den Beispielcode (`function myFunction() {}`) komplett.

3. Füge den Inhalt der Datei `Code.gs` ein, die du von Christian bekommen
   hast. Speichern mit Strg+S (Windows) bzw. Cmd+S (Mac).

4. Benenne das Projekt oben links um, z. B. „Gedankencockpit Backend".

**Test:** Wähle oben in der Funktionsliste `kalenderErlauben` aus und klicke
**Ausführen**. Google fragt nach Berechtigungen:

- „Berechtigungen überprüfen" → dein Konto wählen
- Es erscheint eine Warnung „Google hat diese App nicht überprüft". Das ist
  normal bei eigenen Skripten. Klicke auf **Erweitert** → **Zu
  Gedankencockpit Backend (unsicher)**.
- Alle Berechtigungen erlauben (Tabellen, Kalender, Gmail, externe Dienste).

Wenn unten „Ausführung abgeschlossen" steht, passt es.

---

## Schritt 3 — Gemini-API-Key besorgen

1. Gehe auf [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Melde dich mit deinem Google-Konto an.
3. **Create API Key** → Key kopieren.

Der Key beginnt mit `AIza...`. Behandle ihn wie ein Passwort: nicht in Chats
posten, nicht in Dateien speichern, die irgendwo hochgeladen werden.

Das kostenlose Kontingent reicht für diese Nutzung locker.

---

## Schritt 4 — Zugangsdaten hinterlegen (Script Properties)

Hier kommen alle Geheimnisse hin. Sie stehen nirgendwo im Code und landen
nie auf GitHub.

**Zuerst deinen eigenen App-Token erzeugen:**

1. Im Apps-Script-Editor auf **+** neben „Dateien" → **Skript** → nenne sie
   `temp`.
2. Füge ein:

   ```javascript
   function tokenErzeugen() {
     console.log(Utilities.getUuid());
   }
   ```

3. Speichern, `tokenErzeugen` auswählen, **Ausführen**. Im Ausführungsprotokoll
   erscheint eine Zeichenkette wie `a1b2c3d4-e5f6-...`. Kopiere sie in eine
   Notiz — du brauchst sie gleich zweimal.
4. Die Datei `temp` kannst du danach wieder löschen (Drei-Punkte-Menü →
   Löschen).

**Dann die Eigenschaften setzen:**

1. Im Apps-Script-Editor links auf das Zahnrad (**Projekteinstellungen**).
2. Runterscrollen zu **Skripteigenschaften** → **Skripteigenschaft hinzufügen**.
3. Lege diese drei an:

   | Eigenschaft | Wert |
   |---|---|
   | `APP_TOKEN` | die UUID aus dem Schritt oben |
   | `GEMINI_API_KEY` | dein Key aus Schritt 3 |
   | `INGEST_ADDRESS` | `deinname+cockpit@gmail.com` |

   Bei `INGEST_ADDRESS` setzt du deine echte Gmail-Adresse ein und hängst
   `+cockpit` vor das `@`. Aus `anna.beispiel@gmail.com` wird
   `anna.beispiel+cockpit@gmail.com`. Diese Adresse existiert automatisch,
   du musst nichts einrichten — Gmail liefert alles daran an dein normales
   Postfach.

   Optional kannst du noch `GEMINI_MODEL` anlegen. Ohne diese Eigenschaft
   nutzt das Skript `gemini-flash-latest`, und das ist die richtige Wahl.
   Trag hier **keine** feste Versionsnummer ein.

4. **Speichern**.

**Ebenfalls in den Projekteinstellungen:** Prüfe die **Zeitzone**. Sie muss
auf `(GMT+01:00) Mitteleuropäische Zeit – Berlin` stehen. Steht dort eine
US-Zeitzone, landen alle Termine mit falscher Uhrzeit im Kalender.

**Test:** Erstelle nochmal kurz eine `temp`-Datei mit dieser Funktion und
führe sie aus:

```javascript
function selfCheck() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var p = PropertiesService.getScriptProperties();
  ["Eingang","Arbeit","Privat","KI","Lesen"].forEach(function(c) {
    var s = ss.getSheetByName(c);
    console.log(c + ": " + (s ? "ok, A1=" + s.getRange(1,1).getValue() : "FEHLT"));
  });
  ["APP_TOKEN","GEMINI_API_KEY","INGEST_ADDRESS"].forEach(function(k) {
    console.log(k + ": " + (p.getProperty(k) ? "gesetzt" : "FEHLT"));
  });
  console.log("Zeitzone: " + Session.getScriptTimeZone());
  console.log("Kalender: " + CalendarApp.getDefaultCalendar().getName());
}
```

Im Protokoll muss bei allen fünf Blättern „ok, A1=Datum" stehen, bei allen
drei Eigenschaften „gesetzt", als Zeitzone „Europe/Berlin" und der Name
deines Kalenders. Steht irgendwo „FEHLT", geh zurück und korrigiere es,
bevor du weitermachst.

---

## Schritt 5 — Als Web-App bereitstellen

1. Oben rechts **Bereitstellen** → **Neue Bereitstellung**.
2. Zahnrad neben „Typ auswählen" → **Web-App**.
3. Einstellungen:
   - Beschreibung: beliebig, z. B. „v1"
   - **Ausführen als:** Ich (deine Adresse)
   - **Zugriff:** Jeder
4. **Bereitstellen** → ggf. nochmal Berechtigungen bestätigen.
5. Die angezeigte **Web-App-URL** kopieren (endet auf `/exec`). Ab in die
   Notiz zum Token.

> **Merk dir das für später:** Wenn du den Code jemals änderst, gehst du auf
> **Bereitstellen → Bereitstellungen verwalten → Stiftsymbol → Version: Neu
> → Bereitstellen**. Dann bleibt die URL gleich.
>
> Wenn du stattdessen wieder „Neue Bereitstellung" wählst, bekommst du eine
> **neue URL** und musst sie überall nachtragen. Das ist die häufigste
> Fehlerquelle im ganzen System.

**Test:** Ruf im Browser auf: `DEINE-URL?token=DEIN-TOKEN`

Es muss `[]` erscheinen (leere Liste, weil noch keine Einträge da sind).
Lässt du den Token weg, muss `{"status":"error","message":"unauthorized"}`
kommen. Wenn beides stimmt, funktioniert das Backend.

---

## Schritt 6 — Automatik einschalten (Trigger)

1. Im Apps-Script-Editor links auf das **Wecker-Symbol** (Trigger).
2. Unten rechts **Trigger hinzufügen**.
3. Einstellen:
   - Funktion: `checkMailsToCockpit`
   - Ereignisquelle: **Zeitgesteuert**
   - Zeitbasierter Trigger: **Minutenintervall**
   - Intervall: **Alle 5 Minuten**
4. **Speichern**.

Dieser Trigger holt neue E-Mails ab und stößt danach die KI-Klassifizierung
an. Er ist das Herz des Systems — ohne ihn bleibt alles auf „Wartet auf KI"
stehen.

**Test:** Schick dir selbst eine Mail an deine `+cockpit`-Adresse, mit
irgendeinem Text im Body. Warte fünf Minuten, dann schau ins Blatt
„Eingang". Dort muss eine neue Zeile stehen, mit einer UUID in Spalte F.
Nach weiteren fünf Minuten sollte in Spalte D eine Kategorie stehen statt
„Wartet auf KI".

---

## Schritt 7 — Frontend auf GitHub

1. Erstelle dir ein Konto auf [github.com](https://github.com), falls du
   noch keins hast.
2. Öffne Christians Repository und klicke oben rechts auf **Fork** → **Create
   fork**. Du hast jetzt eine eigene Kopie.
3. In deinem Fork: **Settings** → links **Pages**.
4. Unter „Branch" **main** auswählen, Ordner `/ (root)`, **Save**.
5. Nach ein bis zwei Minuten erscheint oben die Adresse deiner App, in der
   Form `https://deinname.github.io/gedankencockpit-pwa/`.

Im Repository stehen keine Geheimnisse — URL und Token gibst du gleich in
der App selbst ein, und sie bleiben auf deinem Gerät.

**Test:** Ruf die Adresse im Browser auf. Es muss ein dunkler Bildschirm mit
dem Einrichtungsdialog erscheinen.

---

## Schritt 8 — App aufs iPhone

1. Öffne die GitHub-Pages-Adresse in **Safari** (nicht Chrome — nur Safari
   kann PWAs installieren).
2. Teilen-Symbol → **Zum Home-Bildschirm** → Hinzufügen.
3. App vom Homescreen starten.
4. Im Einrichtungsdialog eintragen:
   - **API-URL:** deine Web-App-URL aus Schritt 5
   - **APP_TOKEN:** deine UUID aus Schritt 4
5. **Speichern & Verbinden**.

**Test:** Die Testmail aus Schritt 6 muss als Karte erscheinen. Tippe auf
„Bearbeiten", ändere den Text, speichere. Lade neu — die Änderung muss
bleiben. Dann „Löschen" und innerhalb von fünf Sekunden „Rückgängig".

---

## Schritt 9 — iOS-Kurzbefehl

Christian schickt dir seinen Kurzbefehl als Datei oder iCloud-Link. Nach dem
Import musst du **zwei** Werte austauschen.

1. Kurzbefehle-App öffnen, den importierten Kurzbefehl bearbeiten
   (Drei-Punkte-Menü).
2. Suche die Aktion **„Inhalte von URL abrufen"**.
3. Ersetze die URL durch **deine** Web-App-URL.
4. Klappe „Erweitert" bzw. den Anfragetext auf. Dort steht ein JSON-Text
   in etwa dieser Form:

   ```json
   {"text": "…Diktat-Variable…", "token": "…lange Zeichenkette…"}
   ```

   Ersetze die Zeichenkette hinter `"token":` durch **deinen** Token.
   Die Diktat-Variable bei `"text":` lässt du unverändert.

5. Speichern. Optional: Kurzbefehl umbenennen, damit Siri ihn per Sprache
   startet („Hey Siri, Notiz ans Cockpit").

**Test:** Kurzbefehl auslösen und etwas diktieren, zum Beispiel „Termin
morgen 15 Uhr Zahnarzt". Dann:

- In der App muss die Karte sofort erscheinen, Status „Wartet auf KI"
- Nach höchstens fünf Minuten: Kategorie „Privat" und ein Termin im Kalender

Löse den Kurzbefehl außerdem einmal aus, ohne etwas zu sagen. Er sollte
einen Fehler melden („Leerer Eintrag") und nichts speichern.

---

## Schritt 10 — Leseliste (optional)

Wenn du Artikel aus Safari sammeln willst: Dafür gibt es einen zweiten
Kurzbefehl, der den Link per Mail an dich selbst schickt — mit dem Betreff
`LESEN`. Das Skript holt solche Mails ab und legt sie im Blatt „Lesen" ab.

Wichtig: Der Betreff muss das Wort `LESEN` enthalten, und die Mail muss von
dir selbst kommen. Mails von anderen Absendern werden ignoriert.

---

## Wenn etwas nicht funktioniert

| Symptom | Wahrscheinliche Ursache |
|---|---|
| App zeigt „unauthorized" | Token in der App stimmt nicht mit `APP_TOKEN` überein |
| App zeigt „URL-Fehler (404)" | Falsche oder alte Web-App-URL im Einrichtungsdialog |
| Einträge bleiben auf „Wartet auf KI" | Trigger fehlt, oder `GEMINI_API_KEY` falsch. Schau in Apps Script unter **Ausführungen** nach der Fehlermeldung |
| Termine im Kalender eine Stunde daneben | Projekt-Zeitzone steht nicht auf Europe/Berlin |
| Erster Eintrag eines Blatts fehlt in der App | Kopfzeile in Zeile 1 vergessen |
| „Eintrag ohne ID" beim Löschen | Zeile hat keine UUID in Spalte F. Im Editor `migrateUUIDs` einmal ausführen |
| Mails landen nicht im Eingang | `INGEST_ADDRESS` stimmt nicht, oder du hast von einem anderen Konto geschickt |
| Änderungen am Code wirken nicht | Bereitstellung nicht aktualisiert (siehe Hinweis in Schritt 5) |

Der beste Diagnoseort ist immer **Apps Script → links das Listen-Symbol
(Ausführungen)**. Dort steht bei jedem Durchlauf, was schiefgegangen ist.

---

## Was das System nicht kann

Damit du es weißt, bevor es dich überrascht:

- **Kein Papierkorb.** Gelöschtes ist nach den fünf Sekunden Undo-Frist
  endgültig weg.
- **Kein Offline-Erfassen.** Ohne Netz kannst du lesen und suchen, aber
  nichts anlegen, ändern oder löschen.
- **Keine Verschlüsselung.** Deine Notizen liegen im Klartext in Google
  Sheets und auf deinem iPhone. Für Persönliches in Ordnung, für wirklich
  Vertrauliches nicht.
- **Alles lädt auf einmal.** Bei einigen tausend Einträgen wird das Öffnen
  der App spürbar langsamer.

---

## Wenn du den Code später änderst

Das System ist über mehrere Runden mit KI-Unterstützung entstanden und
dabei mehrfach an denselben Stellen kaputtgegangen. Christian gibt dir eine
Datei `DECISIONS.md` mit. Darin stehen Entscheidungen, die nicht wieder
umgedreht werden dürfen.

Gib diese Datei **jedes Mal mit**, wenn du einen KI-Assistenten um eine
Codeänderung bittest. Ohne sie schlägt er plausibel klingende Änderungen
vor, die frühere Reparaturen rückgängig machen — das ist hier mehrfach
passiert und hat jedes Mal Tage gekostet.

Und die wichtigste Regel aus dem ganzen Projekt: **Was du nicht getestet
hast, funktioniert nicht.** Jede Änderung einmal wirklich auslösen, bevor
du sie als erledigt abhakst.
