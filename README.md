# Sticky Whiteboard

A virtual whiteboard for sticky notes. Notes are born in a writing tray at the
bottom, then dragged up into labeled zones (e.g. *In Progress*, *Waiting on Next
Steps*, *Completed*). Notes carry an urgency color, can open a nested sub-board
of task notes, and can be crumpled and flicked into a wire trash bin.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173/).

## Features

- **Free-form board** — drag notes anywhere; drop them in a zone to refile by position.
- **Writing tray** — new notes start at the bottom; write, then drag onto the board.
- **Customizable zones** — rename, add, and delete sections.
- **Urgency colors** — six levels per note.
- **Sub-boards** — each note can open its own board of sub-tasks (nests arbitrarily deep).
- **Crumple & toss** — trash a note by flicking the crumpled ball into the bin.
- **Persistence** — auto-saves to the browser's `localStorage`.
- **Export / Import** — download a JSON backup or restore one.

## Data & backups

State lives in `localStorage` (key `sticky-whiteboard:v1`), per browser and per
origin. It is **not** a backup and does not sync across browsers or devices — use
the **Export** button to save a JSON copy.

## Tech

React 18 + Vite. No backend.
