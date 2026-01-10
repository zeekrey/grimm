# Tagesschau Plugin

Liefert aktuelle deutsche Nachrichten von [tagesschau.de](https://www.tagesschau.de) via der offiziellen API.

## Features

- Aktuelle Schlagzeilen und Eilmeldungen
- Nachrichten nach Kategorie (Inland, Ausland, Wirtschaft, Sport, Wissenschaft)
- Regionale Nachrichten aus allen 16 Bundesländern
- Nachrichtensuche nach Themen oder Begriffen

## Setup

Keine Konfiguration erforderlich - die Tagesschau API ist öffentlich zugänglich.

## Tools

### `tagesschau_headlines`

Liefert aktuelle Schlagzeilen und Eilmeldungen.

**Parameter:**
| Name | Typ | Erforderlich | Beschreibung |
|------|-----|--------------|--------------|
| `count` | number | Nein | Anzahl der Schlagzeilen (1-10, Standard: 5) |

**Beispiele:**
- "Was gibt es Neues?"
- "Zeig mir die aktuellen Nachrichten"
- "Was passiert gerade in der Welt?"

---

### `tagesschau_news`

Liefert Nachrichten aus einer bestimmten Kategorie.

**Parameter:**
| Name | Typ | Erforderlich | Beschreibung |
|------|-----|--------------|--------------|
| `category` | string | Ja | Kategorie: `inland`, `ausland`, `wirtschaft`, `sport`, `wissen`, `investigativ` |
| `count` | number | Nein | Anzahl der Nachrichten (1-10, Standard: 5) |

**Beispiele:**
- "Zeig mir die Sportnachrichten"
- "Was gibt es Neues in der Wirtschaft?"
- "Internationale Nachrichten bitte"

---

### `tagesschau_regional`

Liefert regionale Nachrichten aus einem Bundesland.

**Parameter:**
| Name | Typ | Erforderlich | Beschreibung |
|------|-----|--------------|--------------|
| `region` | string | Ja | Bundesland (z.B. Bayern, Berlin, Hamburg) |
| `count` | number | Nein | Anzahl der Nachrichten (1-10, Standard: 5) |

**Unterstützte Bundesländer:**
- Baden-Württemberg, Bayern, Berlin, Brandenburg
- Bremen, Hamburg, Hessen, Mecklenburg-Vorpommern
- Niedersachsen, Nordrhein-Westfalen, Rheinland-Pfalz
- Saarland, Sachsen, Sachsen-Anhalt, Schleswig-Holstein, Thüringen

**Beispiele:**
- "Was passiert in Bayern?"
- "Nachrichten aus Berlin"
- "Gibt es Neuigkeiten aus Hamburg?"

---

### `tagesschau_search`

Sucht nach Nachrichten zu einem bestimmten Thema.

**Parameter:**
| Name | Typ | Erforderlich | Beschreibung |
|------|-----|--------------|--------------|
| `query` | string | Ja | Suchbegriff |
| `count` | number | Nein | Anzahl der Ergebnisse (1-10, Standard: 5) |

**Beispiele:**
- "Suche nach Nachrichten über Klimawandel"
- "Was gibt es Neues zur Bundesregierung?"
- "Nachrichten über die Europäische Union"

## API

Dieses Plugin nutzt die offizielle Tagesschau API:
- **Dokumentation:** https://tagesschau.api.bund.dev/
- **Basis-URL:** https://www.tagesschau.de/api2u/

## Testen

```bash
# Unit Tests
bun test plugins/tagesschau

# Manueller Test
bun run demo:llm --tools

# Dann Befehle sprechen oder tippen:
# "Was gibt es Neues?"
# "Zeig mir die Sportnachrichten"
# "Nachrichten aus Bayern"
```

## Lizenz

Teil des Grimm Voice Assistant Projekts.
