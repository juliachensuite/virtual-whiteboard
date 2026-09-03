import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Note from './Note.jsx'
import { NOTE_SIZES, scatter, sizeOf } from '../state.js'

// Layout constants (px). The board is one big surface: labeled zones fill the
// top, and a writing tray runs along the bottom. Notes float at fractional
// positions inside whichever region they currently live in.
const HEADER_H = 46
const PAD = 16
const MIN_ZONE_W = 260
const TRAY_H = 196
const ROW_LABEL_H = 22 // label band at the top of each split row half

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.4)

// A note's footprint (px), from its S/M/L size.
const dimsFor = (note) => NOTE_SIZES[sizeOf(note)]

// The usable placement rect for a note inside its zone — the whole zone body,
// or just the top/bottom half when the zone is split. Header and (for split
// rows) the row-label band are already excluded.
function regionFor(note, zone) {
  const contentTop = zone.top + HEADER_H
  const contentH = zone.h - HEADER_H
  if (zone.split) {
    const half = contentH / 2
    const isBottom = note.row === 'bottom'
    return {
      left: zone.left,
      top: (isBottom ? contentTop + half : contentTop) + ROW_LABEL_H,
      w: zone.w,
      h: half - ROW_LABEL_H,
    }
  }
  return { left: zone.left, top: contentTop, w: zone.w, h: contentH }
}

// A note's absolute board pixels, given its zone (or the tray).
function notePos(note, zone, tray) {
  const { w: nw, h: nh } = dimsFor(note)
  if (note.tray) {
    const usableW = Math.max(tray.w - 2 * PAD - nw, 1)
    const usableH = Math.max(tray.h - 2 * PAD - nh, 1)
    return {
      left: tray.left + PAD + clamp01(note.nx) * usableW,
      top: tray.top + PAD + clamp01(note.ny) * usableH,
    }
  }
  const region = regionFor(note, zone)
  const usableW = Math.max(region.w - 2 * PAD - nw, 1)
  const usableH = Math.max(region.h - 2 * PAD - nh, 1)
  return {
    left: region.left + PAD + clamp01(note.nx) * usableW,
    top: region.top + PAD + clamp01(note.ny) * usableH,
  }
}

// Given an absolute note-left/top and the note's footprint (dims), decide where
// it landed: down in the tray, or up in one of the zones (picked by horizontal
// band, then top/bottom row).
function posToPlacement(left, top, zones, tray, dims) {
  const { w: nw, h: nh } = dims
  const cy = top + nh / 2
  if (cy >= tray.top) {
    const usableW = Math.max(tray.w - 2 * PAD - nw, 1)
    const usableH = Math.max(tray.h - 2 * PAD - nh, 1)
    return {
      tray: true,
      nx: clamp01((left - tray.left - PAD) / usableW),
      ny: clamp01((top - tray.top - PAD) / usableH),
    }
  }
  const cx = left + nw / 2
  let target = zones[0]
  for (const z of zones) {
    if (cx >= z.left && cx < z.left + z.w) { target = z; break }
    if (cx >= z.left + z.w) target = z
  }
  // Which half, when the zone is split — by the note's vertical center.
  let row = 'top'
  if (target.split) {
    const half = (target.h - HEADER_H) / 2
    row = cy >= target.top + HEADER_H + half ? 'bottom' : 'top'
  }
  const region = regionFor({ row }, target)
  const usableW = Math.max(region.w - 2 * PAD - nw, 1)
  const usableH = Math.max(region.h - 2 * PAD - nh, 1)
  return {
    tray: false,
    sectionId: target.id,
    row,
    nx: clamp01((left - region.left - PAD) / usableW),
    ny: clamp01((top - region.top - PAD) / usableH),
  }
}

