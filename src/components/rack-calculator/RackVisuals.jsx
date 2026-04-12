import { RACK_TOTAL_U, SWITCH_RESERVED_U, CORE_SWITCH_U, AGG_SWITCH_U, SERVER_TYPES } from './constants'

const SLOT_COLORS = { switch: '#6366f1', core: '#ef4444', agg: '#f97316', empty: '#111827' }

export function MiniRack({ rack, index, isSelected, onClick }) {
  const uH = 5, w = 52, h = RACK_TOTAL_U * uH
  const slots = []
  if (rack.torCount > 0) slots.push({ u: rack.torU || SWITCH_RESERVED_U, color: SLOT_COLORS.switch })
  for (let i = 0; i < (rack.torSwitches || 0); i++) slots.push({ u: SWITCH_RESERVED_U, color: SLOT_COLORS.switch })
  for (let i = 0; i < (rack.coreSwitches || 0); i++) slots.push({ u: CORE_SWITCH_U, color: SLOT_COLORS.core })
  for (let i = 0; i < (rack.aggSwitches || 0); i++) slots.push({ u: AGG_SWITCH_U, color: SLOT_COLORS.agg })
  for (const sv of rack.servers) {
    const st = SERVER_TYPES.find(t => t.key === sv.type)
    slots.push({ u: sv.size, color: st?.color ?? '#6b7280' })
  }
  const cu = slots.reduce((s, sl) => s + sl.u, 0)
  if (cu < RACK_TOTAL_U) slots.push({ u: RACK_TOTAL_U - cu, color: SLOT_COLORS.empty })

  let yOff = 0
  const rects = slots.map(s => { const y = yOff; yOff += s.u * uH; return { ...s, y, h: s.u * uH } })

  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${isSelected ? 'bg-gray-800 ring-2 ring-indigo-500' : 'hover:bg-gray-800/50'}`}>
      <svg width={w} height={h} className="rounded border border-gray-700">
        {rects.map((r, i) => (
          <rect key={i} x={0} y={r.y} width={w} height={r.h}
            fill={r.color} opacity={r.color === SLOT_COLORS.empty ? 0.2 : 0.65}
            stroke="#374151" strokeWidth={0.5} />
        ))}
      </svg>
      <div className="text-center leading-tight">
        <p className="text-[10px] text-gray-300 font-medium">Rack {index + 1}</p>
        <p className="text-[9px] text-gray-500">{rack.label}</p>
      </div>
    </button>
  )
}

export function RackDetail({ rack, tors, index }) {
  const rows = []
  let u = 1
  if (rack.torCount > 0) {
    const torU = rack.torU || SWITCH_RESERVED_U
    rows.push({ from: u, to: u + torU - 1, label: `Top of Rack Switch Space (${tors}\u00d7 Top of Rack)`, color: SLOT_COLORS.switch })
    u += torU
  }
  for (let i = 0; i < (rack.torSwitches || 0); i++) {
    rows.push({ from: u, to: u + SWITCH_RESERVED_U - 1, label: 'Top of Rack Switch', color: SLOT_COLORS.switch })
    u += SWITCH_RESERVED_U
  }
  for (let i = 0; i < (rack.coreSwitches || 0); i++) {
    rows.push({ from: u, to: u + CORE_SWITCH_U - 1, label: 'Core Switch', color: SLOT_COLORS.core })
    u += CORE_SWITCH_U
  }
  for (let i = 0; i < (rack.aggSwitches || 0); i++) {
    rows.push({ from: u, to: u + AGG_SWITCH_U - 1, label: 'Aggregation Switch', color: SLOT_COLORS.agg })
    u += AGG_SWITCH_U
  }
  for (const sv of rack.servers) {
    const st = SERVER_TYPES.find(t => t.key === sv.type)
    rows.push({ from: u, to: u + sv.size - 1, label: `${st?.label} ${sv.size}U Server`, color: st?.color ?? '#6b7280' })
    u += sv.size
  }
  if (u <= RACK_TOTAL_U) rows.push({ from: u, to: RACK_TOTAL_U, label: 'Empty', color: SLOT_COLORS.empty })

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Rack {index + 1} <span className="text-gray-500 font-normal">&mdash; {rack.label}</span></h3>
        <div className="flex gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">{rack.usedU}/{RACK_TOTAL_U}U</span>
          <span className={`text-xs px-2 py-0.5 rounded ${rack.freeU === 0 ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
            {rack.freeU}U free
          </span>
        </div>
      </div>
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span className="w-14 text-right text-gray-500 tabular-nums font-mono">
              U{row.from}{row.from !== row.to ? `\u2013U${row.to}` : ''}
            </span>
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: row.color, opacity: row.color === SLOT_COLORS.empty ? 0.3 : 0.7 }} />
            <span className="text-gray-300">{row.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs mt-3 pt-3 border-t border-gray-800">
        <span className="bg-gray-800 rounded px-2 py-1">{rack.totalServers} servers</span>
        <span className="bg-gray-800 rounded px-2 py-1">{rack.count7u}&times; 7U + {rack.count3u}&times; 3U</span>
        <span className="bg-gray-800 rounded px-2 py-1">{tors}&times; Top of Rack</span>
      </div>
    </div>
  )
}

export { SLOT_COLORS }
