import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'
import { RackPreview, CablePreview } from './RackViewer'

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

function randomRackColor() {
  const h = Math.random() * 360
  const s = 70 + Math.random() * 30
  const l = 40 + Math.random() * 20
  return hslToHex(h, s, l)
}

function randomCableColor() {
  const h = Math.random() * 360
  const s = 60 + Math.random() * 40
  const l = 25 + Math.random() * 35
  return hslToHex(h, s, l)
}

function textColor(hex) {
  const [, , l] = hexToHsl(hex)
  return l > 55 ? '#000000' : '#ffffff'
}

function textColorMuted(hex) {
  const [, , l] = hexToHsl(hex)
  return l > 55 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)'
}

// --- localStorage ---
const STORAGE_KEY = 'dc-tools-cable-palettes'

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function persistSaved(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// --- Encode / decode for URL sharing ---
function encodePalette(rack, cables) {
  return `${rack.color.slice(1)}${rack.locked ? '!' : ''}-${cables.map(c => `${c.color.slice(1)}${c.locked ? '!' : ''}`).join('-')}`
}

function decodePalette(str) {
  if (!str) return null
  const parts = str.split('-')
  if (parts.length < 2) return null
  const parseSlot = (s) => {
    const locked = s.endsWith('!')
    const hex = locked ? s.slice(0, -1) : s
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
    return { color: `#${hex}`, locked }
  }
  const rack = parseSlot(parts[0])
  if (!rack) return null
  const cables = parts.slice(1).map(parseSlot).filter(Boolean)
  if (cables.length < 1 || cables.length > 6) return null
  return { rack, cables }
}

// --- SVG Icons ---
function LockIcon({ locked, color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {locked ? (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </>
      )}
    </svg>
  )
}

function PlusIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function TrashIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function ShuffleIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  )
}

function CopyIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

// --- Color Slab ---
function ColorSlab({ label, color, locked, onToggleLock, onRandomize, onColorChange, onRemove, canRemove, slabType }) {
  const fg = textColor(color)
  const fgMuted = textColorMuted(color)
  const [copied, setCopied] = useState(false)

  const copyHex = () => {
    navigator.clipboard.writeText(color.toUpperCase())
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative group transition-all" style={{ backgroundColor: color, minWidth: 0 }}>
      {/* Label */}
      <p className="text-xs font-semibold uppercase tracking-widest mb-2 select-none" style={{ color: fgMuted }}>{label}</p>

      {/* 3D Model preview */}
      <div className="w-full max-w-48 mb-3">
        {slabType === 'rack' ? (
          <RackPreview color={color} height="200px" className="rounded-lg" />
        ) : (
          <CablePreview color={color} height="200px" className="rounded-lg" />
        )}
      </div>

      {/* Hex value */}
      <button
        onClick={copyHex}
        className="text-xl sm:text-2xl font-bold font-mono tracking-wider cursor-pointer hover:opacity-80 transition-opacity mb-3 select-none"
        style={{ color: fg }}
        title="Copy hex"
      >
        {copied ? 'Copied!' : color.toUpperCase().slice(1)}
      </button>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleLock}
          className="p-2 rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
          title={locked ? 'Unlock' : 'Lock'}
        >
          <LockIcon locked={locked} color={fg} />
        </button>
        <button
          onClick={onRandomize}
          className="p-2 rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
          title="Randomize this color"
        >
          <ShuffleIcon color={fg} />
        </button>
        <label className="p-2 rounded-lg hover:bg-black/10 transition-colors cursor-pointer relative" title="Pick color">
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <CopyIcon color={fg} />
        </label>
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-2 rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
            title="Remove"
          >
            <TrashIcon color={fg} />
          </button>
        )}
      </div>
    </div>
  )
}

