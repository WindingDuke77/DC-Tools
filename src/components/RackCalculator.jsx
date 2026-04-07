import { useState, useMemo } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'

// --- Constants ---
const RACK_U = 47
const SWITCH_U = 1
const AVAILABLE_U = RACK_U - SWITCH_U // 46
const IOPS_7U = 12000
const IOPS_3U = 5000
const THROUGHPUT_PER_RACK = 3.85 // Gb
const BIG_SWITCH_PORTS = 16
const BIG_SWITCH_UPLINKS = '4 × 40 Gb'
const BIG_SWITCH_THROUGHPUT_GB = 40 * 4 // 160 Gb
const CORE_SWITCH_PORTS = 24
const CORE_SWITCH_THROUGHPUT_GB = 40 * 24 // 960 Gb

const PROCESSOR_TYPES = [
  { key: 'system', label: 'System', emoji: '🟡' },
  { key: 'risc', label: 'RISC', emoji: '🔵' },
  { key: 'mainframe', label: 'Mainframe', emoji: '🟣' },
  { key: 'gpu', label: 'GPU', emoji: '🟢' },
]

// --- Calculation helpers ---

/** Pack servers into 47 U racks (1 U reserved for a ToR switch per rack).
 *  Prioritise 7 U servers, then fill remaining space with 3 U to minimise
 *  empty rack units. */
function packRacks(requiredIOPS) {
  if (requiredIOPS <= 0) return { racks: [], total7u: 0, total3u: 0, totalIOPS: 0 }

  const racks = []
  let remaining = requiredIOPS

  while (remaining > 0) {
    let usedU = 0
    let s7u = 0
    let s3u = 0

    // 1. Meet IOPS demand with 7 U servers first
    while (remaining > 0 && usedU + 7 <= AVAILABLE_U) {
      s7u++
      usedU += 7
      remaining -= IOPS_7U
    }

    // 2. If still short, add 3 U servers
    while (remaining > 0 && usedU + 3 <= AVAILABLE_U) {
      s3u++
      usedU += 3
      remaining -= IOPS_3U
    }

    // 3. Minimise empty space — fill leftover U with 7 U then 3 U
    while (usedU + 7 <= AVAILABLE_U) {
      s7u++
      usedU += 7
    }
    while (usedU + 3 <= AVAILABLE_U) {
      s3u++
      usedU += 3
    }

    racks.push({
      servers7u: s7u,
      servers3u: s3u,
      usedU: usedU + SWITCH_U,
      emptyU: RACK_U - usedU - SWITCH_U,
      iops: s7u * IOPS_7U + s3u * IOPS_3U,
    })
  }

  const total7u = racks.reduce((sum, r) => sum + r.servers7u, 0)
  const total3u = racks.reduce((sum, r) => sum + r.servers3u, 0)
  return { racks, total7u, total3u, totalIOPS: total7u * IOPS_7U + total3u * IOPS_3U }
}

function calculateSwitches(totalRacks) {
  if (totalRacks === 0) return { normal: 0, big: 0, core: 0, throughputGb: 0 }
  const normal = totalRacks
  const big = Math.ceil(normal / BIG_SWITCH_PORTS)
  const core = Math.ceil(big / CORE_SWITCH_PORTS)
  return { normal, big, core, throughputGb: +(totalRacks * THROUGHPUT_PER_RACK).toFixed(2) }
}

// --- Tiny rack SVG showing the U layout of a single rack ---
function RackDiagram({ rack }) {
  const cellH = 5
  const width = 56
  const totalCells = RACK_U
  const height = totalCells * cellH + 2

  // Build ordered list of cells top→bottom
  const cells = []
  // Switch at top
  for (let i = 0; i < SWITCH_U; i++) cells.push('switch')
  // 7 U servers
  for (let s = 0; s < rack.servers7u; s++) for (let i = 0; i < 7; i++) cells.push(i === 0 ? '7u-start' : '7u')
  // 3 U servers
  for (let s = 0; s < rack.servers3u; s++) for (let i = 0; i < 3; i++) cells.push(i === 0 ? '3u-start' : '3u')
  // Empty
  while (cells.length < totalCells) cells.push('empty')

  const fill = (type) => {
    if (type === 'switch') return '#6366f1'
    if (type === '7u-start' || type === '7u') return '#3b82f6'
    if (type === '3u-start' || type === '3u') return '#22d3ee'
    return '#1f2937'
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-14 h-auto" role="img" aria-label="Rack layout diagram">
      <rect x="0" y="0" width={width} height={height} rx="2" fill="#111827" stroke="#374151" strokeWidth="1" />
      {cells.map((type, i) => (
        <rect key={i} x="2" y={1 + i * cellH} width={width - 4} height={cellH - 0.5} rx="0.5" fill={fill(type)} />
      ))}
    </svg>
  )
}

