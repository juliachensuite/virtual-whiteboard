// ---------------------------------------------------------------------------
// Data model
//
//   data = {
//     rootBoardId: string,
//     disposalMode: 'toss' | 'spike',   // how a "done" note is disposed
//     trash: [{ tid, note, boardId, boardTitle, deletedAt }],
//     boards: {
//       [boardId]: {
//         id, title,
//         sections: [{ id, name, weight, split, topLabel, bottomLabel }],
//         notes:    [{ id, text, color, sectionId, row, details, tray,
//                      spiked, spikedAt, nx, ny, tilt }]
//       }
//     }
//   }
//
// `text` is what shows on the face of the post-it. `details` is a longer,
// free-form notes area that's only visible while the note is open — hidden
// the moment the post-it is closed.
//
// Zones are the board's `sections`. `weight` is a relative width (everything is
// normalized by the sum, so proportions survive a window resize). A zone can be
// `split` into a labeled top/bottom row pair (`topLabel`/`bottomLabel`); a
// note's `row` ('top'|'bottom') says which half it lives in when split.
//
// A disposed note either crumple-tosses into the recoverable `trash`, or — in
// spike mode — gets impaled on the on-screen spike (`spiked: true`, still a
// live note). Clearing the spike moves those notes into the same `trash`.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'sticky-whiteboard:v1'

// Show a "trash is getting big" nudge once it holds more than this many notes.
export const TRASH_WARN = 50

export const URGENCY_COLORS = [
  { id: 'yellow', label: 'None',   note: '#fef08a', edge: '#eddc5b' },
  { id: 'green',  label: 'Low',    note: '#bbf7d0', edge: '#8fe3ab' },
  { id: 'blue',   label: 'Normal', note: '#bae6fd', edge: '#8ad2f5' },
  { id: 'orange', label: 'High',   note: '#fed7aa', edge: '#f7bd83' },
  { id: 'pink',   label: 'Urgent', note: '#fbcfe8', edge: '#f3aad4' },
  { id: 'red',    label: 'Now',    note: '#fecaca', edge: '#f59a9a' },
]

export function colorFor(id) {
  return URGENCY_COLORS.find((c) => c.id === id) || URGENCY_COLORS[0]
}

// Pick a random color id, so a fresh note lands on a varied color instead of
// always yellow. Purely cosmetic — the picker still lets you change it.
export function randomColorId() {
  const r = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000
    : Math.random()
  return URGENCY_COLORS[Math.floor(r * URGENCY_COLORS.length)].id
}

