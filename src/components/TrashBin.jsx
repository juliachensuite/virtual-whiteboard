import { forwardRef } from 'react'

// A little wire-mesh waste bin parked in the bottom-right corner. The toss
// minigame reads this element's bounding box to detect a successful basket.
const TrashBin = forwardRef(function TrashBin({ active }, ref) {
  return (
    <div className={`trash${active ? ' trash-active' : ''}`}>
      <div className="trash-hint">{active ? 'Flick it in! 🎯' : ''}</div>
      <svg
        ref={ref}
        className="trash-bin"
        viewBox="0 0 120 130"
        width="120"
        height="130"
        aria-label="Wire trash bin"
      >
        {/* back rim */}
        <ellipse cx="60" cy="26" rx="46" ry="13" className="bin-rim-back" />
        {/* body mesh */}
        <path
          d="M16 26 L28 116 Q60 128 92 116 L104 26"
          className="bin-body"
        />
        {/* vertical wires */}
        {[28, 40, 52, 64, 76, 88].map((x, i) => (
          <line
            key={i}
            x1={x}
            y1="30"
            x2={x + (x < 60 ? 6 : -6)}
            y2="116"
            className="bin-wire"
          />
        ))}
        {/* horizontal wire rings */}
        {[48, 70, 92].map((y, i) => (
          <ellipse
            key={i}
            cx="60"
            cy={y}
            rx={44 - i * 6}
            ry={11 - i * 2}
            className="bin-ring"
          />
        ))}
        {/* front rim */}
        <ellipse cx="60" cy="26" rx="46" ry="13" className="bin-rim-front" />
      </svg>
    </div>
  )
})

export default TrashBin