// --- Main component ---
export default function RackCalculator() {
  const [inputs, setInputs] = useState({ system: '', risc: '', mainframe: '', gpu: '' })

  const handleChange = (key, value) => {
    setInputs((prev) => ({ ...prev, [key]: value.replace(/[^0-9]/g, '') }))
  }

  const results = useMemo(() => {
    const perType = {}
    let grandTotalRacks = 0

    for (const type of PROCESSOR_TYPES) {
      const iops = parseInt(inputs[type.key]) || 0
      const r = packRacks(iops)
      perType[type.key] = r
      grandTotalRacks += r.racks.length
    }

    const switches = calculateSwitches(grandTotalRacks)
    return { perType, grandTotalRacks, switches }
  }, [inputs])

  const hasInput = Object.values(inputs).some((v) => parseInt(v) > 0)

  const grand7u = PROCESSOR_TYPES.reduce((s, t) => s + results.perType[t.key].total7u, 0)
  const grand3u = PROCESSOR_TYPES.reduce((s, t) => s + results.perType[t.key].total3u, 0)
  const grandIOPS = PROCESSOR_TYPES.reduce((s, t) => s + results.perType[t.key].totalIOPS, 0)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {/* Back link */}
        <div className="mb-8">
          <a href="#/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">&larr; Back to Tools</a>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Rack Calculator</h1>
        <p className="text-gray-400 mb-10">
          Enter your IOPS requirements per processor type and see how many racks, servers, and switches you need.
        </p>

        {/* ── Inputs ────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Required IOPS</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PROCESSOR_TYPES.map((type) => (
              <div key={type.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <span>{type.emoji}</span>
                  <span>{type.label}</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={inputs[type.key]}
                  onChange={(e) => handleChange(type.key, e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <p className="text-xs text-gray-600 mt-1">IOPS</p>
              </div>
            ))}
          </div>
        </section>

        {hasInput && (
          <div className="space-y-12">
            {/* ── Per-type breakdown ────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Breakdown by Processor</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {PROCESSOR_TYPES.map((type) => {
                  const iops = parseInt(inputs[type.key]) || 0
                  if (iops <= 0) return null
                  const r = results.perType[type.key]
                  return (
                    <div key={type.key} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{type.emoji}</span>
                        <h3 className="font-semibold">{type.label}</h3>
                        <span className="text-xs text-gray-500 ml-auto">{iops.toLocaleString()} IOPS required</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="bg-gray-800/50 rounded-lg p-3">
                          <p className="text-2xl font-bold">{r.racks.length}</p>
                          <p className="text-xs text-gray-500">{r.racks.length === 1 ? 'Rack' : 'Racks'}</p>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3">
                          <p className="text-2xl font-bold">{r.total7u}</p>
                          <p className="text-xs text-gray-500">7U Servers</p>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-3">
                          <p className="text-2xl font-bold">{r.total3u}</p>
                          <p className="text-xs text-gray-500">3U Servers</p>
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-gray-500">
                        Capacity: {r.totalIOPS.toLocaleString()} IOPS
                        <span className="text-gray-600"> · </span>
                        Headroom: +{(r.totalIOPS - iops).toLocaleString()} IOPS
                      </p>

                      {/* Rack layout chips + mini diagrams */}
                      <div className="mt-3 border-t border-gray-800 pt-3">
                        <p className="text-xs text-gray-500 mb-2">Rack layouts:</p>
                        <div className="flex flex-wrap gap-3">
                          {r.racks.map((rack, i) => (
                            <div key={i} className="flex items-end gap-1.5">
                              <RackDiagram rack={rack} />
                              <span className="text-xs text-gray-400 leading-tight">
                                {rack.servers7u}×7U<br />{rack.servers3u}×3U
                                {rack.emptyU > 0 && <><br /><span className="text-gray-600">{rack.emptyU}U free</span></>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* ── Grand totals ─────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Totals</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                  <p className="text-3xl font-bold">{results.grandTotalRacks}</p>
                  <p className="text-sm text-gray-400 mt-1">Racks</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                  <p className="text-3xl font-bold">{grand7u}</p>
                  <p className="text-sm text-gray-400 mt-1">7U Servers</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                  <p className="text-3xl font-bold">{grand3u}</p>
                  <p className="text-sm text-gray-400 mt-1">3U Servers</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                  <p className="text-3xl font-bold">{grandIOPS.toLocaleString()}</p>
                  <p className="text-sm text-gray-400 mt-1">Total IOPS</p>
                </div>
              </div>
            </section>

            {/* ── Switch hierarchy ─────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Switch Hierarchy</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex flex-col gap-4">
                  {/* Core */}
                  {results.switches.core > 0 && (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center justify-center shrink-0 text-lg">🔴</div>
                        <div>
                          <p className="font-semibold">{results.switches.core} × Core Switch{results.switches.core !== 1 ? 'es' : ''}</p>
                          <p className="text-xs text-gray-500">{CORE_SWITCH_PORTS} × 40 Gb ports ({CORE_SWITCH_THROUGHPUT_GB} Gb) · Feeds aggregation switches</p>
                        </div>
                      </div>
                      <div className="ml-6 border-l-2 border-gray-700 h-4" />
                    </>
                  )}
                  {/* Aggregation */}
                  {results.switches.big > 0 && (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-orange-500/20 border border-orange-500/50 rounded-lg flex items-center justify-center shrink-0 text-lg">🟠</div>
                        <div>
                          <p className="font-semibold">{results.switches.big} × Aggregation Switch{results.switches.big !== 1 ? 'es' : ''}</p>
                          <p className="text-xs text-gray-500">Handles {BIG_SWITCH_PORTS} ToR switches · {BIG_SWITCH_UPLINKS} uplinks ({BIG_SWITCH_THROUGHPUT_GB} Gb)</p>
                        </div>
                      </div>
                      <div className="ml-6 border-l-2 border-gray-700 h-4" />
                    </>
                  )}
                  {/* ToR */}
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-500/20 border border-gray-600/50 rounded-lg flex items-center justify-center shrink-0 text-lg">⬜</div>
                    <div>
                      <p className="font-semibold">{results.switches.normal} × ToR Switch{results.switches.normal !== 1 ? 'es' : ''}</p>
                      <p className="text-xs text-gray-500">1 per rack · {THROUGHPUT_PER_RACK} Gb throughput each</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-800 text-sm text-gray-400">
                  Total throughput: {results.switches.throughputGb} Gb
                </div>
              </div>
            </section>

            {/* ── Reference table ──────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Reference</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      <th className="px-4 py-3 text-gray-400 font-medium">Spec</th>
                      <th className="px-4 py-3 text-gray-400 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr><td className="px-4 py-2 text-gray-300">Rack size</td><td className="px-4 py-2">{RACK_U}U</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">3U server</td><td className="px-4 py-2">{IOPS_3U.toLocaleString()} IOPS</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">7U server</td><td className="px-4 py-2">{IOPS_7U.toLocaleString()} IOPS</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Optimal rack</td><td className="px-4 py-2">6 × 7U + 1 × 3U + 1 switch = 77,000 IOPS</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Throughput per rack</td><td className="px-4 py-2">{THROUGHPUT_PER_RACK} Gb</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">ToR switch</td><td className="px-4 py-2">1 per rack ({SWITCH_U}U)</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Aggregation switch</td><td className="px-4 py-2">{BIG_SWITCH_PORTS} ToR switches · {BIG_SWITCH_UPLINKS} uplinks</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Core switch</td><td className="px-4 py-2">{CORE_SWITCH_PORTS} × 40 Gb ports · Feeds aggregation switches</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