export default function Board({
  board,
  disposalMode,
  onAddNote,
  onSetPosition,
  onRaiseNote,
  onRenameSection,
  onDeleteSection,
  onSetWeights,
  onToggleSplit,
  onSetRowLabel,
  onOpenNote,
  onEditText,
  onSetColor,
  onSetSize,
  onDispose,
}) {
  const scrollRef = useRef(null)
  const boardRef = useRef(null)
  const [size, setSize] = useState({ w: 1000, h: 600 })
  const [drag, setDrag] = useState(null) // { id, left, top } while dragging
  const [editingId, setEditingId] = useState(null) // note being edited in place
  const dragInfo = useRef(null)
  const [dividerDrag, setDividerDrag] = useState(null) // index being dragged
  const dividerInfo = useRef(null)

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

  // Zone widths come from section weights (normalized by their sum), so the
  // proportions hold at any board width.
  const weights = board.sections.map((s) => (s.weight > 0 ? s.weight : 1))
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1
  const boardW = Math.max(size.w, n * MIN_ZONE_W)
  const boardH = size.h
  const zoneH = boardH - TRAY_H

  let acc = 0
  const zones = board.sections.map((s, i) => {
    const w = (boardW * weights[i]) / totalWeight
    const z = {
      id: s.id,
      name: s.name,
      split: s.split,
      topLabel: s.topLabel,
      bottomLabel: s.bottomLabel,
      left: acc,
      top: 0,
      w,
      h: zoneH,
    }
    acc += w
    return z
  })
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]))
  const tray = { left: 0, top: zoneH, w: boardW, h: TRAY_H }

  // Notes shown on the board are every live note except the ones impaled on
  // the spike (those render on the spike in the corner instead).
  const boardNotes = board.notes.filter((nt) => !nt.spiked)

  // ----- note drag handling -------------------------------------------------
  const beginDrag = (note, e) => {
    const boardRect = boardRef.current.getBoundingClientRect()
    const zone = zoneById[note.sectionId] || zones[0]
    const { left, top } = notePos(note, zone, tray)
    dragInfo.current = {
      id: note.id,
      dims: dimsFor(note),
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
          onSetPosition(info.id, posToPlacement(drag.left, drag.top, zones, tray, info.dims))
        } else {
          setEditingId(info.id) // a tap edits the note text in place
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

  // ----- divider drag (resize adjacent zones) -------------------------------
  const beginDividerDrag = (i, e) => {
    e.stopPropagation()
    e.preventDefault()
    dividerInfo.current = {
      i,
      startX: e.clientX,
      leftW: zones[i].w,
      rightW: zones[i + 1].w,
      // Weight stays in the pair so other zones are untouched.
      pairWeight: weights[i] + weights[i + 1],
      leftId: zones[i].id,
      rightId: zones[i + 1].id,
    }
    setDividerDrag(i)
  }

  useEffect(() => {
    if (dividerDrag == null) return
    const onMove = (e) => {
      const info = dividerInfo.current
      if (!info) return
      const combinedW = info.leftW + info.rightW
      let newLeftW = info.leftW + (e.clientX - info.startX)
      let newRightW = combinedW - newLeftW
      if (newLeftW < MIN_ZONE_W) { newLeftW = MIN_ZONE_W; newRightW = combinedW - newLeftW }
      if (newRightW < MIN_ZONE_W) { newRightW = MIN_ZONE_W; newLeftW = combinedW - newRightW }
      const wl = info.pairWeight * (newLeftW / combinedW)
      onSetWeights(info.leftId, wl, info.rightId, info.pairWeight - wl)
    }
    const onUp = () => {
      dividerInfo.current = null
      setDividerDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dividerDrag, onSetWeights])

  // Double-click inside the tray → new note right there. (The tray is the
  // only place notes are created.)
  const onBoardDoubleClick = (e) => {
    if (e.target.closest('.note')) return
    const boardRect = boardRef.current.getBoundingClientRect()
    // New notes are born medium, so center and place against the M footprint.
    const dims = NOTE_SIZES.M
    const left = e.clientX - boardRect.left - dims.w / 2
    const top = e.clientY - boardRect.top - dims.h / 2
    const p = posToPlacement(left, top, zones, tray, dims)
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
        disposalMode={disposalMode}
        left={isDragging ? drag.left : base.left}
        top={isDragging ? drag.top : base.top}
        dragging={isDragging}
        editing={editingId === note.id}
        onBeginDrag={(e) => beginDrag(note, e)}
        onEditText={(text) => onEditText(note.id, text)}
        onExitEdit={() => setEditingId((id) => (id === note.id ? null : id))}
        onOpen={() => onOpenNote(note.id)}
        onSetColor={(color) => onSetColor(note.id, color)}
        onCycleSize={() => onSetSize(note.id)}
        onDispose={(origin) => onDispose(note, origin)}
      />
    )
  }

  return (
    <main className="whiteboard" ref={scrollRef}>
      <div
        className={`board-surface${dividerDrag != null ? ' resizing' : ''}`}
        ref={boardRef}
        style={{ width: boardW, height: boardH }}
        onDoubleClick={onBoardDoubleClick}
      >
        {/* zone backgrounds + labels */}
        {zones.map((z, i) => (
          <div
            key={z.id}
            className={`zone${i % 2 ? ' zone-alt' : ''}${z.split ? ' zone-split' : ''}`}
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
                {boardNotes.filter((nt) => !nt.tray && nt.sectionId === z.id).length}
              </span>
              <button
                className={`zone-split-btn${z.split ? ' on' : ''}`}
                title={z.split ? 'Merge into one zone' : 'Split into top/bottom rows'}
                onClick={() => onToggleSplit(z.id)}
              >
                ⬓
              </button>
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

            {z.split && (
              <>
                <input
                  className="row-label row-label-top"
                  style={{ top: HEADER_H }}
                  value={z.topLabel}
                  onChange={(e) => onSetRowLabel(z.id, 'top', e.target.value)}
                  aria-label="Top row label"
                />
                <div
                  className="row-divider"
                  style={{ top: HEADER_H + (z.h - HEADER_H) / 2 }}
                />
                <input
                  className="row-label row-label-bottom"
                  style={{ top: HEADER_H + (z.h - HEADER_H) / 2 }}
                  value={z.bottomLabel}
                  onChange={(e) => onSetRowLabel(z.id, 'bottom', e.target.value)}
                  aria-label="Bottom row label"
                />
              </>
            )}
          </div>
        ))}

        {/* resize handles on the seams between zones */}
        {zones.slice(0, -1).map((z, i) => (
          <div
            key={`div-${z.id}`}
            className={`zone-divider${dividerDrag === i ? ' dragging' : ''}`}
            style={{ left: z.left + z.w, height: zoneH }}
            onPointerDown={(e) => beginDividerDrag(i, e)}
            title="Drag to resize zones"
          />
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
        {boardNotes.map(renderNote)}
      </div>
    </main>
  )
}

function tiltOnly() {
  const { tilt } = scatter()
  return { tilt }
}
