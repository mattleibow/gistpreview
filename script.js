(() => {
  "use strict";

  const GIST_API = "https://api.github.com/gists/";

  // ── Input parsing ──────────────────────────────────────────────

  /**
   * Parse user input into a source descriptor.
   * @returns {{ type: 'gist', id: string }
   *         | { type: 'repo', rawUrl: string, sourceUrl: string, filename: string }
   *         | null}
   */
  function parseInput(input) {
    if (!input) return null;
    input = input.trim();

    try {
      const url = new URL(input);

      // GitHub Gist URL
      if (url.hostname === "gist.github.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        const id = parts[parts.length - 1] || null;
        return id ? { type: "gist", id } : null;
      }

      // Raw GitHub content URL
      if (url.hostname === "raw.githubusercontent.com") {
        const filename = url.pathname.split("/").pop() || "file";
        return { type: "repo", rawUrl: input, sourceUrl: input, filename };
      }

      // GitHub blob/raw URL: github.com/{owner}/{repo}/blob|raw/{ref}/{path}
      if (url.hostname === "github.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length >= 5 && (parts[2] === "blob" || parts[2] === "raw")) {
          const owner = parts[0];
          const repo = parts[1];
          const afterVerb = parts.slice(3).join("/");
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${afterVerb}`;
          const filename = parts[parts.length - 1] || "file";
          return { type: "repo", rawUrl, sourceUrl: input, filename };
        }
      }
    } catch {
      // not a URL – fall through
    }

    // Bare gist ID (hex string)
    if (/^[a-f0-9]+$/i.test(input)) return { type: "gist", id: input };

    // <user>/<id> shorthand for gists
    const shorthand = input.match(/^[\w.-]+\/([a-f0-9]+)$/i);
    if (shorthand) return { type: "gist", id: shorthand[1] };

    return null;
  }

  function getSource() {
    const raw = location.search.slice(1);
    if (!raw) return null;
    return parseInput(decodeURIComponent(raw));
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
    document.title = "GistPreview – Preview HTML from GitHub";
    const app = $("#app");
    app.innerHTML = "";

    const input = el("input", {
      type: "text",
      placeholder: "Paste a gist URL, GitHub file URL, or ID…",
      autofocus: "",
    });

    const submit = () => {
      const parsed = parseInput(input.value);
      if (parsed) {
        if (parsed.type === "gist") {
          window.location.search = parsed.id;
        } else {
          window.location.search = encodeURIComponent(input.value.trim());
        }
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
          "Instantly preview HTML content from GitHub Gists and repositories."
        ),
        el("div", { className: "input-group" }, input, btn),
        el("p", { className: "hint" },
          "Paste a URL like ",
          el("code", {}, "https://gist.github.com/user/abc123"),
          " or ",
          el("code", {}, "https://github.com/user/repo/blob/main/file.html"),
        )
      )
    );
  }

  // ── Preview page ────────────────────────────────────────────

  async function showGistPreview(gistId) {
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
        sandbox: "allow-scripts allow-forms allow-popups",
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

  // ── Repo file preview ──────────────────────────────────────────

  async function showRepoPreview(source) {
    document.title = `GistPreview – ${source.filename}`;
    const app = $("#app");
    app.innerHTML = "";

    const toolbar = el("div", { className: "toolbar" },
      el("a", { className: "logo", href: location.pathname }, "GistPreview"),
      el("a", {
        className: "gist-link",
        href: source.sourceUrl,
        target: "_blank",
        rel: "noopener",
      }, source.filename)
    );

    const content = el("div", { className: "state-message" },
      el("div", { className: "spinner" }),
      el("p", {}, "Loading file…")
    );

    const wrapper = el("div", { className: "preview" }, toolbar, content);
    app.append(wrapper);

    let fileContent;
    try {
      const res = await fetch(source.rawUrl);
      if (!res.ok) {
        const status = res.status;
        throw new Error(
          status === 404
            ? "File not found. Check the URL and try again."
            : `GitHub returned ${status}.`
        );
      }
      fileContent = await res.text();
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

    content.className = "";
    content.innerHTML = "";

    const iframe = el("iframe", {
      sandbox: "allow-scripts allow-forms allow-popups",
    });
    content.append(iframe);
    wrapper.className = "preview";
    content.style.flex = "1";
    content.style.display = "flex";
    iframe.style.flex = "1";
    iframe.style.width = "100%";
    iframe.style.border = "none";
    iframe.style.background = "#fff";

    const isHtml = /\.html?$/i.test(source.filename);

    iframe.srcdoc = isHtml
      ? fileContent
      : `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: ui-monospace, monospace; padding: 1rem; white-space: pre-wrap; word-break: break-word; }
</style></head><body>${escapeHtml(fileContent)}</body></html>`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ── Boot ─────────────────────────────────────────────────────

  function init() {
    const source = getSource();
    if (!source) {
      showLanding();
    } else if (source.type === "gist") {
      showGistPreview(source.id);
    } else if (source.type === "repo") {
      showRepoPreview(source);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
