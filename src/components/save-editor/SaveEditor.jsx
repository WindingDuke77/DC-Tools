import { useState, useCallback, useRef } from 'react'
import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'
import { parseSave, modifySave, formatNumber, PRESETS } from './saveParser'

const SAVE_DIR_WINDOWS = String.raw`%APPDATA%\..\LocalLow\Waseku\Data Center\saves`
const SAVE_DIR_LINUX = '~/.config/unity3d/Waseku/Data Center/saves'

function NumberInput({ label, value, onChange, icon }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{icon} {label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 tabular-nums"
      />
    </div>
  )
}

function ToggleButton({ label, enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${
        enabled
          ? 'bg-green-900/30 border-green-700 text-green-400'
          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
      }`}
    >
      <span className={`inline-block w-3 h-3 rounded-full ${enabled ? 'bg-green-400' : 'bg-gray-600'}`} />
      {label}
    </button>
  )
}

export default function SaveEditor() {
  const [parsed, setParsed] = useState(null)
  const [coins, setCoins] = useState(0)
  const [xp, setXp] = useState(0)
  const [reputation, setReputation] = useState(0)
  const [wallPrice, setWallPrice] = useState(0)
  const [shopUnlocked, setShopUnlocked] = useState(true)
  const [wallsOpened, setWallsOpened] = useState(false)
  const [tutorialsComplete, setTutorialsComplete] = useState(false)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(null)
  const [showExample, setShowExample] = useState(false)
  const fileRef = useRef(null)

  // Track original values so we know what changed
  const [origValues, setOrigValues] = useState(null)

  const loadFile = useCallback(async (file) => {
    try {
      setError(null)
      const arrayBuffer = await file.arrayBuffer()
      const result = parseSave(arrayBuffer)
      setParsed(result)
      setCoins(Math.round(result.coins))
      setXp(Math.round(result.xp))
      setReputation(Math.round(result.reputation))
      setWallPrice(Math.round(result.wallPrice))
      setShopUnlocked(result.shopItems.length > 0 && result.shopItems.every(s => s.unlocked))
      setWallsOpened(result.wallsTotal > 0 && result.wallsOpened === result.wallsTotal)
      setTutorialsComplete(result.activeObjectives === 0)
      setFileName(file.name)
      setOrigValues({
        coins: Math.round(result.coins),
        xp: Math.round(result.xp),
        reputation: Math.round(result.reputation),
        wallPrice: Math.round(result.wallPrice),
        shopUnlocked: result.shopItems.length > 0 && result.shopItems.every(s => s.unlocked),
        wallsOpened: result.wallsTotal > 0 && result.wallsOpened === result.wallsTotal,
        tutorialsComplete: result.activeObjectives === 0,
      })
    } catch (e) {
      setError('Failed to parse save file: ' + e.message)
      setParsed(null)
    }
  }, [])

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0]
    if (file && file.name.endsWith('.save')) loadFile(file)
    else setError('Please select a .save file')
  }, [loadFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    const saveFile = files.find(f => f.name.endsWith('.save'))
    if (saveFile) loadFile(saveFile)
    else setError('Please drop a .save file')
  }, [loadFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const copyPath = useCallback((path) => {
    navigator.clipboard.writeText(path)
    setCopied(path)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  const applyPreset = useCallback((key) => {
    const preset = PRESETS[key]
    if (preset.coins != null) setCoins(preset.coins)
    if (preset.xp != null) setXp(preset.xp)
    if (preset.reputation != null) setReputation(preset.reputation)
    if (preset.unlockAll) setShopUnlocked(true)
    if (preset.lockAll) setShopUnlocked(false)
    if (preset.openAllWalls) setWallsOpened(true)
    if (preset.closeAllWalls) setWallsOpened(false)
    if (preset.completeTutorials) setTutorialsComplete(true)
  }, [])

  const loadBaseSave = useCallback(async () => {
    try {
      setError(null)
      const resp = await fetch(`${import.meta.env.BASE_URL}base.save`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const ab = await resp.arrayBuffer()
      const file = new File([ab], 'base.save', { type: 'application/octet-stream' })
      loadFile(file)
    } catch (e) {
      setError('Failed to load base save: ' + e.message)
    }
  }, [loadFile])

  const downloadModified = useCallback(() => {
    if (!parsed) return
    const changes = { coins, xp, reputation, wallPrice }

    // Shop items
    if (shopUnlocked !== origValues.shopUnlocked) {
      if (shopUnlocked) changes.unlockAll = true
      else changes.lockAll = true
    }

    // Walls
    if (wallsOpened !== origValues.wallsOpened) {
      if (wallsOpened) changes.openAllWalls = true
      else changes.closeAllWalls = true
    }

    // Tutorial objectives — only support clearing them, not re-adding
    if (tutorialsComplete && !origValues.tutorialsComplete) {
      changes.completeTutorials = true
    }

    const modified = modifySave(parsed, changes)
    const blob = new Blob([modified], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName ? fileName.replace(/\.save$/, '_modified.save') : 'modified.save'
    a.click()
    URL.revokeObjectURL(url)
  }, [parsed, coins, xp, reputation, wallPrice, shopUnlocked, wallsOpened, tutorialsComplete, origValues, fileName])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Save Editor</h1>
          <p className="text-gray-400">
            Edit your Data Center save files — modify money, XP, reputation, walls, and shop unlocks.
          </p>
        </div>

        {/* How to use / Example toggle */}
        <div className="mb-6">
          <button
            onClick={() => setShowExample(!showExample)}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
          >
            {showExample ? '- Hide' : '+'} How to Use & Example
          </button>
          {showExample && (
            <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm space-y-4">
              <div>
                <h3 className="font-semibold text-gray-200 mb-2">Save File Location</h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Windows:</span>
                    <button onClick={() => copyPath(SAVE_DIR_WINDOWS)} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded cursor-pointer transition-colors">
                      {copied === SAVE_DIR_WINDOWS ? 'Copied!' : SAVE_DIR_WINDOWS}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Linux:</span>
                    <button onClick={() => copyPath(SAVE_DIR_LINUX)} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded cursor-pointer transition-colors">
                      {copied === SAVE_DIR_LINUX ? 'Copied!' : SAVE_DIR_LINUX}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-200 mb-2">Steps</h3>
                <ol className="list-decimal list-inside space-y-1 text-gray-300">
                  <li>Close the game or save before editing</li>
                  <li>Navigate to the saves folder above</li>
                  <li>Drag your <code className="text-xs bg-gray-800 px-1 rounded">.save</code> file into the drop zone below</li>
                  <li>Edit values or pick a preset</li>
                  <li>Click <strong>Download Modified Save</strong></li>
                  <li>Replace the original file in the saves folder</li>
                  <li>Launch the game and load the save</li>
                </ol>
              </div>
              <div>
                <h3 className="font-semibold text-gray-200 mb-2">Example</h3>
                <p className="text-gray-400 mb-2">
                  Want a fresh start with everything accessible? Pick the <strong className="text-gray-200">Starter Boost</strong> preset:
                  sets your money to $30,000 and unlocks all shop items so you can build freely from the start.
                </p>
                <p className="text-gray-400 mb-2">
                  For late-game testing, use <strong className="text-gray-200">Endgame</strong>: $10M money, 5M XP, 500K reputation,
                  all items unlocked, and every wall opened.
                </p>
                <p className="text-gray-400">
                  Use <strong className="text-gray-200">Full Unlock</strong> to unlock all shop items and open all walls
                  without touching your money or XP. Or <strong className="text-gray-200">Open All Walls</strong> to just expand your data center.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-200 mb-2">Tips</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-300">
                  <li>Always back up your save files before editing</li>
                  <li>Money, XP, and reputation are stored as floats — very large values may lose precision</li>
                  <li>The editor only modifies the values you change; everything else stays intact</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".save"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-4xl mb-2">
            {parsed ? '\u2705' : '\uD83D\uDCBE'}
          </div>
          {parsed ? (
            <p className="text-gray-300">
              Loaded: <strong>{parsed.saveName || fileName}</strong>
              <span className="text-gray-500 text-sm ml-2">({fileName})</span>
            </p>
          ) : (
            <>
              <p className="text-gray-300 font-medium">Drop your .save file here</p>
              <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            </>
          )}
        </div>

        {!parsed && (
          <div className="text-center mb-6 -mt-2">
            <span className="text-gray-500 text-sm">Don't have a save file? </span>
            <button
              onClick={(e) => { e.stopPropagation(); loadBaseSave() }}
              className="text-sm text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline transition-colors"
            >
              Start from a base save
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-6 text-red-300 text-sm">
            {error}
          </div>
        )}

        {parsed && (
          <>
            {/* Stats summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-yellow-400">${formatNumber(coins)}</div>
                <div className="text-xs text-gray-500 mt-1">Money</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">{formatNumber(xp)}</div>
                <div className="text-xs text-gray-500 mt-1">XP</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{formatNumber(reputation)}</div>
                <div className="text-xs text-gray-500 mt-1">Reputation</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {parsed.wallsTotal > 0
                    ? (wallsOpened ? parsed.wallsTotal : parsed.wallsOpened) + '/' + parsed.wallsTotal
                    : 'N/A'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Walls Open</div>
              </div>
            </div>

            {/* Presets */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
              <h2 className="text-lg font-semibold mb-3">Presets</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-indigo-500/50 rounded-lg px-3 py-2 text-left transition-colors"
                  >
                    <div className="text-sm font-medium">{preset.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Value editors */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
              <h2 className="text-lg font-semibold mb-3">Player Data</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <NumberInput label="Money" value={coins} onChange={setCoins} icon="$" />
                <NumberInput label="XP" value={xp} onChange={setXp} icon={'\u2B50'} />
                <NumberInput label="Reputation" value={reputation} onChange={setReputation} icon={'\u2B50'} />
                <NumberInput label="Wall Price" value={wallPrice} onChange={setWallPrice} icon={'\uD83E\uDDF1'} />
              </div>
            </div>

            {/* Toggles */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
              <h2 className="text-lg font-semibold mb-3">Toggles</h2>
              <div className="flex flex-wrap gap-3">
                <ToggleButton
                  label={`Shop Items ${shopUnlocked ? 'Unlocked' : 'Locked'} (${parsed.shopItems.length})`}
                  enabled={shopUnlocked}
                  onToggle={() => setShopUnlocked(!shopUnlocked)}
                />
                <ToggleButton
                  label={`Walls ${wallsOpened ? 'Opened' : 'Closed'} (${parsed.wallsTotal})`}
                  enabled={wallsOpened}
                  onToggle={() => setWallsOpened(!wallsOpened)}
                />
                <ToggleButton
                  label={tutorialsComplete
                    ? 'Tutorials Complete'
                    : `Tutorials Active (${parsed.activeObjectives})`}
                  enabled={tutorialsComplete}
                  onToggle={() => setTutorialsComplete(!tutorialsComplete)}
                />
              </div>
              {tutorialsComplete && !origValues.tutorialsComplete && (
                <p className="text-xs text-gray-500 mt-2">
                  Tutorial objectives will be cleared on save. Note: this is one-way — toggling off does not restore them.
                </p>
              )}
            </div>

            {/* Download */}
            <div className="flex justify-center">
              <button
                onClick={downloadModified}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-semibold text-lg transition-colors"
              >
                Download Modified Save
              </button>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  )
}
