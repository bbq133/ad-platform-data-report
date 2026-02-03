# AdIntel Growth Scientist Suite - Project Context for AI IDE

## 1. Project Overview
**Name:** AdIntel Growth Scientist Suite
**Goal:** A high-performance advertising data analysis platform for cross-border e-commerce. It solves the problem of unstructured data in Meta/Google ads by parsing "Naming Conventions" into structured dimensions for deep analysis.
**Core Philosophy:** "Aetherion Standard" - transforming raw, unstructured ad data into multi-dimensional actionable insights.

## 2. Technology Stack
- **Framework:** React 19 (Hooks/Functional Components), TypeScript (Strict Mode).
- **Build Tool:** Vite 6.
- **UI System:** Tailwind CSS (Focus on "Premium/Industrial" aesthetic: Slate-900, Indigo, Emerald), Lucide React Icons.
- **Data Processing:**
    - `papaparse`: CSV parsing.
    - `xlsx`: Excel file handling.
    - **Core Logic:** Custom in-memory processing for filtering, aggregation, and calculated fields (Memoized).
- **Visualization:** Recharts (High-performance SVG charts).
- **AI Integration:** Google Gemini API (`@google/genai`) for generating diagnostic reports and natural language insights.
- **Deployment:** GitHub Pages (Client-side routing).

## 3. Architecture & Data Flow

### A. Data Source Layer
The application operates in a "Client-Side" heavy manner but connects to two key external services:
1.  **Ad Data API (`api-service.ts`)**:
    -   **Endpoint:** `https://api.globaloneclick.org/project/adsData/getAllFilterData`
    -   **Auth:** Bearer Token.
    -   **Function:** Fetches raw campaign/ad performance data.
    -   **Transformaton:** Data is normalized via `transformApiDataToRawData` to match the internal "Raw Data" format (compatible with CSV uploads).

2.  **Configuration Persistence (Google Apps Script)**:
    -   **Endpoint:** Accessed via `fetchUserConfig` / `saveUserConfig`.
    -   **Purpose:** Stores user-defined settings (Metric Mappings, Dimension Definitions, Custom Formulas) so they persist across sessions without a heavy backend.

### B. Core Business Logic (The "Brain")
1.  **Naming Convention Parsing:**
    -   **Input:** `campaignName` or `adName` (e.g., `US_Prospecting_Video_SpringSale`).
    -   **Process:** User defines a delimiter (e.g., `_`) and maps positions (Index 0, 1, 2...) to Dimensions (Country, Funnel, Creative Type).
    -   **Output:** Virtual columns added to the dataset for grouping and filtering.

2.  **Dynamic Metric Engine:**
    -   Allows users to create custom calculated metrics (e.g., `CPR = Spend / Result`).
    -   Supports math expressions.

3.  **Global Filter Context:**
    -   A unified state controls `startDate`, `endDate`, `platform`, and dynamic dimension filters.
    -   **Constraint:** All charts and AI analysis *must* respect this current filter state.

### C. AI Module
-   **Role:** "Senior Data Scientist".
-   **Input:** Aggregated data summary + Current Filter Context.
-   **Output:** Markdown-formatted reports highlighting "Wins" (High ROAS) and "Losses" (Inefficient Spend), plus readability-focused strategic advice.

## 4. Key Data Constraints
-   **Raw Data Fields (`RawDataRow`):**
    -   Standard: `Spend`, `Impressions`, `Clicks`, `Purchases`, `KV` (Key-Value custom fields).
    -   Platform Specifics: Google (Campaign/AdGroup), Meta (Campaign/AdSet/Ad).
-   **API Response Mapping:**
    -   `cost` -> `Spend`
    -   `conversionValue` -> `Purchases conversion value`
    -   `roas` is often calculated on the fly as `conversionValue / cost`.

## 5. Developer Guidelines
-   **UI Aesthetics:** Maintain the "Industrial High-Tech" look. Dark mode default. Glassmorphism for panels.
-   **Performance:** Data arrays can be large (10k+ rows). Use `useMemo` for expensive aggregations. Avoid unnecessary re-renders in the main data table.
-   **Code Style:** Functional decomposition. Keep components small (`< 200 lines` if possible). Use custom hooks for logic (`useDataProcessor`, `useAIAnalysis`).
