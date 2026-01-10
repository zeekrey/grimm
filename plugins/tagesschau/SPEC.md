# Tagesschau Plugin Specification

This document outlines the implementation plan for the Tagesschau plugin, which provides German news from the official Tagesschau API.

## Overview

- **Plugin Name**: `tagesschau`
- **Description**: Liefert aktuelle deutsche Nachrichten von tagesschau.de
- **Version**: 1.0.0
- **API Base URL**: `https://www.tagesschau.de/api2u/`
- **API Documentation**: https://tagesschau.api.bund.dev/

## API Endpoints

The Tagesschau API provides the following endpoints (no authentication required):

### 1. Homepage (`/api2u/homepage/`)
- **Method**: GET
- **Description**: Selected current news and breaking news from the Tagesschau app homepage
- **Parameters**: None
- **Use Case**: Quick overview of top stories

### 2. News (`/api2u/news/`)
- **Method**: GET
- **Description**: Current news and breaking news with filtering
- **Parameters**:
  - `regions` (integer, 1-16): Federal state filter (comma-separated)
  - `ressort` (string): Category filter
    - `inland` - Domestic news
    - `ausland` - International news
    - `wirtschaft` - Economy
    - `sport` - Sports
    - `video` - Video content
    - `investigativ` - Investigative journalism
    - `wissen` - Science/Knowledge
  - `pageSize` (integer, 1-30): Results per page
  - `resultPage` (integer): Page number
- **Use Case**: Filtered news by category or region

### 3. Channels (`/api2u/channels/`)
- **Method**: GET
- **Description**: Current broadcast channels including tagesschau24, livestreams
- **Parameters**: None
- **Use Case**: Get information about live broadcasts

### 4. Search (`/api2u/search/`)
- **Method**: GET
- **Description**: Search news archive
- **Parameters**:
  - `searchText` (string): Search query
  - `pageSize` (integer, 1-30): Results per page
  - `resultPage` (integer): Page number
- **Use Case**: Find specific news topics

## Region Codes

For the `regions` parameter, the following German federal states are available:

| Code | Bundesland |
|------|------------|
| 1 | Baden-Württemberg |
| 2 | Bayern |
| 3 | Berlin |
| 4 | Brandenburg |
| 5 | Bremen |
| 6 | Hamburg |
| 7 | Hessen |
| 8 | Mecklenburg-Vorpommern |
| 9 | Niedersachsen |
| 10 | Nordrhein-Westfalen |
| 11 | Rheinland-Pfalz |
| 12 | Saarland |
| 13 | Sachsen |
| 14 | Sachsen-Anhalt |
| 15 | Schleswig-Holstein |
| 16 | Thüringen |

## Tools to Implement

### 1. `tagesschau_headlines`

**Purpose**: Get current top headlines/breaking news

**Description for LLM**:
"Liefert aktuelle Schlagzeilen und Eilmeldungen von tagesschau.de. Nutze dieses Tool wenn der Benutzer nach aktuellen Nachrichten, Schlagzeilen oder wissen möchte was gerade in Deutschland oder der Welt passiert."

**Parameters**:
```typescript
{
  type: "object",
  properties: {
    count: {
      type: "number",
      description: "Anzahl der Schlagzeilen (1-10, Standard: 5)"
    }
  },
  required: []
}
```

**Implementation**:
- Call `/api2u/homepage/` endpoint
- Extract top N news items from `news` array
- Return title, teaser text, and date for each item

**Response Example**:
```typescript
{
  success: true,
  data: {
    headlines: [
      { title: "...", teaser: "...", date: "...", url: "..." },
      // ...
    ]
  },
  speech: "Hier sind die aktuellen Schlagzeilen: [Top 3 titles]"
}
```

---

### 2. `tagesschau_news`

**Purpose**: Get news filtered by category

**Description for LLM**:
"Liefert Nachrichten aus einer bestimmten Kategorie wie Inland, Ausland, Wirtschaft, Sport oder Wissenschaft. Nutze dieses Tool wenn der Benutzer nach Nachrichten zu einem bestimmten Themenbereich fragt."

**Parameters**:
```typescript
{
  type: "object",
  properties: {
    category: {
      type: "string",
      description: "Nachrichtenkategorie",
      enum: ["inland", "ausland", "wirtschaft", "sport", "wissen", "investigativ"]
    },
    count: {
      type: "number",
      description: "Anzahl der Nachrichten (1-10, Standard: 5)"
    }
  },
  required: ["category"]
}
```

**Implementation**:
- Call `/api2u/news/` with `ressort` parameter
- Extract news items from response
- Format for speech output

---

### 3. `tagesschau_regional`

**Purpose**: Get regional news for a German federal state

**Description for LLM**:
"Liefert regionale Nachrichten aus einem bestimmten Bundesland. Nutze dieses Tool wenn der Benutzer nach Nachrichten aus einer bestimmten Region oder einem Bundesland fragt."

**Parameters**:
```typescript
{
  type: "object",
  properties: {
    region: {
      type: "string",
      description: "Bundesland",
      enum: [
        "baden-württemberg", "bayern", "berlin", "brandenburg",
        "bremen", "hamburg", "hessen", "mecklenburg-vorpommern",
        "niedersachsen", "nordrhein-westfalen", "rheinland-pfalz",
        "saarland", "sachsen", "sachsen-anhalt", "schleswig-holstein", "thüringen"
      ]
    },
    count: {
      type: "number",
      description: "Anzahl der Nachrichten (1-10, Standard: 5)"
    }
  },
  required: ["region"]
}
```