// --- Main Page ---
export default function CableGenerator() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [saved, setSaved] = useState(loadSaved)
  const [saveName, setSaveName] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  // Init state from URL or defaults
  const [rack, setRack] = useState(() => {
    const decoded = decodePalette(searchParams.get('p'))
    return decoded ? decoded.rack : { color: randomRackColor(), locked: false }
  })
  const [cables, setCables] = useState(() => {
    const decoded = decodePalette(searchParams.get('p'))
    return decoded ? decoded.cables : [
      { color: randomCableColor(), locked: false },
      { color: randomCableColor(), locked: false },
    ]
  })

  // --- Randomize all unlocked ---
  const randomizeAll = useCallback(() => {
    setRack(prev => prev.locked ? prev : { ...prev, color: randomRackColor() })
    setCables(prev => prev.map(c => c.locked ? c : { ...c, color: randomCableColor() }))
  }, [])

  // Spacebar to randomize
  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        randomizeAll()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [randomizeAll])

  // --- Cable slot actions ---
  const updateCable = (i, patch) => {
    setCables(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  }

  const removeCable = (i) => {
    if (cables.length <= 1) return
    setCables(prev => prev.filter((_, idx) => idx !== i))
  }

  const addCable = () => {
    if (cables.length >= 6) return
    setCables(prev => [...prev, { color: randomCableColor(), locked: false }])
  }

  // --- Share ---
  const shareUrl = (() => {
    const base = window.location.origin + window.location.pathname
    return `${base}#/tools/cable-generator?p=${encodePalette(rack, cables)}`
  })()

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setSearchParams({ p: encodePalette(rack, cables) }, { replace: true })
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1500)
  }

  // --- Export ---
  const handleExport = () => {
    const lines = [
      `Rack:    ${rack.color.toUpperCase()}`,
      ...cables.map((c, i) => `Cable ${String.fromCharCode(65 + i)}: ${c.color.toUpperCase()}`),
    ]
    navigator.clipboard.writeText(lines.join('\n'))
  }

  // --- Save ---
  const handleSave = () => {
    const name = saveName.trim() || `Palette ${saved.length + 1}`
    const entry = { name, rack: { ...rack }, cables: cables.map(c => ({ ...c })), id: Date.now() }
    const next = [...saved, entry]
    setSaved(next)
    persistSaved(next)
    setSaveName('')
  }

  const handleDeleteSaved = (id) => {
    const next = saved.filter(s => s.id !== id)
    setSaved(next)
    persistSaved(next)
  }

  const handleLoadSaved = (entry) => {
    setRack({ ...entry.rack })
    setCables(entry.cables.map(c => ({ ...c })))
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <Navbar />

      {/* Toolbar */}
      <div className="border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm sticky top-16 z-40 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <a href="#/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">&larr; Back</a>
          <span className="text-gray-700">|</span>
          <h1 className="text-sm font-semibold">Cable Palette Generator</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600 hidden sm:inline">Press Space to generate</span>
          <button
            onClick={randomizeAll}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ShuffleIcon color="#fff" /> Generate
          </button>
          {cables.length < 6 && (
            <button
              onClick={addCable}
              className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="Add cable color (max 6)"
            >
              <PlusIcon color="currentColor" /> Cable
            </button>
          )}
          <button
            onClick={handleExport}
            className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Copy All
          </button>
          <button
            onClick={copyLink}
            className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            {linkCopied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {/* Color slabs */}
      <main className="flex-1">
      <div className="flex flex-col sm:flex-row" style={{ minHeight: '480px' }}>
        {/* Rack */}
        <ColorSlab
          label="Rack"
          slabType="rack"
          color={rack.color}
          locked={rack.locked}
          onToggleLock={() => setRack(prev => ({ ...prev, locked: !prev.locked }))}
          onRandomize={() => setRack(prev => prev.locked ? prev : { ...prev, color: randomRackColor() })}
          onColorChange={(hex) => setRack(prev => ({ ...prev, color: hex }))}
          canRemove={false}
        />

        {/* Cables */}
        {cables.map((cable, i) => (
          <ColorSlab
            key={i}
            label={`Cable ${String.fromCharCode(65 + i)}`}
            slabType="cable"
            color={cable.color}
            locked={cable.locked}
            onToggleLock={() => updateCable(i, { locked: !cable.locked })}
            onRandomize={() => updateCable(i, cable.locked ? {} : { color: randomCableColor() })}
            onColorChange={(hex) => updateCable(i, { color: hex })}
            onRemove={() => removeCable(i)}
            canRemove={cables.length > 1}
          />
        ))}
      </div>

      {/* Save & Saved Presets */}
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Save Preset</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Palette name…"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              className="bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>

        {saved.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Saved Presets</h2>
            <div className="space-y-2">
              {saved.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                  <div className="flex gap-1 shrink-0">
                    <span className="w-5 h-5 rounded" style={{ backgroundColor: entry.rack.color }} title="Rack" />
                    {entry.cables.map((c, i) => (
                      <span key={i} className="w-5 h-5 rounded" style={{ backgroundColor: c.color }} title={`Cable ${String.fromCharCode(65 + i)}`} />
                    ))}
                  </div>
                  <span className="text-sm flex-1 truncate">{entry.name}</span>
                  <button onClick={() => handleLoadSaved(entry)} className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer">Load</button>
                  <button onClick={() => handleDeleteSaved(entry.id)} className="text-xs text-gray-600 hover:text-red-400 cursor-pointer">Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </main>

      <Footer />
    </div>
  )
}
