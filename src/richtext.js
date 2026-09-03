// ---------------------------------------------------------------------------
// Lightweight inline formatting for note headlines.
//
// A note's `text` stores markdown-style markers inline, so only the selected
// words are styled (not the whole note):
//
//   **bold**      *italic*      ***bold italic***
//
// Plain text with no markers renders exactly as before, so older notes and
// notes typed in the modal keep working untouched.
// ---------------------------------------------------------------------------

// Toggle a marker (`**` bold or `*` italic) around the [start, end) selection
// of `text`. If the selection is already wrapped in that marker, it's removed;
// otherwise it's added. Returns the new text plus the selection range to
// restore, so the highlighted words stay highlighted after the edit.
export function toggleMarker(text, start, end, marker) {
  const m = marker
  const len = m.length
  const before = text.slice(0, start)
  const sel = text.slice(start, end)
  const after = text.slice(end)

  // Guard so an italic toggle (`*`) doesn't mistake a bold marker (`**`) for
  // its own — we only treat a single `*` as italic when it isn't part of `**`.
  const isBoldNeighbor = (s, atEnd) =>
    m === '*' && (atEnd ? s.endsWith('**') : s.startsWith('**'))

  // Case 1: markers sit just outside the selection → unwrap them.
  if (
    before.endsWith(m) &&
    after.startsWith(m) &&
    !isBoldNeighbor(before, true) &&
    !isBoldNeighbor(after, false)
  ) {
    return {
      text: before.slice(0, -len) + sel + after.slice(len),
      start: start - len,
      end: end - len,
    }
  }

  // Case 2: the selection itself is wrapped → strip the inner markers.
  if (
    sel.length >= 2 * len &&
    sel.startsWith(m) &&
    sel.endsWith(m) &&
    !(m === '*' && (sel.startsWith('**') || sel.endsWith('**')))
  ) {
    return {
      text: before + sel.slice(len, sel.length - len) + after,
      start,
      end: end - 2 * len,
    }
  }

  // Case 3: nothing wrapped yet → wrap the selection (or drop an empty pair at
  // the cursor and put the caret between the markers so typing comes out styled).
  return {
    text: before + m + sel + m + after,
    start: start + len,
    end: end + len,
  }
}
