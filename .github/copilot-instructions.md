# Copilot Instructions for GistPreview

## Project Overview

GistPreview is a static HTML/JS/CSS site hosted on GitHub Pages that lets users
preview HTML content from GitHub Gists. There is no backend — everything runs in
the browser using the public GitHub Gist API.

## Architecture

- **`index.html`** — single-page app entry point
- **`style.css`** — all styles (clean, minimal design)
- **`script.js`** — gist fetching, URL parsing, rendering logic

## URL Scheme

| URL | Behaviour |
|-----|-----------|
| `/?<gist_id>` | Fetch and render the gist |
| `/` (no query) | Show landing page with input form |

Users can paste a full gist URL (`https://gist.github.com/user/id`) or a bare
gist ID. The app parses both and redirects to `/?<id>`.

## Key Design Decisions

- Gist HTML content is rendered inside a sandboxed `<iframe>` using `srcdoc` for
  security isolation.
- The GitHub Gist API (`https://api.github.com/gists/<id>`) is called without
  authentication, so rate limits apply (60 req/hr per IP).
- No build step — plain HTML/CSS/JS only. No frameworks, no bundlers.
- The site is deployed to GitHub Pages via the `.github/workflows/deploy.yml`
  GitHub Actions workflow.

## Coding Conventions

- Vanilla JS (ES2020+). No TypeScript, no transpilation.
- CSS custom properties for theming.
- Semantic HTML5 elements.
- Keep all logic in `script.js`; keep `index.html` declarative.

## CI / Deployment

The `deploy.yml` workflow triggers on pushes to `main` and deploys the repo root
to GitHub Pages using `actions/deploy-pages`.
