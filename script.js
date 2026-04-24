(() => {
  "use strict";

  const GIST_API = "https://api.github.com/gists/";

  // ── URL helpers ──────────────────────────────────────────────

  function getGistId() {
    const raw = location.search.slice(1); // drop leading "?"
    return parseGistInput(raw);
  }

  function parseGistInput(input) {
    if (!input) return null;
    input = input.trim();

    // Full URL: https://gist.github.com/<user>/<id> or https://gist.github.com/<id>
    try {
      const url = new URL(input);
      if (url.hostname === "gist.github.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        return parts[parts.length - 1] || null;
      }
    } catch {
      // not a URL – treat as raw ID
    }

    // Accept a bare hex-ish ID (GitHub gist IDs are 32-char hex)
    if (/^[a-f0-9]+$/i.test(input)) return input;

    // Accept <user>/<id> shorthand
    const shorthand = input.match(/^[\w.-]+\/([a-f0-9]+)$/i);
    if (shorthand) return shorthand[1];

    return null;
  }

  // ── DOM helpers ──────────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) {
      node.append(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  // ── Landing page ────────────────────────────────────────────

  function showLanding() {
    document.title = "GistPreview – Preview HTML Gists";
    const app = $("#app");
    app.innerHTML = "";

    const input = el("input", {
      type: "text",
      placeholder: "Paste a gist URL or ID…",
      autofocus: "",
    });

    const submit = () => {
      const id = parseGistInput(input.value);
      if (id) {
        window.location.search = id;
      } else if (input.value.trim()) {
        input.style.borderColor = "var(--danger)";
        input.focus();
      }
    };

    const btn = el("button", { onClick: submit }, "Preview");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      else input.style.borderColor = "";
    });

    app.append(
      el("div", { className: "landing" },
        el("h1", {}, "Gist", el("span", {}, "Preview")),
        el("p", { className: "tagline" },
          "Instantly preview HTML content from any GitHub Gist."
        ),
        el("div", { className: "input-group" }, input, btn),
        el("p", { className: "hint" },
          "Paste a URL like ",
          el("code", {}, "https://gist.github.com/user/abc123"),
          " or just the gist ID."
        )
      )
    );
  }

  // ── Preview page ────────────────────────────────────────────

  async function showPreview(gistId) {
    document.title = `GistPreview – ${gistId}`;
    const app = $("#app");
    app.innerHTML = "";

    // Scaffold
    const toolbar = el("div", { className: "toolbar" },
      el("a", { className: "logo", href: location.pathname }, "GistPreview"),
      el("a", {
        className: "gist-link",
        href: `https://gist.github.com/${gistId}`,
        target: "_blank",
        rel: "noopener",
      }, gistId)
    );
    const fileTabs = el("div", { className: "file-tabs" });
    toolbar.append(fileTabs);

    const content = el("div", { className: "state-message" },
      el("div", { className: "spinner" }),
      el("p", {}, "Loading gist…")
    );

    const wrapper = el("div", { className: "preview" }, toolbar, content);
    app.append(wrapper);

    // Fetch
    let data;
    try {
      const res = await fetch(GIST_API + gistId);
      if (!res.ok) {
        const status = res.status;
        throw new Error(
          status === 404
            ? "Gist not found. Check the ID and try again."
            : status === 403
              ? "Rate limit exceeded. Try again in a few minutes."
              : `GitHub API returned ${status}.`
        );
      }
      data = await res.json();
    } catch (err) {
      content.className = "state-message error";
      content.innerHTML = "";
      content.append(
        el("h2", {}, "Oops"),
        el("p", {}, err.message),
        el("a", { href: location.pathname }, "← Back to home")
      );
      return;
    }

    // Find renderable HTML files
    const files = Object.values(data.files);
    const htmlFiles = files.filter(
      (f) => f.language === "HTML" || /\.html?$/i.test(f.filename)
    );
    const renderableFiles = htmlFiles.length > 0 ? htmlFiles : files;

    if (renderableFiles.length === 0) {
      content.className = "state-message error";
      content.innerHTML = "";
      content.append(
        el("h2", {}, "No files found"),
        el("p", {}, "This gist doesn't contain any files to preview."),
        el("a", { href: location.pathname }, "← Back to home")
      );
      return;
    }

    // Fetch full content for a file, using raw_url if truncated
    async function getFileContent(file) {
      if (!file.truncated && file.content != null) return file.content;
      if (!file.raw_url) return file.content || "";
      const res = await fetch(file.raw_url);
      if (!res.ok) throw new Error(`Failed to fetch raw content for ${file.filename}`);
      return res.text();
    }

    // Render the selected file
    async function renderFile(file) {
      content.className = "state-message";
      content.innerHTML = "";
      content.append(el("div", { className: "spinner" }), el("p", {}, "Loading file…"));

      let fileContent;
      try {
        fileContent = await getFileContent(file);
      } catch (err) {
        content.className = "state-message error";
        content.innerHTML = "";
        content.append(
          el("h2", {}, "Failed to load file"),
          el("p", {}, err.message),
          el("a", { href: location.pathname }, "← Back to home")
        );
        return;
      }

      content.className = "";
      content.innerHTML = "";

      const iframe = el("iframe", {
        sandbox: "allow-scripts allow-same-origin allow-forms allow-popups",
      });
      content.append(iframe);
      wrapper.className = "preview";
      content.style.flex = "1";
      content.style.display = "flex";
      iframe.style.flex = "1";
      iframe.style.width = "100%";
      iframe.style.border = "none";
      iframe.style.background = "#fff";

      const isHtml =
        file.language === "HTML" || /\.html?$/i.test(file.filename);

      iframe.srcdoc = isHtml
        ? fileContent
        : `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: ui-monospace, monospace; padding: 1rem; white-space: pre-wrap; word-break: break-word; }
</style></head><body>${escapeHtml(fileContent)}</body></html>`;

      // Update active tab
      fileTabs.querySelectorAll(".file-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.name === file.filename);
      });

      document.title = `GistPreview – ${file.filename}`;
    }

    // Build tabs
    fileTabs.innerHTML = "";
    for (const file of renderableFiles) {
      const tab = el(
        "button",
        { className: "file-tab", "data-name": file.filename, onClick: () => renderFile(file) },
        file.filename
      );
      fileTabs.append(tab);
    }

    renderFile(renderableFiles[0]);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ── Boot ─────────────────────────────────────────────────────

  function init() {
    const gistId = getGistId();
    if (gistId) {
      showPreview(gistId);
    } else {
      showLanding();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
