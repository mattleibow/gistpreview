# GistPreview

Instantly preview HTML content from any GitHub Gist — no server required.

## Usage

Visit the site and paste a gist URL or ID:

```
https://mattleibow.github.io/gistpreview/?<gist_id>
```

Or go to the landing page and paste any of:

- A full URL: `https://gist.github.com/user/abc123def456`
- A shorthand: `user/abc123def456`
- A bare ID: `abc123def456`

## How it works

The site calls the public GitHub Gist API (`https://api.github.com/gists/<id>`),
finds HTML files in the gist, and renders them in a sandboxed iframe. If there
are multiple files, tabs let you switch between them.

## Development

No build step — just open `index.html` in a browser. The site is plain
HTML + CSS + JS.

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the workflow in
`.github/workflows/deploy.yml`.
