# X → PDF — Chrome/Brave Extension

A minimal, dependency-free Chromium extension that converts any X/Twitter “Article Mode” post or thread into a clean, print-ready HTML document. One click. Instant PDF.

## Overview

X/Twitter’s “article-mode” pages are readable but not archivable. This extension extracts the true structured content and reconstructs a standalone HTML page optimized for PDF export:

- Correct heading hierarchy
- Proper paragraph ordering
- Syntax-highlight-ready code blocks (language preserved)
- KaTeX math preserved (renders via KaTeX CSS on the generated page)
- Inline + block math supported
- Multi-image posts embedded in the correct sequence
- Removes Draft.js junk (`\n`, filler blocks, repeated plaintext code)
- Fully self-contained output (ideal for PDF or print-to-file)

The generated HTML opens in a new tab and triggers `window.print()` automatically.

## Why This Exists

Longform posts on X often contain code, math, or technical writeups that deserve archival quality. Screenshots are low-fidelity, and X’s printing layout is broken. This tool creates a clean, deterministic format that always prints correctly.

## Features

- MV3-compliant (Manifest V3)
- Zero dependencies inside the extension
- No tracking, no external data flow
- Only runs when the user clicks the toolbar icon
- Works on both `x.com` and `twitter.com`

## How It Works

### 1. Background Service Worker
Injects the content script into the active tab when the user clicks the extension icon.

### 2. Content Script
Central logic:

- Detects article-mode container
- Walks the DOM via `TreeWalker`
- Extracts:
  - Headings
  - Code blocks (Markdown-style)
  - KaTeX math HTML
  - Plain paragraphs
  - Images
- Cleans noise
- Builds a self-contained HTML document
- Opens new tab + auto-print

### 3. Output
The final HTML page loads KaTeX from a CDN, embeds images, and uses minimal CSS to mimic X's article style.

## Installation (Developer Mode)

1. Clone the repo
2. Go to `chrome://extensions`
3. Enable *Developer Mode*
4. Click **Load Unpacked**
5. Select this project folder
6. Pin the extension for quick access

## Usage

1. Open any X/Twitter article-mode post (`/i/articles/...`)
2. Click the extension icon
3. A new tab appears with the reformatted content
4. Browser print dialog opens → Save as PDF

## File Structure

```
extension/
 ├── manifest.json
 ├── background.js
 ├── contentScript.js
 ├── icons/
 │    └── x-to-pdf.png
 └── README.md
```

## Permissions

```json
"host_permissions": [
  "https://x.com/*",
  "https://twitter.com/*"
],
"permissions": ["scripting", "activeTab"]
```

## Known Limitations

- Only works on article-mode pages (not regular tweet threads)
- Relies on X’s internal structure; breaking changes may require patching

## License

MIT License.
