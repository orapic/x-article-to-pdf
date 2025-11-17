
(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function normalizeTextForDedup(str) {
    return String(str || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  // Remove plain-text blocks that are just a duplicate rendering of the
  // following code block (like "python\n<same code>").
  function postprocessSegments(segments) {
    const cleaned = [];
    for (let i = 0; i < segments.length; i++) {
      const current = segments[i];
      const next = segments[i + 1];

      if (current && current.type === "text" && next && next.type === "code") {
        const textNorm = normalizeTextForDedup(current.text);

        const codeText = next.text || "";
        const lang = next.language || "";

        const codeNorm = normalizeTextForDedup(codeText);
        const langPlusCodeNewline = normalizeTextForDedup(lang + "\n" + codeText);
        const langPlusCodeSpace = normalizeTextForDedup(lang + " " + codeText);

        if (
          textNorm === codeNorm ||
          textNorm === langPlusCodeNewline ||
          textNorm === langPlusCodeSpace
        ) {
          // Skip this text node; it's just the unformatted version of the code block.
          continue;
        }
      }

      cleaned.push(current);
    }
    return cleaned;
  }

  // ---------- ARTICLE MODE (twitterArticleReadView) ----------

  function extractArticleSegments(article) {
    const readView = article.querySelector('[data-testid="twitterArticleReadView"]');
    if (!readView) return null;

    const segments = [];
    const seenBlocks = new WeakSet();
    const seenCodeContainers = new WeakSet();

    const walker = document.createTreeWalker(
      readView,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!el.getAttribute) continue;

      const dataTestId = el.getAttribute("data-testid");

      // ----- Code blocks: whole markdown-code-block container -----
      if (dataTestId === "markdown-code-block") {
        if (seenCodeContainers.has(el)) continue;
        seenCodeContainers.add(el);

        // Mark closest ancestor data-block as seen to avoid duplicate text
        const ancestorBlock = el.closest("[data-block='true']");
        if (ancestorBlock) {
          seenBlocks.add(ancestorBlock);
        }

        // language label
        let language = "";
        const langSpan = el.querySelector("span");
        if (langSpan && langSpan.innerText) {
          language = langSpan.innerText.trim();
        }

        // actual code text
        const pre = el.querySelector("pre");
        const codeText = pre ? (pre.innerText || "").trim() : "";

        // mark any inner Draft.js blocks as seen so we don't process them again
        el.querySelectorAll("[data-block='true']").forEach((n) => {
          seenBlocks.add(n);
        });

        if (codeText) {
          segments.push({
            type: "code",
            language,
            text: codeText
          });
        }

        continue;
      }

      const dataBlock = el.getAttribute("data-block");

      // ----- Block-level content (headings, text, math) -----
      if (dataBlock === "true") {
        if (seenBlocks.has(el)) continue;
        seenBlocks.add(el);

        const tag = el.tagName.toUpperCase();

        // Heading (h1 inside article)
        if (tag === "H1") {
          const clone = el.cloneNode(true);
          const katexInHeading = clone.querySelectorAll(".katex");
          katexInHeading.forEach((n) => n.remove());
          const headingText = (clone.innerText || "").trim();

          if (headingText) {
            segments.push({
              type: "heading",
              level: 1,
              text: headingText
            });
          }

          // math inside heading
          const katexSpans = el.querySelectorAll(".katex");
          katexSpans.forEach((span) => {
            segments.push({
              type: "mathHtml",
              html: span.outerHTML,
              display: "inline"
            });
          });

          continue;
        }

        // Block with KaTeX math
        const hasKatex = el.querySelector && el.querySelector(".katex");
        if (hasKatex) {
          // plain text in block (without math)
          const clone = el.cloneNode(true);
          clone.querySelectorAll(".katex").forEach((n) => n.remove());
          let plainText = (clone.innerText || "").trim();
          if (plainText && plainText !== "\\n" && plainText !== "\\n\\n") {
            segments.push({
              type: "text",
              text: plainText
            });
          }

          // math segments in this block
          const katexSpans = el.querySelectorAll(".katex");
          katexSpans.forEach((span) => {
            const mathNode = span.querySelector("math");
            const display =
              mathNode && mathNode.getAttribute("display") === "block"
                ? "block"
                : "inline";
            segments.push({
              type: "mathHtml",
              html: span.outerHTML,
              display
            });
          });

          continue;
        }

        // plain text block
        let text = (el.innerText || "").trim();
        // filter Draft-style literal "\n" filler blocks
        if (text && text !== "\\n" && text !== "\\n\\n") {
          segments.push({
            type: "text",
            text
          });
        }

        continue;
      }

      // ----- Images (article photos) -----
      if (dataTestId === "tweetPhoto") {
        const img = el.querySelector("img");
        if (img && img.src) {
          segments.push({
            type: "image",
            src: img.src,
            alt: img.alt || ""
          });
        }
      }
    }

    if (!segments.length) return null;
    return postprocessSegments(segments);
  }

  // ---------- FALLBACK: regular tweet/thread (no article view) ----------

  function extractTweetSegments() {
    const articles = Array.from(document.querySelectorAll("article"));
    if (!articles.length) return [];

    const segments = [];

    articles.forEach((art, idx) => {
      const textBlocks = Array.from(
        art.querySelectorAll('div[data-testid="tweetText"]')
      );

      let text = "";
      if (textBlocks.length) {
        text = textBlocks
          .map((b) => (b.innerText || "").trim())
          .filter(Boolean)
          .join("\n\n"); // real newlines, not literal "\n"
      } else {
        text = (art.innerText || "").trim();
      }

      if (text && text !== "\\n" && text !== "\\n\\n") {
        segments.push({
          type: "text",
          text
        });
      }

      const imgs = Array.from(
        art.querySelectorAll('img[src*="pbs.twimg.com/media/"]')
      );
      imgs.forEach((img) => {
        segments.push({
          type: "image",
          src: img.src,
          alt: img.alt || ""
        });
      });

      if (idx < articles.length - 1) {
        segments.push({ type: "separator" });
      }
    });

    return segments;
  }

  // ---------- MAIN EXTRACTION ----------

  function extractSegments() {
    const firstArticle = document.querySelector("article");
    if (!firstArticle) return [];

    const articleSegments = extractArticleSegments(firstArticle);
    if (articleSegments && articleSegments.length) {
      return articleSegments;
    }

    return extractTweetSegments();
  }

  const segments = extractSegments();
  if (!segments.length) {
    alert("No article/tweet content found on this page.");
    return;
  }

  const title = document.title || "X Article";
  const url = location.href;

  // ---------- RENDER TO PRINTABLE HTML ----------

  const bodyContent = segments
    .map((seg) => {
      if (seg.type === "heading") {
        return `<h2 class="article-heading">${escapeHtml(seg.text)}</h2>`;
      }

      if (seg.type === "text") {
        // convert literal "\n" inside text (if any slipped through) to real breaks
        const cleaned = seg.text.replace(/\\n/g, "\n");
        const html = escapeHtml(cleaned).replace(/\n/g, "<br>");
        return `<p class="article-text">${html}</p>`;
      }

      if (seg.type === "code") {
        const lang = seg.language ? escapeHtml(seg.language) : "";
        const langBadge = lang
          ? `<span class="code-lang">${lang}</span>`
          : `<span class="code-lang">code</span>`;
        return `
<div class="code-block">
  <div class="code-block-header">
    ${langBadge}
  </div>
  <pre class="code-block-body"><code>${escapeHtml(seg.text)}</code></pre>
</div>`;
      }

      if (seg.type === "mathHtml") {
        if (seg.display === "block") {
          return `<div class="math-block-display">${seg.html}</div>`;
        } else {
          return `<span class="math-block-inline">${seg.html}</span>`;
        }
      }

      if (seg.type === "image") {
        const alt = seg.alt ? escapeHtml(seg.alt) : "";
        return `
<figure class="article-image-box">
  <img src="${escapeHtml(seg.src)}" alt="${alt}">
  ${alt ? `<figcaption>${alt}</figcaption>` : ""}
</figure>`;
      }

      if (seg.type === "separator") {
        return `<hr class="tweet-separator" />`;
      }

      return "";
    })
    .join("\n");

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 20px;
      line-height: 1.5;
      color: #000;
      background: #fff;
    }

    .doc-title {
      font-size: 24px;
      margin: 0 0 4px 0;
    }

    .meta {
      font-size: 12px;
      color: #555;
      margin-bottom: 16px;
      word-break: break-all;
    }

    .article-heading {
      font-size: 20px;
      margin: 18px 0 8px 0;
      font-weight: 600;
      border-bottom: 1px solid #ddd;
      padding-bottom: 4px;
    }

    .article-text {
      margin: 0 0 10px 0;
      font-size: 13px;
    }

    .code-block {
      margin: 12px 0 16px 0;
      border-radius: 8px;
      background: #f7f9f9;
      border: 1px solid #e1e4e8;
      overflow: hidden;
    }
    .code-block-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 6px 10px;
      border-bottom: 1px solid #e1e4e8;
      background: #f0f3f6;
    }
    .code-lang {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid #cbd2da;
      background: #ffffff;
    }
    .code-block-body {
      margin: 0;
      padding: 10px 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      background: #f7f9f9;
    }

    .math-block-display {
      margin: 10px 0 14px 0;
    }
    .math-block-inline {
    }

    .article-image-box {
      margin: 8px 0 12px 0;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 6px;
      background: #fafafa;
    }
    .article-image-box img {
      max-width: 100%;
      height: auto;
      display: block;
      border-radius: 4px;
    }
    .article-image-box figcaption {
      font-size: 11px;
      color: #555;
      margin-top: 4px;
    }

    .tweet-separator {
      margin: 20px 0;
      border: none;
      border-top: 1px dashed #ccc;
    }

    @page {
      margin: 15mm;
    }
    @media print {
      body {
        margin: 0;
      }
      a {
        text-decoration: none;
        color: inherit;
      }
    }
  </style>
</head>
<body>
  <h1 class="doc-title">${escapeHtml(title)}</h1>
  <div class="meta">
    Source: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>
  </div>
  ${bodyContent}
  <script>
    window.onload = function () {
      window.print();
    };
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, "_blank");
})();
