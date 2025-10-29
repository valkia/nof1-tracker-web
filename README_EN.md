# Nof1 Tracker Web (English)

A full-stack Next.js 14 application for monitoring and operating Nof1 AI trading agents.
The project evolves the original TypeScript CLI into a web experience built with the
[lmsqueezy/nextjs-billing](https://github.com/lmsqueezy/nextjs-billing) template as a foundation.
It now bundles a responsive dashboard, API routes, and the existing trading core services.

## Tech Stack

- **Next.js 14 App Router** with Server Components & Actions
- **TypeScript** end to end
- **Tailwind CSS** design system
- **React 18**
- Shared domain layer from the CLI: `axios`, `fs-extra`, `node-telegram-bot-api`, etc.

### Structure Overview

```
src/
├── app/                  # Pages and API Routes
│   ├── api/agents        # REST endpoints for agent data
│   ├── dashboard         # Dashboard layout and pages
│   └── page.tsx          # Landing page overview
├── components/           # UI components
│   └── agents/           # Agent cards, summaries, tables
├── lib/                  # Reusable utilities (Tailwind helpers, formatting)
└── server/
    ├── core/             # Original CLI services (Binance, risk, profit, etc.)
    └── nof1/             # Thin wrappers that expose domain logic to Next.js
```

The `src/server/core` folder keeps the existing business logic untouched, making it easy
to plug more features (follow execution, profit analysis, telegram alerts) into the web stack.

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env

# 3. Fill in API credentials and optional integrations

# 4. Run the dev server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the dashboard.

## Key Features

- **Agent overview**: list live agents with exposure, unrealized PnL, and confidence indicators.
- **API endpoints**:
  - `GET /api/agents` – consolidated snapshot for all agents.
  - `GET /api/agents/[id]` – detailed position data for a specific agent.
- **Service helpers**: `src/server/nof1/service.ts` exposes `fetchAgentOverviews` and
  `fetchAgentDetail`, ready to be reused by server actions, scheduled jobs, or additional APIs.

## Environment Variables

`.env.example` documents the required configuration:

- `NOF1_API_BASE_URL` – endpoint to pull agent data (defaults to `https://nof1.ai/api`).
- `BINANCE_API_KEY` / `BINANCE_API_SECRET` – now configured via the Dashboard “System Settings”, no `.env` changes required
- `BINANCE_TESTNET` – toggle Binance testnet.
- `TELEGRAM_*` – optional Telegram notifications.
- `LOG_LEVEL` – control verbosity of the reused logging utilities.

## Development Notes

- Reuse the core trading services from `src/server/core` when adding new features.
- `refreshDashboard` server action can be triggered after background sync jobs to invalidate caches.
- Run `npm run lint` and `npm run typecheck` before submitting changes.

## Roadmap Ideas

1. Promote `followAgent` logic to secure API actions (with auth & ACL).
2. Persist trades and positions in a database for deeper historical analytics.
3. Add real-time updates through SSE or WebSocket to minimise manual refresh.
4. Build forms to configure risk parameters directly from the dashboard.

---

Happy hacking and enjoy expanding the Nof1 tracking experience on the web!*** End Patch*** End Patch
