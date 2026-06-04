import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Note from './Note.jsx'
import { scatter } from '../state.js'

// Layout constants (px). The board is one big surface: labeled zones fill the
// top, and a writing tray runs along the bottom. Notes float at fractional
// positions inside whichever region they currently live in.
const NOTE_W = 176
const NOTE_H = 168
const HEADER_H = 46
const PAD = 16
const MIN_ZONE_W = 260
const TRAY_H = 196

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.4)

// A note's absolute board pixels, given its region rect.
function notePos(note, zone, tray) {
  if (note.tray) {
    const usableW = Math.max(tray.w - 2 * PAD - NOTE_W, 1)
    const usableH = Math.max(tray.h - 2 * PAD - NOTE_H, 1)
    return {
      left: tray.left + PAD + clamp01(note.nx) * usableW,
      top: tray.top + PAD + clamp01(note.ny) * usableH,
    }
  }
  const usableW = Math.max(zone.w - 2 * PAD - NOTE_W, 1)
  const usableH = Math.max(zone.h - HEADER_H - 2 * PAD - NOTE_H, 1)
  return {
    left: zone.left + PAD + clamp01(note.nx) * usableW,
    top: zone.top + HEADER_H + PAD + clamp01(note.ny) * usableH,
  }
}

// Given an absolute note-left/top, decide where it landed: down in the tray,
// or up in one of the zones (picked by horizontal band).
function posToPlacement(left, top, zones, tray) {
  const cy = top + NOTE_H / 2
  if (cy >= tray.top) {
    const usableW = Math.max(tray.w - 2 * PAD - NOTE_W, 1)
    const usableH = Math.max(tray.h - 2 * PAD - NOTE_H, 1)
    return {
      tray: true,
      nx: clamp01((left - tray.left - PAD) / usableW),
      ny: clamp01((top - tray.top - PAD) / usableH),
    }
  }
  const cx = left + NOTE_W / 2
  let target = zones[0]
  for (const z of zones) {
    if (cx >= z.left && cx < z.left + z.w) { target = z; break }
    if (cx >= z.left + z.w) target = z
  }
  const usableW = Math.max(target.w - 2 * PAD - NOTE_W, 1)
  const usableH = Math.max(target.h - HEADER_H - 2 * PAD - NOTE_H, 1)
  return {
    tray: false,
    sectionId: target.id,
    nx: clamp01((left - target.left - PAD) / usableW),
    ny: clamp01((top - target.top - HEADER_H - PAD) / usableH),
  }
}

export default function Board({
  board,
  onAddNote,
  onSetPosition,
  onRaiseNote,
  onRenameSection,
  onDeleteSection,
  onOpenNote,
  onSetColor,
  onToss,
}) {
  const scrollRef = useRef(null)
  const boardRef = useRef(null)
  const [size, setSize] = useState({ w: 1000, h: 600 })
  const [drag, setDrag] = useState(null) // { id, left, top } while dragging
  const dragInfo = useRef(null)

  const n = board.sections.length
  const firstSectionId = board.sections[0]?.id

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const boardW = Math.max(size.w, n * MIN_ZONE_W)
  const boardH = size.h
  const zoneH = boardH - TRAY_H
  const zoneW = boardW / n

  const zones = board.sections.map((s, i) => ({
    id: s.id,
    name: s.name,
    left: i * zoneW,
    top: 0,
    w: zoneW,
    h: zoneH,
  }))
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]))
  const tray = { left: 0, top: zoneH, w: boardW, h: TRAY_H }

  // ----- drag handling ------------------------------------------------------
  const beginDrag = (note, e) => {
    const boardRect = boardRef.current.getBoundingClientRect()
    const zone = zoneById[note.sectionId] || zones[0]
    const { left, top } = notePos(note, zone, tray)
    dragInfo.current = {
      id: note.id,
      dx: e.clientX - (boardRect.left + left),
      dy: e.clientY - (boardRect.top + top),
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      boardRect,
    }
    onRaiseNote(note.id)
    setDrag({ id: note.id, left, top })
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      const info = dragInfo.current
      if (!info) return
      if (Math.hypot(e.clientX - info.startX, e.clientY - info.startY) > 4) {
        info.moved = true
      }
      setDrag({
        id: info.id,
        left: e.clientX - info.boardRect.left - info.dx,
        top: e.clientY - info.boardRect.top - info.dy,
      })
    }
    const onUp = () => {
      const info = dragInfo.current
      if (info && drag) {
        if (info.moved) {
          onSetPosition(info.id, posToPlacement(drag.left, drag.top, zones, tray))
        } else {
          onOpenNote(info.id) // a tap opens the note
        }
      }
      dragInfo.current = null
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, zones, tray, onSetPosition, onOpenNote])

  // Double-click inside the tray → new note right there. (The tray is the
  // only place notes are created.)
  const onBoardDoubleClick = (e) => {
    if (e.target.closest('.note')) return
    const boardRect = boardRef.current.getBoundingClientRect()
    const left = e.clientX - boardRect.left - NOTE_W / 2
    const top = e.clientY - boardRect.top - NOTE_H / 2
    const p = posToPlacement(left, top, zones, tray)
    if (!p.tray) return // ignore double-clicks up in the zones
    onAddNote(firstSectionId, { tray: true, nx: p.nx, ny: p.ny, ...tiltOnly() })
  }

  const addTrayNote = () => {
    const s = scatter()
    onAddNote(firstSectionId, { tray: true, nx: s.nx, ny: 0.32, tilt: s.tilt })
  }

  const renderNote = (note) => {
    const zone = zoneById[note.sectionId] || zones[0]
    const base = notePos(note, zone, tray)
    const isDragging = drag?.id === note.id
    return (
      <Note
        key={note.id}
        note={note}
        left={isDragging ? drag.left : base.left}
        top={isDragging ? drag.top : base.top}
        dragging={isDragging}
        onBeginDrag={(e) => beginDrag(note, e)}
        onSetColor={(color) => onSetColor(note.id, color)}
        onToss={(origin) => onToss(note, origin)}
      />
    )
  }

  return (
    <main className="whiteboard" ref={scrollRef}>
      <div
        className="board-surface"
        ref={boardRef}
        style={{ width: boardW, height: boardH }}
        onDoubleClick={onBoardDoubleClick}
      >
        {/* zone backgrounds + labels */}
        {zones.map((z, i) => (
          <div
            key={z.id}
            className={`zone${i % 2 ? ' zone-alt' : ''}`}
            style={{ left: z.left, top: z.top, width: z.w, height: z.h }}
          >
            <div className="zone-head">
              <input
                className="zone-name"
                value={z.name}
                onChange={(e) => onRenameSection(z.id, e.target.value)}
                aria-label="Zone name"
              />
              <span className="zone-count">
                {board.notes.filter((nt) => !nt.tray && nt.sectionId === z.id).length}
              </span>
              {n > 1 && (
                <button
                  className="zone-del"
                  title="Delete zone (notes move to first zone)"
                  onClick={() => onDeleteSection(z.id)}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}

        {/* writing tray */}
        <div
          className="tray"
          style={{ left: tray.left, top: tray.top, width: tray.w, height: tray.h }}
        >
          <div className="tray-label">
            <span className="tray-pen" aria-hidden>✎</span>
            <span>Write a note, then drag it up onto the board</span>
            <button className="tray-add" onClick={addTrayNote}>+ New note</button>
          </div>
        </div>

        {/* notes layer (tray notes render above the tray, board notes in zones) */}
        {board.notes.map(renderNote)}
      </div>
    </main>
  )
}

function tiltOnly() {
  const { tilt } = scatter()
  return { tilt }
}
