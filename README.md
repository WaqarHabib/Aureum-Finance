# Bill Flow

 **BillFlow** is an intelligent, browser-based bill tracking platform for managing your financial obligations with precision. Bill Flow lets you record a starting balance, schedule income and bills, visualize the resulting timeline, and export a professional statement that prints to PDF.

## Features

- Starting balance, income entries and bill entries with full date support
- Live projected timeline with a running balance and monthly summaries
- Interactive area chart with negative-balance reference line
- Low-balance and overdraft warnings
- Edit and delete any entry inline
- State persisted locally in the browser (no account required)
- One-click luxury statement export (HTML, optimised for print to PDF)
- Fully responsive, dark editorial theme with gold accents

## Tech Stack

- React 19 and TypeScript 5
- Vite 7
- Tailwind CSS 4
- shadcn-style UI primitives (Radix)
- Recharts for the timeline chart
- Lucide icons

## Getting Started

Prerequisites: Node 20+ or Bun 1.1+.

```bash
bun install
bun run dev
```

The dev server will print a local URL (typically `http://localhost:5173`).

### Available Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the local dev server |
| `bun run build` | Build the production bundle to `dist/` |
| `bun run preview` | Preview the production build locally |
| `bun run lint` | Lint the project with ESLint |
| `bun run format` | Format the project with Prettier |

## Deployment

Bill Flow is a static single-page application and deploys cleanly to Vercel, Netlify, Cloudflare Pages or any static host. A `vercel.json` is included with an SPA rewrite rule so client-side routes resolve correctly.

For Vercel: push to a Git provider and import the repository. The framework preset is auto-detected as Vite. The build command is `bun run build` and the output directory is `dist`.

## Project Structure

```
src/
  App.tsx          Main application
  main.tsx         React entry point
  styles.css       Global styles and design tokens
  components/ui    UI primitives
  hooks            Reusable hooks
  lib              Utilities
public/            Static assets (favicon, etc.)
index.html         Document shell
```

## Privacy

All data is stored in your browser via `localStorage`. Nothing is transmitted to any server.

## License

Copyright © 2026 Waqar Habib
