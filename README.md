# GistPreview

Instantly preview HTML content from GitHub Gists and repositories — no server required.

## Usage

Visit the site and paste a gist URL, gist ID, or a GitHub file URL:

```
https://mattleibow.github.io/gistpreview/?<gist_id>
https://mattleibow.github.io/gistpreview/?https%3A%2F%2Fgithub.com%2Fuser%2Frepo%2Fblob%2Fmain%2Ffile.html
```

Or go to the landing page and paste any of:

### Gists

- A full URL: `https://gist.github.com/user/abc123def456`
- A shorthand: `user/abc123def456`
- A bare ID: `abc123def456`

### Repository files

- A blob URL: `https://github.com/user/repo/blob/branch/path/to/file.html`
- A raw URL: `https://raw.githubusercontent.com/user/repo/branch/path/to/file.html`

## How it works

The site detects the type of URL:

- **Gists** — calls the public GitHub Gist API (`https://api.github.com/gists/<id>`),
  finds HTML files in the gist, and renders them in a sandboxed iframe. If there
  are multiple files, tabs let you switch between them.
- **Repository files** — converts GitHub blob URLs to raw content URLs and renders
  the file in a sandboxed iframe.

## Development

No build step — just open `index.html` in a browser. The site is plain
HTML + CSS + JS.

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the workflow in
`.github/workflows/deploy.yml`.