**Implementation**:
- Map region name to region code (1-16)
- Call `/api2u/news/` with `regions` parameter
- Return regional news items

---

### 4. `tagesschau_search`

**Purpose**: Search for specific news topics

**Description for LLM**:
"Sucht nach Nachrichten zu einem bestimmten Thema oder Begriff. Nutze dieses Tool wenn der Benutzer nach Nachrichten zu einem spezifischen Thema, einer Person oder einem Ereignis sucht."

**Parameters**:
```typescript
{
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Suchbegriff"
    },
    count: {
      type: "number",
      description: "Anzahl der Ergebnisse (1-10, Standard: 5)"
    }
  },
  required: ["query"]
}
```

**Implementation**:
- Call `/api2u/search/` with `searchText` parameter
- Return matching news items
- Handle case where no results found

---

## File Structure

```
plugins/tagesschau/
├── index.ts        # Main plugin file with all tools
├── SPEC.md         # This specification document
└── README.md       # User-facing documentation
```

## Implementation Details

### API Client Class

```typescript
class TagesschauClient {
  private baseUrl = "https://www.tagesschau.de/api2u";

  async getHomepage(): Promise<HomepageResponse> { ... }
  async getNews(options?: NewsOptions): Promise<NewsResponse> { ... }
  async search(query: string, count?: number): Promise<SearchResponse> { ... }
}
```

### Type Definitions

```typescript
interface NewsItem {
  sophoraId: string;
  title: string;
  teaserImage?: { url: string };
  date: string;
  firstSentence?: string;
  shareURL: string;
  ressort?: string;
  breakingNews?: boolean;
}

interface HomepageResponse {
  news: NewsItem[];
  regional: NewsItem[];
  type: string;
}

interface NewsResponse {
  news: NewsItem[];
  regional?: NewsItem[];
  nextPage?: string;
  type: string;
}

interface SearchResponse {
  searchResults: NewsItem[];
  totalItemCount: number;
}
```

### Region Mapping

```typescript
const REGION_CODES: Record<string, number> = {
  "baden-württemberg": 1,
  "bayern": 2,
  "berlin": 3,
  "brandenburg": 4,
  "bremen": 5,
  "hamburg": 6,
  "hessen": 7,
  "mecklenburg-vorpommern": 8,
  "niedersachsen": 9,
  "nordrhein-westfalen": 10,
  "rheinland-pfalz": 11,
  "saarland": 12,
  "sachsen": 13,
  "sachsen-anhalt": 14,
  "schleswig-holstein": 15,
  "thüringen": 16,
};
```

### Speech Response Formatting

Since Grimm is a German voice assistant, all speech responses should be in German:

- **Headlines**: "Hier sind die aktuellen Schlagzeilen: [Title 1]. [Title 2]. [Title 3]."
- **Category news**: "Hier sind die aktuellen [Category]-Nachrichten: [Title 1]. [Title 2]."
- **Regional news**: "Hier sind die Nachrichten aus [Region]: [Title 1]. [Title 2]."
- **Search results**: "Zu [Query] habe ich folgende Nachrichten gefunden: [Title 1]. [Title 2]."
- **No results**: "Zu [Query] habe ich leider keine Nachrichten gefunden."

## Error Handling

1. **Network Errors**: Return user-friendly German error message
   - "Die Tagesschau-API ist momentan nicht erreichbar. Bitte versuche es später erneut."

2. **No Results**: Handle gracefully with appropriate message
   - "Zu diesem Thema gibt es aktuell keine Nachrichten."

3. **Invalid Region**: Provide helpful feedback
   - "Dieses Bundesland konnte ich nicht finden."

4. **Rate Limiting**: Implement request timeout (10 seconds)

## Configuration

**Environment Variables**: None required (public API)

**Setup Hook**:
- Log initialization message
- Optionally verify API connectivity

**Teardown Hook**:
- Log shutdown message

## Testing Strategy

### Unit Tests (`index.test.ts`)

1. **Plugin metadata tests**:
   - Plugin name is "tagesschau"
   - Has correct number of tools
   - All tools have required properties

2. **Tool execution tests** (with mocked API):
   - `tagesschau_headlines` returns formatted headlines
   - `tagesschau_news` filters by category correctly
   - `tagesschau_regional` maps regions correctly
   - `tagesschau_search` handles search queries

3. **Error handling tests**:
   - API timeout handling
   - Empty results handling
   - Invalid parameter handling

### Manual Testing

```bash
# Test with demo
bun run demo:llm --tools

# Example voice commands to test:
# "Was gibt es Neues?"
# "Zeig mir die Sportnachrichten"
# "Was passiert in Bayern?"
# "Suche nach Nachrichten über Klimawandel"
```

## Security Considerations

- No authentication required (public API)
- No sensitive data handling
- All requests over HTTPS
- Implement request timeout to prevent hanging

## Future Enhancements (Out of Scope)

- Cache recent requests to reduce API calls
- Support for video content URLs
- Breaking news notifications
- Detailed article content fetching
