import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collectBoardIds,
  defaultData,
  loadData,
  makeBoard,
  makeNote,
  saveData,
  uid,
} from './state.js'
import Board from './components/Board.jsx'
import NoteModal from './components/NoteModal.jsx'
import TrashBin from './components/TrashBin.jsx'
import CrumpleToss from './components/CrumpleToss.jsx'

export default function App() {
  const [data, setData] = useState(loadData)
  // Stack of board ids representing the drill-down path (root first).
  const [nav, setNav] = useState([data.rootBoardId])
  // Note currently open in the detail modal: { boardId, noteId } | null
  const [openNote, setOpenNote] = useState(null)
  // Note being crumpled & tossed: { boardId, note, origin: {x,y} } | null
  const [tossing, setTossing] = useState(null)
  // Timestamp (ms) of the last JSON export, persisted on its own.
  const [lastExport, setLastExport] = useState(() => {
    const v = localStorage.getItem('sticky-whiteboard:lastExport')
    return v ? Number(v) : null
  })

  const binRef = useRef(null)

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

  // Actually remove a note (and any sub-boards it owns) from the data.
  const removeNote = useCallback(
    (boardId, noteId) => {
      setData((prev) => {
        const board = prev.boards[boardId]
        if (!board) return prev
        const note = board.notes.find((n) => n.id === noteId)
        const boards = { ...prev.boards }
        if (note?.subBoardId) {
          for (const id of collectBoardIds(boards, note.subBoardId)) {
            delete boards[id]
          }
        }
        boards[boardId] = {
          ...board,
          notes: board.notes.filter((n) => n.id !== noteId),
        }
        return { ...prev, boards }
      })
    },
    [],
  )

  // Begin the crumple + toss flow for a note.
  const startToss = useCallback((boardId, note, origin) => {
    setOpenNote(null)
    setTossing({ boardId, note, origin })
  }, [])

  const openSubBoard = useCallback(
    (boardId, noteId) => {
      setData((prev) => {
        const board = prev.boards[boardId]
        const note = board?.notes.find((n) => n.id === noteId)
        if (!note) return prev
        if (note.subBoardId && prev.boards[note.subBoardId]) return prev
        const sub = makeBoard(note.text?.trim() || 'Sub-board')
        return {
          ...prev,
          boards: {
            ...prev.boards,
            [sub.id]: sub,
            [boardId]: {
              ...board,
              notes: board.notes.map((n) =>
                n.id === noteId ? { ...n, subBoardId: sub.id } : n,
              ),
            },
          },
        }
      })
      // Navigate after state settles.
      setData((prev) => {
        const note = prev.boards[boardId]?.notes.find((n) => n.id === noteId)
        if (note?.subBoardId) {
          setNav((s) => [...s, note.subBoardId])
          setOpenNote(null)
        }
        return prev
      })
    },
    [],
  )

  // ----- section helpers ----------------------------------------------------

  const addSection = useCallback(() => {
    updateBoard(currentBoardId, (b) => ({
      ...b,
      sections: [...b.sections, { id: uid('sec'), name: 'New Section' }],
    }))
  }, [currentBoardId, updateBoard])

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
        const parsed = JSON.parse(reader.result)
        if (!parsed.boards || !parsed.rootBoardId) {
          throw new Error('Not a whiteboard file')
        }
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
        onExport={exportJson}
        onImport={importJson}
        onReset={resetBoard}
        lastExport={lastExport}
      />

      <Board
        board={currentBoard}
        boards={data.boards}
        onAddNote={addNote}
        onSetPosition={setPosition}
        onRaiseNote={raiseNote}
        onRenameSection={renameSection}
        onDeleteSection={deleteSection}
        onOpenNote={(noteId) =>
          setOpenNote({ boardId: currentBoardId, noteId })
        }
        onSetColor={(noteId, color) =>
          patchNote(currentBoardId, noteId, { color })
        }
        onOpenSubBoard={(noteId) => openSubBoard(currentBoardId, noteId)}
        onToss={(note, origin) => startToss(currentBoardId, note, origin)}
      />

      <TrashBin ref={binRef} active={!!tossing} />

      {modalNote && (
        <NoteModal
          note={modalNote}
          subTaskCount={
            modalNote.subBoardId
              ? data.boards[modalNote.subBoardId]?.notes.length || 0
              : 0
          }
          onClose={() => setOpenNote(null)}
          onEditText={(text) =>
            patchNote(openNote.boardId, openNote.noteId, { text })
          }
          onSetColor={(color) =>
            patchNote(openNote.boardId, openNote.noteId, { color })
          }
          onOpenSubBoard={() =>
            openSubBoard(openNote.boardId, openNote.noteId)
          }
          onToss={(origin) =>
            startToss(openNote.boardId, modalNote, origin)
          }
        />
      )}

      {tossing && (
        <CrumpleToss
          note={tossing.note}
          origin={tossing.origin}
          binRef={binRef}
          onScored={() => {
            removeNote(tossing.boardId, tossing.note.id)
            setTossing(null)
          }}
          onCancel={() => setTossing(null)}
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
