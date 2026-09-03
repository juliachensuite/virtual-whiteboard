import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NEXT_SIZE,
  defaultData,
  loadData,
  makeNote,
  makeSection,
  normalizeImported,
  saveData,
  sizeOf,
  uid,
} from './state.js'
import Board from './components/Board.jsx'
import NoteModal from './components/NoteModal.jsx'
import TrashBin from './components/TrashBin.jsx'
import CrumpleToss from './components/CrumpleToss.jsx'
import Spike from './components/Spike.jsx'
import SpikeImpale from './components/SpikeImpale.jsx'
import SpikeViewer from './components/SpikeViewer.jsx'
import TrashDrawer from './components/TrashDrawer.jsx'

export default function App() {
  const [data, setData] = useState(loadData)
  // Stack of board ids representing the drill-down path (root first).
  const [nav, setNav] = useState([data.rootBoardId])
  // Note currently open in the detail modal: { boardId, noteId } | null
  const [openNote, setOpenNote] = useState(null)
  // Note being disposed: { boardId, note, origin, mode: 'toss'|'spike' } | null
  const [disposing, setDisposing] = useState(null)
  // Which overlay panels are open.
  const [trashOpen, setTrashOpen] = useState(false)
  const [spikeOpen, setSpikeOpen] = useState(false)
  // Timestamp (ms) of the last JSON export, persisted on its own.
  const [lastExport, setLastExport] = useState(() => {
    const v = localStorage.getItem('sticky-whiteboard:lastExport')
    return v ? Number(v) : null
  })

  const binRef = useRef(null)
  const spikeRef = useRef(null)

  useEffect(() => {
    saveData(data)
  }, [data])

  const currentBoardId = nav[nav.length - 1]
  const currentBoard = data.boards[currentBoardId]

  // Guard against a stale nav stack (e.g. after an import).
  useEffect(() => {
    if (!data.boards[currentBoardId]) setNav([data.rootBoardId])
  }, [data, currentBoardId])

  // ----- mutation helpers ---------------------------------------------------

  const updateBoard = useCallback((boardId, updater) => {
    setData((prev) => {
      const board = prev.boards[boardId]
      if (!board) return prev
      return {
        ...prev,
        boards: { ...prev.boards, [boardId]: updater(board) },
      }
    })
  }, [])

  const addNote = useCallback(
    (sectionId, extra = {}) => {
      const note = makeNote(sectionId, extra)
      updateBoard(currentBoardId, (b) => ({
        ...b,
        notes: [...b.notes, note],
      }))
      // Open the fresh note so you can type into it right away.
      setOpenNote({ boardId: currentBoardId, noteId: note.id })
    },
    [currentBoardId, updateBoard],
  )

  const patchNote = useCallback(
    (boardId, noteId, patch) => {
      updateBoard(boardId, (b) => ({
        ...b,
        notes: b.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
      }))
    },
    [updateBoard],
  )

  // Commit a note's new zone + in-zone position after a free drag.
  const setPosition = useCallback(
    (noteId, placed) => {
      // placed = { sectionId, nx, ny }
      patchNote(currentBoardId, noteId, placed)
    },
    [currentBoardId, patchNote],
  )

  // Step a note through the S → M → L → S size cycle.
  const cycleSize = useCallback(
    (noteId) => {
      updateBoard(currentBoardId, (b) => ({
        ...b,
        notes: b.notes.map((n) =>
          n.id === noteId ? { ...n, size: NEXT_SIZE[sizeOf(n)] } : n,
        ),
      }))
    },
    [currentBoardId, updateBoard],
  )

  // Bring a note to the top of the stack (last in array renders on top).
  const raiseNote = useCallback(
    (noteId) => {
      updateBoard(currentBoardId, (b) => {
        if (b.notes[b.notes.length - 1]?.id === noteId) return b
        const note = b.notes.find((n) => n.id === noteId)
        if (!note) return b
        return { ...b, notes: [...b.notes.filter((n) => n.id !== noteId), note] }
      })
    },
    [currentBoardId, updateBoard],
  )

  // ----- disposal: toss → trash, or spike --------------------------------

  const disposalMode = data.disposalMode || 'toss'

  const toggleDisposalMode = useCallback(() => {
    setData((prev) => ({
      ...prev,
      disposalMode: prev.disposalMode === 'spike' ? 'toss' : 'spike',
    }))
  }, [])

  // Build a trash entry from a note that lives on some board, and drop it.
  const trashEntry = (board, note) => ({
    tid: uid('trash'),
    note: { ...note, spiked: false },
    boardId: board.id,
    boardTitle: board.title,
    deletedAt: Date.now(),
  })

  // Move a note off its board and into the recoverable trash.
  const trashNote = useCallback((boardId, noteId) => {
    setData((prev) => {
      const board = prev.boards[boardId]
      const note = board?.notes.find((n) => n.id === noteId)
      if (!note) return prev
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [boardId]: { ...board, notes: board.notes.filter((n) => n.id !== noteId) },
        },
        trash: [trashEntry(board, note), ...(prev.trash || [])],
      }
    })
  }, [])

  // Flag a note as impaled on the spike (stays a live note).
  const spikeNote = useCallback((boardId, noteId) => {
    updateBoard(boardId, (b) => ({
      ...b,
      notes: b.notes.map((n) =>
        n.id === noteId ? { ...n, spiked: true, spikedAt: Date.now() } : n,
      ),
    }))
  }, [updateBoard])

  // Pull a note back off the spike, onto its board.
  const returnFromSpike = useCallback((boardId, noteId) => {
    updateBoard(boardId, (b) => ({
      ...b,
      notes: b.notes.map((n) => (n.id === noteId ? { ...n, spiked: false } : n)),
    }))
  }, [updateBoard])

  // Send a single spiked note to the trash.
  const spikedToTrash = useCallback((boardId, noteId) => {
    trashNote(boardId, noteId)
  }, [trashNote])

  // Clear the whole spike for a board → trash.
  const clearSpike = useCallback((boardId) => {
    setData((prev) => {
      const board = prev.boards[boardId]
      if (!board) return prev
      const spiked = board.notes.filter((n) => n.spiked)
      if (!spiked.length) return prev
      const entries = spiked.map((note) => trashEntry(board, note))
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [boardId]: { ...board, notes: board.notes.filter((n) => !n.spiked) },
        },
        trash: [...entries, ...(prev.trash || [])],
      }
    })
  }, [])

  // ----- trash drawer actions ----------------------------------------------

  const restoreFromTrash = useCallback((tid) => {
    setData((prev) => {
      const entry = (prev.trash || []).find((e) => e.tid === tid)
      if (!entry) return prev
      // Prefer the original board; fall back to root if it's gone.
      let boardId = prev.boards[entry.boardId] ? entry.boardId : prev.rootBoardId
      const board = prev.boards[boardId]
      let note = { ...entry.note, spiked: false }
      // If its zone vanished, drop it into the first zone of the target board.
      if (!board.sections.find((s) => s.id === note.sectionId)) {
        note = { ...note, sectionId: board.sections[0].id, row: 'top' }
      }
      return {
        ...prev,
        boards: {
          ...prev.boards,
          [boardId]: { ...board, notes: [...board.notes, note] },
        },
        trash: prev.trash.filter((e) => e.tid !== tid),
      }
    })
  }, [])

  const deleteForever = useCallback((tid) => {
    setData((prev) => ({ ...prev, trash: (prev.trash || []).filter((e) => e.tid !== tid) }))
  }, [])

  const emptyTrash = useCallback(() => {
    if (!confirm('Permanently delete everything in the trash?')) return
    setData((prev) => ({ ...prev, trash: [] }))
  }, [])

  // Begin the disposal flow for a note, in whatever mode is active.
  const startDispose = useCallback((boardId, note, origin) => {
    setOpenNote(null)
    setDisposing({ boardId, note, origin, mode: data.disposalMode || 'toss' })
  }, [data.disposalMode])

  // ----- section helpers ----------------------------------------------------

  const addSection = useCallback(() => {
    updateBoard(currentBoardId, (b) => ({
      ...b,
      sections: [...b.sections, makeSection('New Section')],
    }))
  }, [currentBoardId, updateBoard])

  // Resize two adjacent zones by setting their weights (others untouched).
  const setWeights = useCallback(
    (idA, wa, idB, wb) => {
      updateBoard(currentBoardId, (b) => ({
        ...b,
        sections: b.sections.map((s) =>
          s.id === idA ? { ...s, weight: wa } : s.id === idB ? { ...s, weight: wb } : s,
        ),
      }))
    },
    [currentBoardId, updateBoard],
  )

  const toggleSplit = useCallback(
    (sectionId) => {
      updateBoard(currentBoardId, (b) => ({
        ...b,
        sections: b.sections.map((s) =>
          s.id === sectionId ? { ...s, split: !s.split } : s,
        ),
      }))
    },
    [currentBoardId, updateBoard],
  )

  const setRowLabel = useCallback(
    (sectionId, which, value) => {
      const key = which === 'top' ? 'topLabel' : 'bottomLabel'
      updateBoard(currentBoardId, (b) => ({
        ...b,
        sections: b.sections.map((s) =>
          s.id === sectionId ? { ...s, [key]: value } : s,
        ),
      }))
    },
    [currentBoardId, updateBoard],
  )

  const renameSection = useCallback(
    (sectionId, name) => {
      updateBoard(currentBoardId, (b) => ({
        ...b,
        sections: b.sections.map((s) =>
          s.id === sectionId ? { ...s, name } : s,
        ),
      }))
    },
    [currentBoardId, updateBoard],
  )

  const deleteSection = useCallback(
    (sectionId) => {
      updateBoard(currentBoardId, (b) => {
        if (b.sections.length <= 1) return b
        const fallback = b.sections.find((s) => s.id !== sectionId)
        return {
          ...b,
          sections: b.sections.filter((s) => s.id !== sectionId),
          notes: b.notes.map((n) =>
            n.sectionId === sectionId ? { ...n, sectionId: fallback.id } : n,
          ),
        }
      })
    },
    [currentBoardId, updateBoard],
  )

  const renameBoard = useCallback(
    (title) => updateBoard(currentBoardId, (b) => ({ ...b, title })),
    [currentBoardId, updateBoard],
  )

  // ----- import / export ----------------------------------------------------

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `whiteboard-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    const ts = Date.now()
    setLastExport(ts)
    localStorage.setItem('sticky-whiteboard:lastExport', String(ts))
  }, [data])

  const importJson = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = normalizeImported(JSON.parse(reader.result))
        setData(parsed)
        setNav([parsed.rootBoardId])
        setOpenNote(null)
      } catch (err) {
        alert('That file does not look like a whiteboard export.')
        console.warn(err)
      }
    }
    reader.readAsText(file)
  }, [])

  const resetBoard = useCallback(() => {
    if (!confirm('Clear everything and start a fresh whiteboard?')) return
    const fresh = defaultData()
    setData(fresh)
    setNav([fresh.rootBoardId])
  }, [])

  // ----- breadcrumb labels --------------------------------------------------

  const crumbs = useMemo(
    () =>
      nav.map((id) => ({ id, title: data.boards[id]?.title || 'Board' })),
    [nav, data],
  )

  const modalNote = openNote
    ? data.boards[openNote.boardId]?.notes.find((n) => n.id === openNote.noteId)
    : null

  // Notes impaled on the current board's spike, oldest at the bottom of the
  // stack (sorted by when they were spiked).
  const spikedNotes = useMemo(
    () =>
      (currentBoard?.notes || [])
        .filter((n) => n.spiked)
        .sort((a, b) => (a.spikedAt || 0) - (b.spikedAt || 0)),
    [currentBoard],
  )

  const trash = data.trash || []

  if (!currentBoard) return null

  return (
    <div className="app">
      <Toolbar
        crumbs={crumbs}
        onCrumb={(i) => setNav((s) => s.slice(0, i + 1))}
        boardTitle={currentBoard.title}
        onRenameBoard={renameBoard}
        isRoot={nav.length === 1}
        onAddSection={addSection}
        disposalMode={disposalMode}
        onToggleDisposalMode={toggleDisposalMode}
        trashCount={trash.length}
        onOpenTrash={() => setTrashOpen(true)}
        onExport={exportJson}
        onImport={importJson}
        onReset={resetBoard}
        lastExport={lastExport}
      />

      <Board
        board={currentBoard}
        disposalMode={disposalMode}
        onAddNote={addNote}
        onSetPosition={setPosition}
        onRaiseNote={raiseNote}
        onRenameSection={renameSection}
        onDeleteSection={deleteSection}
        onSetWeights={setWeights}
        onToggleSplit={toggleSplit}
        onSetRowLabel={setRowLabel}
        onOpenNote={(noteId) =>
          setOpenNote({ boardId: currentBoardId, noteId })
        }
        onEditText={(noteId, text) =>
          patchNote(currentBoardId, noteId, { text })
        }
        onSetColor={(noteId, color) =>
          patchNote(currentBoardId, noteId, { color })
        }
        onSetSize={cycleSize}
        onDispose={(note, origin) => startDispose(currentBoardId, note, origin)}
      />

      {/* Toss target — shown in toss mode (and while a toss is in flight). */}
      {(disposalMode === 'toss' || disposing?.mode === 'toss') && (
        <TrashBin ref={binRef} active={disposing?.mode === 'toss'} />
      )}

      {/* Spike — persistent whenever it holds notes, or while in spike mode. */}
      {(disposalMode === 'spike' || spikedNotes.length > 0) && (
        <Spike
          ref={spikeRef}
          notes={spikedNotes}
          active={disposing?.mode === 'spike'}
          onOpen={() => setSpikeOpen(true)}
        />
      )}

      {modalNote && (
        <NoteModal
          note={modalNote}
          disposalMode={disposalMode}
          onClose={() => setOpenNote(null)}
          onEditText={(text) =>
            patchNote(openNote.boardId, openNote.noteId, { text })
          }
          onEditDetails={(details) =>
            patchNote(openNote.boardId, openNote.noteId, { details })
          }
          onSetColor={(color) =>
            patchNote(openNote.boardId, openNote.noteId, { color })
          }
          onSetSize={(size) =>
            patchNote(openNote.boardId, openNote.noteId, { size })
          }
          onDispose={(origin) =>
            startDispose(openNote.boardId, modalNote, origin)
          }
        />
      )}

      {disposing?.mode === 'toss' && (
        <CrumpleToss
          note={disposing.note}
          origin={disposing.origin}
          binRef={binRef}
          onScored={() => {
            trashNote(disposing.boardId, disposing.note.id)
            setDisposing(null)
          }}
          onCancel={() => setDisposing(null)}
        />
      )}

      {disposing?.mode === 'spike' && (
        <SpikeImpale
          note={disposing.note}
          origin={disposing.origin}
          spikeRef={spikeRef}
          onDone={() => {
            spikeNote(disposing.boardId, disposing.note.id)
            setDisposing(null)
          }}
        />
      )}

      {spikeOpen && (
        <SpikeViewer
          notes={spikedNotes}
          onReturnToBoard={(noteId) => returnFromSpike(currentBoardId, noteId)}
          onSendToTrash={(noteId) => spikedToTrash(currentBoardId, noteId)}
          onClearAll={() => {
            clearSpike(currentBoardId)
            setSpikeOpen(false)
          }}
          onClose={() => setSpikeOpen(false)}
        />
      )}

      {trashOpen && (
        <TrashDrawer
          trash={trash}
          onRestore={restoreFromTrash}
          onDeleteForever={deleteForever}
          onEmpty={emptyTrash}
          onClose={() => setTrashOpen(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Toolbar({
  crumbs,
  onCrumb,
  boardTitle,
  onRenameBoard,
  isRoot,
  onAddSection,
  disposalMode,
  onToggleDisposalMode,
  trashCount,
  onOpenTrash,
  onExport,
  onImport,
  onReset,
  lastExport,
}) {
  const fileRef = useRef(null)

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="logo" aria-hidden>📌</span>
        <nav className="breadcrumbs">
          {crumbs.map((c, i) => (
            <span key={c.id} className="crumb">
              {i > 0 && <span className="crumb-sep">›</span>}
              {i === crumbs.length - 1 ? (
                <input
                  className="board-title-input"
                  value={boardTitle}
                  onChange={(e) => onRenameBoard(e.target.value)}
                  aria-label="Board title"
                />
              ) : (
                <button className="crumb-link" onClick={() => onCrumb(i)}>
                  {c.title}
                </button>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="toolbar-right">
        <div className="toolbar-buttons">
          <button className="btn" onClick={onAddSection}>+ Section</button>
          <div
            className="dispose-toggle"
            role="group"
            aria-label="Disposal mode for finished notes"
          >
            <button
              className={`dispose-opt${disposalMode === 'toss' ? ' on' : ''}`}
              onClick={() => disposalMode !== 'toss' && onToggleDisposalMode()}
              title="Finished notes crumple into the trash"
            >
              🗑 Toss
            </button>
            <button
              className={`dispose-opt${disposalMode === 'spike' ? ' on' : ''}`}
              onClick={() => disposalMode !== 'spike' && onToggleDisposalMode()}
              title="Finished notes stick on the spike"
            >
              📌 Spike
            </button>
          </div>
          <button className="btn" onClick={onOpenTrash}>
            🗑 Trash{trashCount ? ` (${trashCount})` : ''}
          </button>
          <button className="btn" onClick={onExport}>Export</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) onImport(e.target.files[0])
              e.target.value = ''
            }}
          />
          {isRoot && (
            <button className="btn btn-ghost" onClick={onReset}>Reset</button>
          )}
        </div>
        <ExportReminder lastExport={lastExport} />
      </div>
    </header>
  )
}

function ExportReminder({ lastExport }) {
  if (!lastExport) {
    return (
      <p className="export-note export-note-warn">
        ⚠ Not backed up yet — hit Export to save a copy
      </p>
    )
  }
  const d = new Date(lastExport)
  const abs = d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return (
    <p className="export-note">
      Last export: {abs} · {timeAgo(lastExport)}
    </p>
  )
}

function timeAgo(ts) {
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.floor(hr / 24)
  return `${day} day${day > 1 ? 's' : ''} ago`
}
