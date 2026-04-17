# Workspace File Server

A lightweight Node.js file server for browsing and viewing workspace files.

## Features

- 📁 Browse workspace directory with clickable navigation
- 📝 Renders Markdown files with GitHub-style dark mode
- 📄 Serves all file types with correct MIME types
- 🎨 Clean, readable UI with breadcrumb navigation
- ⚡ Zero build step, minimal dependencies

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

Or directly:

```bash
node server.mjs
```

The server will start on `http://localhost:3000` by default.

## Configuration

Set a custom port via environment variable:

```bash
PORT=8080 npm start
```

## What it serves

- **Root:** `/Users/simonwade/.openclaw/workspace/`
- **Directories:** Interactive file listings with breadcrumbs
- **Markdown files:** Rendered as styled HTML
- **Other files:** Served raw with appropriate MIME types

## Dependencies

- `marked` - Markdown rendering
- `mime-types` - File type detection

That's it! Simple and focused.
