# ABM Engine — Frontend

React + TypeScript + Vite frontend for the Agentic Account-Based Marketing Engine.

## Tech Stack

- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **State Management**: React Context + hooks
- **Mocking**: MSW (Mock Service Worker) for offline development
- **Testing**: Vitest + React Testing Library

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **(Optional) Configure API endpoint:**
   Create `.env.local` with:
   ```bash
   VITE_API_BASE_URL=http://localhost:8000
   ```
   Default is `http://localhost:8000` if not set.

3. **Start dev server:**
   ```bash
   npm run dev
   ```
   UI available at `http://localhost:5173` (or next available port)

## Available Scripts

- `npm run dev` — Start Vite dev server with HMR
- `npm run build` — Build for production
- `npm run preview` — Preview production build locally
- `npm run lint` — Run ESLint
- `npm run test` — Run tests with Vitest

## Pages & Routes

| Path | Component | Phase | Purpose |
|------|-----------|-------|---------|
| `/` | PipelinePage | Overview | Account pipeline status dashboard |
| `/intake` | IntakePage | Phase 1 | MasterContext input form |
| `/icp` | ICPPage | Phase 2 | Account discovery & ranking |
| `/checkpoint2` | CP2ReviewPage | Phase 2 | Manual review & approval |
| `/checkpoint3` | CP3OperatorPage | Phase 3 | Message review & client feedback |
| `/client-review` | ClientReviewPage | Phase 4 | Client/buyer approval portal |
| `/campaign` | CampaignPage | Phase 5 | Outbound execution tracking |
| `/storyteller` | StorytellerPage | Phase 4 | Narrative generation & templates |

## Components

### Page Components
- `Intake/` — Lead intake & MasterContext validation UI
- `ICP/` — Account discovery, scoring display, ranking
- `Checkpoint2/` — Account list & buyer intel review
- `Checkpoint3/` — Message cards, operator approval, client feedback panel
- `ClientReview/` — Client approval flows, feedback aggregation
- `Campaign/` — Campaign dashboard, send tracking, engagement metrics
- `StorytellerPage/` — Template management, message generation UI
- `Pipeline/` — Account pipeline kanban/list view

### Reusable Components
- `ui/` — Button, Input, Modal, Card, etc. (Tailwind-based)
- `DataTable/` — Sortable, filterable account/engagement tables
- Hooks — `useAuth`, `useAccounts`, `useCampaigns`, etc.

## Mock Data

Development uses MSW to mock API calls without hitting the backend:

- `src/mocks/handlers.ts` — Route handlers
- `src/mocks/cp3.ts` — CP3-specific fixtures
- `src/mocks/client_review.ts` — Client review fixtures

To switch to real API, comment out MSW in `src/main.tsx`.

## Type Definitions

TypeScript interfaces for major entities:

```typescript
interface MasterContext {
  client_id: string;
  industry: string;
  company_size: "0-50" | "50-200" | "200-500" | "500+";
  budget_range: string;
  // ... more fields
}

interface Account {
  account_id: string;
  company_name: string;
  industry: string;
  tier: "tier1" | "tier2" | "tier3";
  score: number;
  // ... more fields
}

interface Message {
  message_id: string;
  account_id: string;
  tier: "tier1" | "tier2" | "tier3";
  subject: string;
  body: string;
  generated_at: string;
  approved_at?: string;
}
```

See `src/` for full type definitions.

## Performance

- **Code splitting** enabled per route
- **Image optimization** via Vite
- **CSS minification** in production
- **Tree-shaking** removes unused code

## Deployment

Build for production:
```bash
npm run build
```

Output in `dist/`. Deploy to Vercel, Netlify, S3 + CloudFront, etc.

## Development Tips

- Use Vite dev server (`npm run dev`) for instant HMR and fast builds
- Keep mock handlers in sync with backend API changes
- Use React DevTools browser extension for debugging state
- Run ESLint regularly: `npm run lint`
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
