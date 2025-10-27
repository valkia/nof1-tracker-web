# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` holds the Next.js App Router pages, API routes, and layout scaffolding; front-end entries live here (`page.tsx`, `dashboard/`, `api/agents/`).
- `src/components/` contains reusable UI (Tailwind-based) widgets such as the agent dashboards in `components/agents/`.
- `src/server/core/` preserves the original CLI trading engine, services, and Jest suites; treat it as the domain layer for Binance, risk, and profit logic.
- `src/server/nof1/` exposes thin service facades (e.g., `service.ts`) that adapt the core layer for web usage.
- Configuration lives at the repo root (`package.json`, `tsconfig.json`, `tailwind.config.ts`, `.env.example`).

## Build, Test, and Development Commands
- `npm run dev` – start the Next.js development server at `http://localhost:3000`.
- `npm run build` – generate the production Next.js output; validates server and client bundles.
- `npm run typecheck` – run `tsc --noEmit` with project settings (includes experimental decorators).
- `npm test` – execute Jest suites that cover the legacy trading services.
- `npm run lint` / `npm run format:fix` – enforce ESLint + Tailwind rules and Prettier formatting.

## Coding Style & Naming Conventions
- TypeScript everywhere; prefer named exports and explicit types for public APIs.
- Use 2-space indentation; rely on Prettier (`.prettierrc`) and Tailwind class sorting via `prettier-plugin-tailwindcss`.
- Component files use PascalCase (e.g., `AgentGrid.tsx`), hooks/utilities use camelCase, and server modules use kebab-cased directories.
- Keep CSS exclusively in Tailwind utility classes inside JSX files unless a global override belongs in `globals.css`.

## Testing Guidelines
- Jest powers the legacy test suites within `src/server/core/__tests__`; new tests should mirror that directory layout.
- Name test files with `.test.ts` or `.test.tsx` suffixes and colocate under the relevant module folder.
- Use the provided mocks/logger spies; reset timers/environment per test to keep suites deterministic (`jest.useFakeTimers()` helpers exist in examples).

## Commit & Pull Request Guidelines
- Write imperative, descriptive commit messages (e.g., `Add agent detail view`, `Refine Binance risk guard`); reference issue IDs when applicable.
- PRs should include: summary of changes, testing evidence (`npm run typecheck`, `npm test`), screenshots for UI updates, and links to related issues/specs.
- Avoid bundling cosmetic refactors with functional changes; keep server-core adjustments isolated from front-end work when possible.

## Security & Configuration Tips
- Never commit secrets; populate `.env` from `.env.example` with `NOF1_API_BASE_URL`, Binance credentials, and optional Telegram tokens.
- Use Binance testnet keys while developing, and verify `LOG_LEVEL` before promoting to production to avoid verbose logs.
