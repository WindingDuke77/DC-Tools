import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import { RackPreview, ServerPreview, CablePreview } from './RackViewer'

// --- Color helpers ---
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255
  let g = parseInt(hex.slice(3, 5), 16) / 255
  let b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * Math.max(0, Math.min(1, color))).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function deriveRackCable(serverHex) {
  const [h, , l] = hexToHsl(serverHex)
  return {
    rack: hslToHex(h, 100, Math.min(Math.max(l * 2, 40), 50)),
    cable: hslToHex(h, 100, Math.max(l * 0.5, 5)),
  }
}

// --- Preset server types (server body colour is fixed per type) ---
const SERVER_PRESETS = {
  system:    { label: 'System',    server: '#706501', rack: '#FFE401', cable: '#655A00' },
  mainframe: { label: 'Mainframe', server: '#46001E', rack: '#CB0061', cable: '#310017' },
  risc:      { label: 'RISC',      server: '#00012F', rack: '#0003CE', cable: '#000034' },
  gpu:       { label: 'GPU',       server: '#004503', rack: '#00CF06', cable: '#003501' },
}

const DEFAULT_STATE = { type: 'system', customServer: '#706501', customRack: '#FFE401', customCable: '#655A00' }

// --- localStorage helpers ---
const STORAGE_KEY = 'dc-tools-palettes'

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function persistSaved(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// Encode state for URL sharing
function encodePreset(state) {
  if (state.type !== 'custom') return state.type
  return `c:${state.customServer.slice(1)},${state.customRack.slice(1)},${state.customCable.slice(1)}`
}

function decodePreset(str) {
  if (!str) return null
  if (SERVER_PRESETS[str]) return { type: str, customServer: '#706501', customRack: '#FFE401', customCable: '#655A00' }
  const m = str.match(/^c:([0-9a-fA-F]{6}),([0-9a-fA-F]{6}),([0-9a-fA-F]{6})$/)
  if (m) return { type: 'custom', customServer: `#${m[1]}`, customRack: `#${m[2]}`, customCable: `#${m[3]}` }
  return null
}

// --- Resolve colours from state ---
function resolveColors(state) {
  if (state.type === 'custom') {
    return { server: state.customServer, rack: state.customRack, cable: state.customCable, label: 'Custom' }
  }
  const p = SERVER_PRESETS[state.type]
  return { server: p.server, rack: p.rack, cable: p.cable, label: p.label }
}

// --- SVG: 20U rack, 3U server, 1U patch panel ---
function RackSVG({ rack, cable, server }) {
  // 1U = 18px, 20U rack = 360px inner height
  const U = 18
  const rackU = 20
  const padTop = 30    // top padding inside frame
  const padSide = 15   // side padding inside frame
  const innerH = rackU * U               // 360
  const frameX = 40
  const frameY = 15
  const frameW = 220
  const frameH = innerH + padTop * 2     // 420
  const innerX = frameX + padSide        // 55
  const innerY = frameY + padTop         // 45
  const innerW = frameW - padSide * 2    // 190
  const slotX = innerX + 13              // 68
  const slotW = innerW - 26              // 164

  // Slot positions (U index, 0-based from top): patch panel first, then server
  const patchStartU = 0
  const patchSizeU = 1
  const serverStartU = 2  // 1U gap after patch
  const serverSizeU = 3

  const uY = (u) => innerY + u * U
  const patchY = uY(patchStartU)
  const patchH = patchSizeU * U     // 18
  const serverY = uY(serverStartU)
  const serverH = serverSizeU * U   // 54

  // Empty slots start after server + 1U gap
  const emptyStartU = serverStartU + serverSizeU + 1  // U6
  const emptyCount = rackU - emptyStartU               // 14 slots

  // Rail screw positions: every 2U
  const screwUs = Array.from({ length: Math.floor(rackU / 2) + 1 }, (_, i) => i * 2)

  // Cable connection points on patch panel (ports 2 and 5)
  const cablePort1X = slotX + 8 + 2 * 19 + 6
  const cablePort2X = slotX + 8 + 5 * 19 + 6
  const patchBottom = patchY + patchH

  // Cable connection points on server top
  const cable1ServerX = slotX + 40
  const cable2ServerX = slotX + slotW - 40

  return (
    <svg viewBox={`0 0 300 ${frameH + 30}`} className="w-full max-w-sm mx-auto" role="img" aria-label="Server rack diagram">
      {/* Rack outer frame */}
      <rect x={frameX} y={frameY} width={frameW} height={frameH} rx="6" fill={rack} stroke="#475569" strokeWidth="2" />
      {/* Inner cavity */}
      <rect x={innerX} y={innerY} width={innerW} height={innerH} rx="2" fill="#0f1219" />
      {/* Rails */}
      <rect x={innerX} y={innerY} width="7" height={innerH} fill="#475569" opacity="0.35" />
      <rect x={innerX + innerW - 7} y={innerY} width="7" height={innerH} fill="#475569" opacity="0.35" />

      {/* --- Patch Panel (1U) --- */}
      <rect x={slotX} y={patchY} width={slotW} height={patchH} rx="2" fill="#374151" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <rect key={`p-${i}`} x={slotX + 8 + i * 19} y={patchY + 3} width="13" height={patchH - 6} rx="1.5" fill="#1f2937" stroke="#4b5563" strokeWidth="0.4" />
      ))}

      {/* --- Cables (patch → server) --- */}
      <path
        d={`M ${cablePort1X} ${patchBottom} C ${cablePort1X} ${patchBottom + 10}, ${cable1ServerX} ${serverY - 10}, ${cable1ServerX} ${serverY}`}
        fill="none" stroke={cable} strokeWidth="2.5" strokeLinecap="round"
      />
      <path
        d={`M ${cablePort2X} ${patchBottom} C ${cablePort2X} ${patchBottom + 10}, ${cable2ServerX} ${serverY - 10}, ${cable2ServerX} ${serverY}`}
        fill="none" stroke={cable} strokeWidth="2.5" strokeLinecap="round"
      />

      {/* --- Server (3U) --- */}
      <rect x={slotX} y={serverY} width={slotW} height={serverH} rx="3" fill={server} />
      {/* Front panel label bar */}
      <rect x={slotX + 8} y={serverY + 6} width="36" height="3" rx="1.5" fill="white" opacity="0.25" />
      {/* LEDs */}
      <circle cx={slotX + slotW - 20} cy={serverY + 8} r="2.5" fill="#22c55e">
        <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={slotX + slotW - 12} cy={serverY + 8} r="2.5" fill="#22c55e" opacity="0.4" />
      {/* Drive bays — single row of 4 */}
      {[0, 1, 2, 3].map(i => (
        <rect key={`d-${i}`} x={slotX + 8 + i * 30} y={serverY + 16} width="24" height="16" rx="2" fill="black" opacity="0.18" stroke="black" strokeWidth="0.4" strokeOpacity="0.25" />
      ))}
      {/* Vent slots */}
      {[0, 1, 2].map(i => (
        <rect key={`v-${i}`} x={slotX + slotW - 42 + i * 14} y={serverY + 38} width="8" height="10" rx="1" fill="black" opacity="0.12" />
      ))}

      {/* --- Empty U slots --- */}
      {Array.from({ length: emptyCount }, (_, i) => {
        const y = uY(emptyStartU + i)
        return (
          <g key={`e-${i}`}>
            <rect x={slotX} y={y} width={slotW} height={U} rx="1" fill="black" opacity="0.08" />
            <line x1={slotX} y1={y} x2={slotX + slotW} y2={y} stroke="#475569" strokeWidth="0.3" strokeDasharray="3 3" />
          </g>
        )
      })}
      {/* Bottom line */}
      <line x1={slotX} y1={uY(rackU)} x2={slotX + slotW} y2={uY(rackU)} stroke="#475569" strokeWidth="0.3" strokeDasharray="3 3" />

      {/* --- Screw holes --- */}
      {screwUs.map(u => (
        <g key={`sc-${u}`}>
          <circle cx={innerX + 3.5} cy={uY(u) + U / 2} r="2.5" fill="#475569" />
          <circle cx={innerX + innerW - 3.5} cy={uY(u) + U / 2} r="2.5" fill="#475569" />
        </g>
      ))}

      {/* U labels on left rail */}
      {Array.from({ length: rackU }, (_, i) => (
        <text key={`u-${i}`} x={frameX + 5} y={uY(i) + U / 2 + 3} fontSize="6" fill="#475569" fontFamily="monospace">{i + 1}</text>
      ))}
    </svg>
  )
}

