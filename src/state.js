// ---------------------------------------------------------------------------
// Data model
//
//   data = {
//     rootBoardId: string,
//     boards: {
//       [boardId]: {
//         id, title,
//         sections: [{ id, name }],
//         notes:    [{ id, text, color, sectionId, details }]
//       }
//     }
//   }
//
// `text` is what shows on the face of the post-it. `details` is a longer,
// free-form notes area that's only visible while the note is open — hidden
// the moment the post-it is closed.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'sticky-whiteboard:v1'

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

export function uid(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function makeBoard(title) {
  return {
    id: uid('board'),
    title,
    sections: [
      { id: uid('sec'), name: 'In Progress' },
      { id: uid('sec'), name: 'Waiting on Next Steps' },
      { id: uid('sec'), name: 'Completed' },
    ],
    notes: [],
  }
}

// nx/ny are the note's position WITHIN its zone, as fractions 0..1 of the
// usable zone area. Storing fractions keeps placement stable when the board
// or zones resize. A small per-note tilt makes the wall feel hand-placed.
export function makeNote(sectionId, overrides = {}) {
  return {
    id: uid('note'),
    text: '',
    color: 'yellow',
    sectionId,
    details: '', // longer notes, hidden until the note is opened
    tray: false, // true while resting in the bottom writing tray (unfiled)
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
  return { rootBoardId: root.id, boards: { [root.id]: root } }
}

// Backfill fields that older saved boards may be missing (notably nx/ny/tilt,
// added when the board became free-form). Without this, a positionless note
// computes to NaN coordinates and gets stuck in the top-left corner.
function normalizeNote(note) {
  const s = scatter()
  return {
    text: '',
    color: 'yellow',
    details: '',
    ...note,
    details: typeof note.details === 'string' ? note.details : '',
    tray: typeof note.tray === 'boolean' ? note.tray : false,
    nx: Number.isFinite(note.nx) ? note.nx : s.nx,
    ny: Number.isFinite(note.ny) ? note.ny : s.ny,
    tilt: Number.isFinite(note.tilt) ? note.tilt : s.tilt,
  }
}

function normalizeData(data) {
  const boards = {}
  for (const [id, board] of Object.entries(data.boards)) {
    boards[id] = { ...board, notes: (board.notes || []).map(normalizeNote) }
  }
  return { ...data, boards }
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

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('Could not save board.', err)
  }
}

