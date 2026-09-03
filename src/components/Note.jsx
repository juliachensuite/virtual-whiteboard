import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NOTE_SIZES, NOTE_COLORS, colorFor, randomColorId, sizeOf } from '../state.js'
import { toggleMarker } from '../richtext.js'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Render a note's headline, turning **bold** / *italic* / ***both*** markers
// into real emphasis. Content between markers can't itself contain `*`, which
// keeps the scanner simple and is plenty for short headlines.
function renderRich(text) {
  const nodes = []
  const re = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let key = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] != null) nodes.push(<strong key={key++}><em>{m[1]}</em></strong>)
    else if (m[2] != null) nodes.push(<strong key={key++}>{m[2]}</strong>)
    else nodes.push(<em key={key++}>{m[3]}</em>)
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export default function Note({
  note,
  disposalMode,
  editing,
  left,
  top,
  dragging,
  onBeginDrag,
  onEditText,
  onExitEdit,
  onOpen,
  onSetColor,
  onCycleSize,
  onDispose,
}) {
  const [showColors, setShowColors] = useState(false)
  const textRef = useRef(null)
  const displayRef = useRef(null)
  const color = colorFor(note.color)
  const spikeMode = disposalMode === 'spike'
  const size = sizeOf(note)
  const dims = NOTE_SIZES[size]

  // On entering inline edit, focus the field and drop the caret at the end.
  useEffect(() => {
    if (!editing) return
    const ta = textRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
  }, [editing])

  // Auto-shrink the displayed text to fit the fixed note face. Start from the
  // size's base font, step down 1px at a time until it fits or hits an 8px
  // readability floor, then multiline-ellipsis whatever still overflows. Runs
  // only for the read view — while editing, the textarea scrolls instead.
  useLayoutEffect(() => {
    const el = displayRef.current
    if (!el) return
    el.style.fontSize = ''
    el.style.webkitLineClamp = ''
    el.classList.remove('note-text-clamped')
    if (!note.text) return
    let px = parseFloat(getComputedStyle(el).fontSize) || 21
    while (px > 8 && el.scrollHeight > el.clientHeight) {
      px -= 1
      el.style.fontSize = `${px}px`
    }
    if (el.scrollHeight > el.clientHeight) {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || px * 1.2
      el.style.webkitLineClamp = String(Math.max(1, Math.floor(el.clientHeight / lh)))
      el.classList.add('note-text-clamped')
    }
  }, [note.text, size, editing])

  const handleDispose = (e) => {
    e.stopPropagation()
    const rect = e.currentTarget.closest('.note')?.getBoundingClientRect()
    onDispose({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      w: rect?.width || 176,
      h: rect?.height || 168,
    })
  }

  // Apply/remove a marker around the current selection, then restore the
  // selection so the styled words stay highlighted for another toggle.
  const applyFmt = (marker) => {
    const ta = textRef.current
    if (!ta) return
    const res = toggleMarker(note.text, ta.selectionStart, ta.selectionEnd, marker)
    onEditText(res.text)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(res.start, res.end)
    })
  }

  const onTextKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onExitEdit()
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault()
      applyFmt('**')
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault()
      applyFmt('*')
    }
  }

  // Start a drag only when the gesture begins on the note body — never on the
  // action buttons, the color popover, or the text while it's being edited.
  const onPointerDown = (e) => {
    if (editing) return
    if (e.button != null && e.button !== 0) return
    if (e.target.closest('.note-actions')) return
    onBeginDrag(e)
  }

  return (
    <article
      className={`note size-${size}${dragging ? ' note-dragging' : ''}${editing ? ' note-editing' : ''}`}
      style={{
        left,
        top,
        width: dims.w,
        height: dims.h,
        '--note-bg': color.note,
        '--note-edge': color.edge,
        '--tilt': `${note.tilt || 0}deg`,
      }}
      onPointerDown={onPointerDown}
    >
      <div className="note-fold" aria-hidden />

      {editing ? (
        <textarea
          ref={textRef}
          className="note-text-edit"
          value={note.text}
          onChange={(e) => onEditText(e.target.value)}
          onKeyDown={onTextKeyDown}
          onBlur={onExitEdit}
          placeholder="Write a note…"
        />
      ) : (
        <div className="note-text" ref={displayRef}>
          {note.text
            ? renderRich(note.text)
            : <span className="note-placeholder">Tap to edit</span>}
        </div>
      )}

      {note.details?.trim() && (
        <span className="note-detail-badge" title="Has notes — open to read" aria-hidden>
          📝
        </span>
      )}

      <div className="note-actions">
        {editing && (
          <>
            {/* onMouseDown + preventDefault keeps the text selection alive when
                the field would otherwise blur on button focus. */}
            <button
              className="action-btn action-fmt action-bold"
              title="Bold (⌘B)"
              onMouseDown={(e) => { e.preventDefault(); applyFmt('**') }}
            >
              B
            </button>
            <button
              className="action-btn action-fmt action-italic"
              title="Italic (⌘I)"
              onMouseDown={(e) => { e.preventDefault(); applyFmt('*') }}
            >
              I
            </button>
          </>
        )}

        {!editing && (
          <button
            className="action-btn action-size"
            title={`Size: ${size} — click to resize`}
            onClick={(e) => { e.stopPropagation(); onCycleSize() }}
          >
            {size}
          </button>
        )}

        <div className="color-wrap">
          <button
            className="action-btn"
            title="Color"
            onClick={(e) => {
              e.stopPropagation()
              setShowColors((v) => !v)
            }}
          >
            <span className="swatch-dot" style={{ background: color.note }} />
          </button>
          {showColors && (
            <div className="color-pop" onMouseLeave={() => setShowColors(false)}>
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.id}
                  className={`swatch${c.id === note.color ? ' swatch-on' : ''}`}
                  style={{ background: c.note }}
                  title={capitalize(c.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSetColor(c.id)
                    setShowColors(false)
                  }}
                />
              ))}
              <button
                className="swatch swatch-random"
                title="Random color"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetColor(randomColorId(note.color))
                  setShowColors(false)
                }}
              />
            </div>
          )}
        </div>

        <button
          className="action-btn"
          title="Open notes & details"
          onClick={(e) => { e.stopPropagation(); onOpen() }}
        >
          ⤢
        </button>

        <button
          className="action-btn action-trash"
          title={spikeMode ? 'Stick on spike' : 'Crumple & toss'}
          onClick={handleDispose}
        >
          {spikeMode ? '📌' : '🗑'}
        </button>
      </div>
    </article>
  )
}
