# Exported Project

## Getting Started

```bash
# 1. Point to NpmPrettyMuch (https://npmpm.corp.amazon.com)
harmony npm

# 2. Install dependencies
npm install

# 3. Run server
npm run dev
```

Then open the URL shown in your terminal.

## Project Structure

```
├── design-system/              # Shared UI components, icons, patterns
├── design-tokens/
│   ├── dist/                   # Built tokens (CSS, SCSS, JSON)
│   └── src/                    # Token source definitions (JSON5)
├── src/
│   └── pages/ses_id/           # Each page/session contains:
│       ├── page.json           # Config (page name, frame properties)
│       └── frame-id.tsx        # Frames (your designs)
```

## Viewing Frames

Each frame is accessible at:
```
http://localhost:<port>/pages/<ses_id>/<frame-id>
```

- `<ses_id>` is the `pageId` field in `page.json` (e.g., `ses_xxxxx`)
- `<frame-id>` is the `id` field of each frame in the `frames` array (e.g., `frame-xxxxx`)

Refer to `page.json` inside each page directory to view frames and their respective names.