export function uid(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

// A zone. `weight` is its relative width; `split` toggles the top/bottom rows.
export function makeSection(name, overrides = {}) {
  return {
    id: uid('sec'),
    name,
    weight: 1,
    split: false,
    topLabel: 'Top',
    bottomLabel: 'Bottom',
    ...overrides,
  }
}

export function makeBoard(title) {
  return {
    id: uid('board'),
    title,
    sections: [
      makeSection('In Progress'),
      makeSection('Waiting on Next Steps'),
      makeSection('Completed'),
    ],
    notes: [],
  }
}

// nx/ny are the note's position WITHIN its region, as fractions 0..1 of the
// usable area (a zone, a split row half, or the tray). Storing fractions keeps
// placement stable when the board or zones resize. A small per-note tilt makes
// the wall feel hand-placed.
export function makeNote(sectionId, overrides = {}) {
  return {
    id: uid('note'),
    text: '',
    color: randomColorId(),
    sectionId,
    row: 'top', // which half when the zone is split; ignored otherwise
    details: '', // longer notes, hidden until the note is opened
    tray: false, // true while resting in the bottom writing tray (unfiled)
    spiked: false, // true while impaled on the spike
    spikedAt: 0, // ms timestamp, used to order the spike stack
    nx: 0.5,
    ny: 0.4,
    tilt: 0,
    ...overrides,
  }
}

// A gentle random tilt in degrees, plus a scattered spot inside a zone.
export function scatter() {
  const r = () => (typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff
    : Math.random())
  return { nx: 0.08 + r() * 0.78, ny: 0.06 + r() * 0.7, tilt: (r() * 6 - 3) }
}

export function defaultData() {
  const root = makeBoard('My Whiteboard')
  const [inProgress, waiting] = root.sections
  root.notes = [
    makeNote(inProgress.id, { text: 'Double-click me to edit.', color: 'blue', nx: 0.12, ny: 0.1, tilt: -2 }),
    makeNote(inProgress.id, { text: 'Drag me anywhere — drop me in another zone to refile.', color: 'green', nx: 0.45, ny: 0.45, tilt: 1.5 }),
    makeNote(waiting.id, { text: 'Open me to jot longer notes — they stay hidden on the board.', color: 'orange', details: 'These details only show while the note is open. Close it and the post-it goes back to just its headline.', nx: 0.3, ny: 0.25, tilt: -1.5 }),
    makeNote(inProgress.id, { text: 'New notes start down here — write me, then drag me up ↑', color: 'yellow', tray: true, nx: 0.06, ny: 0.45, tilt: -1.5 }),
  ]
  return {
    rootBoardId: root.id,
    disposalMode: 'toss',
    trash: [],
    boards: { [root.id]: root },
  }
}

// Backfill fields that older saved notes may be missing (notably nx/ny/tilt,
// added when the board became free-form, plus row/spiked added later). Without
// this, a positionless note computes to NaN coordinates and sticks in a corner.
function normalizeNote(note) {
  const s = scatter()
  return {
    text: '',
    color: 'yellow',
    details: '',
    ...note,
    details: typeof note.details === 'string' ? note.details : '',
    tray: typeof note.tray === 'boolean' ? note.tray : false,
    row: note.row === 'bottom' ? 'bottom' : 'top',
    spiked: typeof note.spiked === 'boolean' ? note.spiked : false,
    spikedAt: Number.isFinite(note.spikedAt) ? note.spikedAt : 0,
    nx: Number.isFinite(note.nx) ? note.nx : s.nx,
    ny: Number.isFinite(note.ny) ? note.ny : s.ny,
    tilt: Number.isFinite(note.tilt) ? note.tilt : s.tilt,
  }
}

// Backfill zone fields added after the original three-section model.
function normalizeSection(section) {
  return {
    ...section,
    weight: Number.isFinite(section.weight) && section.weight > 0 ? section.weight : 1,
    split: typeof section.split === 'boolean' ? section.split : false,
    topLabel: typeof section.topLabel === 'string' ? section.topLabel : 'Top',
    bottomLabel: typeof section.bottomLabel === 'string' ? section.bottomLabel : 'Bottom',
  }
}

function normalizeTrashEntry(entry) {
  return {
    tid: entry.tid || uid('trash'),
    note: normalizeNote({ ...(entry.note || {}), spiked: false }),
    boardId: entry.boardId || null,
    boardTitle: typeof entry.boardTitle === 'string' ? entry.boardTitle : 'Board',
    deletedAt: Number.isFinite(entry.deletedAt) ? entry.deletedAt : 0,
  }
}

function normalizeData(data) {
  const boards = {}
  for (const [id, board] of Object.entries(data.boards)) {
    boards[id] = {
      ...board,
      sections: (board.sections || []).map(normalizeSection),
      notes: (board.notes || []).map(normalizeNote),
    }
  }
  return {
    ...data,
    disposalMode: data.disposalMode === 'spike' ? 'spike' : 'toss',
    trash: Array.isArray(data.trash) ? data.trash.map(normalizeTrashEntry) : [],
    boards,
  }
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData()
    const parsed = JSON.parse(raw)
    if (parsed && parsed.boards && parsed.rootBoardId) {
      return normalizeData(parsed)
    }
  } catch (err) {
    console.warn('Could not load saved board, starting fresh.', err)
  }
  return defaultData()
}

// Shared by import so a hand-edited or older export gets the same backfill.
export function normalizeImported(parsed) {
  if (!parsed || !parsed.boards || !parsed.rootBoardId) {
    throw new Error('Not a whiteboard file')
  }
  return normalizeData(parsed)
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('Could not save board.', err)
  }
}