// --- Swatch ---
function Swatch({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-md border border-gray-700 shrink-0" style={{ backgroundColor: value }} />
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <button onClick={copy} className="text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
          {copied ? 'Copied!' : value.toUpperCase()}
        </button>
      </div>
    </div>
  )
}

// --- Page ---
export default function ColorPalette() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [saved, setSaved] = useState(loadSaved)

  // Init from ?p= or default
  const [state, setState] = useState(() => {
    const p = searchParams.get('p')
    return decodePreset(p) || DEFAULT_STATE
  })

  const colors = useMemo(() => resolveColors(state), [state])

  // Derive rack & cable from a base server colour
  const handleCustomBaseChange = useCallback((hex) => {
    const derived = deriveRackCable(hex)
    setState((s) => ({ ...s, customServer: hex, customRack: derived.rack, customCable: derived.cable }))
  }, [])

  // Or let them tweak rack / cable independently
  const handleRackDirect = useCallback((hex) => {
    setState((s) => ({ ...s, customRack: hex }))
  }, [])
  const handleCableDirect = useCallback((hex) => {
    setState((s) => ({ ...s, customCable: hex }))
  }, [])

  const selectPreset = useCallback((type) => {
    setState((s) => ({ ...s, type }))
  }, [])

  // --- Share ---
  const shareUrl = useMemo(() => {
    const base = window.location.origin + window.location.pathname
    return `${base}#/tools/color-palette?p=${encodePreset(state)}`
  }, [state])

  const [linkCopied, setLinkCopied] = useState(false)
  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setSearchParams({ p: encodePreset(state) }, { replace: true })
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1500)
  }

  // --- Save to localStorage ---
  const [saveName, setSaveName] = useState('')
  const handleSave = () => {
    const name = saveName.trim() || `Preset ${saved.length + 1}`
    const entry = { name, state: { ...state }, id: Date.now() }
    const next = [...saved, entry]
    setSaved(next)
    persistSaved(next)
    setSaveName('')
  }

  const handleDeleteSaved = (id) => {
    const next = saved.filter((s) => s.id !== id)
    setSaved(next)
    persistSaved(next)
  }

  const handleLoadSaved = (entry) => {
    setState(entry.state)
  }

  // --- Export text ---
  const handleExport = () => {
    const lines = [
      `Server: ${colors.server.toUpperCase()}`,
      `Rack:   ${colors.rack.toUpperCase()}`,
      `Cable:  ${colors.cable.toUpperCase()}`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="mb-8">
          <a href="#/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">&larr; Back to Tools</a>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Color Palette Generator</h1>
        <p className="text-gray-400 mb-10">
          Pick a server type or create a custom palette — rack and cable colours update live.
        </p>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* 3D Previews — 2×2 grid, rack spans left column */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4" style={{ gridTemplateRows: '1fr 1fr' }}>
              <div className="row-span-2 flex flex-col">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Rack</p>
                <div className="flex-1 min-h-0">
                  <RackPreview color={colors.rack} height="100%" className="border border-gray-800 h-full" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Cable</p>
                <CablePreview color={colors.cable} height="160px" className="border border-gray-800" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-center">Server</p>
                <ServerPreview type={state.type === 'custom' ? 'system' : state.type} color={colors.server} height="160px" className="border border-gray-800" />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-8">
            {/* Quick presets */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Server Type</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SERVER_PRESETS).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => selectPreset(key)}
                    className={`text-sm px-4 py-2 rounded-lg border transition-colors cursor-pointer flex items-center gap-2 ${
                      state.type === key
                        ? 'border-indigo-500 bg-indigo-500/20 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: val.server }} />
                    {val.label}
                  </button>
                ))}
                <button
                  onClick={() => selectPreset('custom')}
                  className={`text-sm px-4 py-2 rounded-lg border transition-colors cursor-pointer ${
                    state.type === 'custom'
                      ? 'border-indigo-500 bg-indigo-500/20 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {/* Custom controls */}
            {state.type === 'custom' && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-2">Pick a server colour — rack &amp; cable derive automatically:</p>
                  <label className="relative cursor-pointer inline-block">
                    <input
                      type="color"
                      value={state.customServer}
                      onChange={(e) => handleCustomBaseChange(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-12 h-12 rounded-lg border-2 border-gray-600 hover:border-gray-400 transition-colors" style={{ backgroundColor: state.customServer }} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Rack (override)</p>
                    <label className="relative cursor-pointer inline-block">
                      <input
                        type="color"
                        value={state.customRack}
                        onChange={(e) => handleRackDirect(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-10 h-10 rounded-lg border-2 border-gray-700 hover:border-gray-500 transition-colors" style={{ backgroundColor: state.customRack }} />
                    </label>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Cable (override)</p>
                    <label className="relative cursor-pointer inline-block">
                      <input
                        type="color"
                        value={state.customCable}
                        onChange={(e) => handleCableDirect(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-10 h-10 rounded-lg border-2 border-gray-700 hover:border-gray-500 transition-colors" style={{ backgroundColor: state.customCable }} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Derived colours display */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Colours</h2>
              <div className="grid grid-cols-3 gap-4">
                <Swatch label="Server" value={colors.server} />
                <Swatch label="Rack" value={colors.rack} />
                <Swatch label="Cable" value={colors.cable} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExport}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Copy Palette
              </button>
              <button
                onClick={copyLink}
                className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {linkCopied ? 'Link Copied!' : 'Share Link'}
              </button>
            </div>

            {/* Save preset */}
            <div className="border-t border-gray-800 pt-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Save Preset</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Preset name…"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleSave}
                  className="bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Saved presets */}
            {saved.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Saved Presets</h2>
                <div className="space-y-2">
                  {saved.map((entry) => {
                    const c = resolveColors(entry.state)
                    return (
                      <div key={entry.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                        <div className="flex gap-1">
                          <span className="w-4 h-4 rounded" style={{ backgroundColor: c.rack }} />
                          <span className="w-4 h-4 rounded" style={{ backgroundColor: c.cable }} />
                        </div>
                        <span className="text-sm flex-1 truncate">{entry.name}</span>
                        <button
                          onClick={() => handleLoadSaved(entry)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteSaved(entry.id)}
                          className="text-xs text-gray-600 hover:text-red-400 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Reference table */}
            <div className="border-t border-gray-800 pt-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Reference</h2>
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr className="text-gray-500 text-left text-xs uppercase tracking-wider">
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Server</th>
                    <th className="pb-2 pr-4">Rack</th>
                    <th className="pb-2">Cable</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {Object.values(SERVER_PRESETS).map((t) => (
                    <tr key={t.label} className="border-t border-gray-800">
                      <td className="py-2 pr-4 font-medium">{t.label}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        <span className="inline-block w-3 h-3 rounded mr-1.5 align-middle" style={{ backgroundColor: t.server }} />
                        {t.server.toUpperCase()}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        <span className="inline-block w-3 h-3 rounded mr-1.5 align-middle" style={{ backgroundColor: t.rack }} />
                        {t.rack.toUpperCase()}
                      </td>
                      <td className="py-2 font-mono text-xs">
                        <span className="inline-block w-3 h-3 rounded mr-1.5 align-middle" style={{ backgroundColor: t.cable }} />
                        {t.cable.toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
