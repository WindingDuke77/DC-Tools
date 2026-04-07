import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'

// ═══════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════
const RACK_TOTAL_U = 47
const SWITCH_RESERVED_U = 1
const AVAILABLE_U = RACK_TOTAL_U - SWITCH_RESERVED_U // 46
const CORE_SWITCH_U = 1
const AGG_SWITCH_U = 1

const SERVER_TYPES = [
  { key: 'system', label: 'System X', color: '#eab308', emoji: '🟡' },
  { key: 'risc', label: 'RISC', color: '#3b82f6', emoji: '🔵' },
  { key: 'mainframe', label: 'Mainframe', color: '#a855f7', emoji: '🟣' },
  { key: 'gpu', label: 'GPU', color: '#22c55e', emoji: '🟢' },
]

const TOR_PORTS = 16
const AGG_SFP_PORTS = 16
const AGG_QSFP_PORTS = 4
const CORE_QSFP_PORTS = 32
const QSFP_SPEED = 40

const GATEWAY_TYPES = [
  { key: 'small', label: 'Small Gateway', desc: '2 SFP + 2 Ethernet', maxUplinks: 2, corePortType: 'sfp' },
  { key: 'medium', label: 'Medium Gateway', desc: '16 SFP + 4 QSFP', maxUplinks: 4, corePortType: 'qsfp' },
  { key: 'large', label: 'Large Gateway', desc: '32 QSFP', maxUplinks: 32, corePortType: 'qsfp' },
]

const SFP_MODULE_OPTIONS = [
  { key: 'sfp_10g_smf', label: '10Gb Single Mode Fibre', speed: 10 },
  { key: 'sfp_25g_smf', label: '25Gb Single Mode Fibre', speed: 25 },
  { key: 'sfp_10g_eth', label: '10Gb Ethernet', speed: 10 },
]

const MODULE_PACK_SIZE = 5

// ═══════════════════════════════════════════════
//  In-game Prices
// ═══════════════════════════════════════════════
const SERVER_PRICES = {
  system: { '3u': 400, '7u': 1600 },
  risc:   { '3u': 450, '7u': 1750 },
  mainframe: { '3u': 850, '7u': 2000 },
  gpu:    { '3u': 550, '7u': 2200 },
}
const SWITCH_PRICES = {
  tor: 250,   // 16 x 10Gbps RJ45
  core: 3800, // 32 x QSFP+
  agg: 3500,  // 4 x QSFP+ 16 x SFP+/SFP28
}
const RACK_PRICE = 1250
const GATEWAY_PRICES = { small: 0, medium: 0, large: 0 }
const MODULE_PRICES = {
  sfp_pack: 250,  // 5x SFP+ Modules RJ45 10Gbps
  qsfp_pack: 500, // 5x QSFP+ Module Fiber (estimated)
}

// ═══════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════
const num = (v) => Math.max(0, parseInt(v) || 0)
const ceilToPack = (n) => Math.ceil(n / MODULE_PACK_SIZE) * MODULE_PACK_SIZE
const getSfpSpeed = (key) => (SFP_MODULE_OPTIONS.find(m => m.key === key)?.speed ?? 10)

// Standard rack pattern: 1 ToR (2U) + 6×7U (42U) + 1×3U (3U) = 47U
const RACK_7U_PER = 6
const RACK_3U_PER = 1

function buildRack(servers, typeLabel, torU = SWITCH_RESERVED_U) {
  const c7 = servers.filter(s => s.size === 7).length
  const c3 = servers.filter(s => s.size === 3).length
  const usedU = torU + c7 * 7 + c3 * 3
  return {
    label: typeLabel, servers, count7u: c7, count3u: c3,
    totalServers: servers.length, usedU, freeU: RACK_TOTAL_U - usedU,
    torCount: 0, torU, coreSwitches: 0, aggSwitches: 0,
  }
}

// ═══════════════════════════════════════════════
//  Topology Diagram (SVG) — individual devices
// ═══════════════════════════════════════════════
function TopologyDiagram({ data }) {
  const { columns, edges, lagLabels } = data
  if (!columns || columns.length === 0) return null

  const boxW = 90, boxH = 34, colGap = 120, vertGap = 8, padX = 20, padY = 44
  const maxNodes = Math.max(...columns.map(c => c.nodes.length), 1)
  const maxColH = maxNodes * boxH + (maxNodes - 1) * vertGap

  const nodePos = {}
  columns.forEach((col, ci) => {
    const n = col.nodes.length
    const colH = n * boxH + (n - 1) * vertGap
    const startY = padY + (maxColH - colH) / 2
    col.nodes.forEach((node, ni) => {
      nodePos[node.id] = { x: padX + ci * (boxW + colGap), y: startY + ni * (boxH + vertGap) }
    })
  })

  const svgW = padX * 2 + columns.length * boxW + (columns.length - 1) * colGap
  const svgH = padY + maxColH + 20

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minHeight: 180 }} role="img" aria-label="Network topology">
        {/* Column headers */}
        {columns.map((col, ci) => (
          <text key={col.key} x={padX + ci * (boxW + colGap) + boxW / 2} y={14}
            textAnchor="middle" fontSize="10" fontWeight="700" fill={col.color}
            style={{ fontFamily: 'system-ui, sans-serif' }}>{col.label}</text>
        ))}

        {/* Edges (curved) */}
        {edges.map((edge, i) => {
          const f = nodePos[edge.from], t = nodePos[edge.to]
          if (!f || !t) return null
          const x1 = f.x + boxW, y1 = f.y + boxH / 2, x2 = t.x, y2 = t.y + boxH / 2
          const dx = x2 - x1
          return (
            <path key={`e${i}`}
              d={`M${x1},${y1} C${x1 + dx * 0.4},${y1} ${x2 - dx * 0.4},${y2} ${x2},${y2}`}
              fill="none" stroke={edge.color ?? '#4b5563'} strokeWidth={1.5} opacity={0.3} />
          )
        })}

        {/* LAG labels between columns */}
        {lagLabels.map((lag, i) => {
          const gx = padX + i * (boxW + colGap) + boxW + colGap / 2
          const lw = Math.max(lag.label.length * 4.8 + 12, 60)
          return (
            <g key={`lag${i}`}>
              <rect x={gx - lw / 2} y={24} width={lw} height={14} rx={4}
                fill="#111827" stroke={lag.color} strokeWidth={0.7} />
              <text x={gx} y={33} textAnchor="middle" dominantBaseline="middle"
                fontSize="7" fontWeight="600" fill="#d1d5db"
                style={{ fontFamily: 'system-ui, sans-serif' }}>{lag.label}</text>
            </g>
          )
        })}

        {/* Nodes */}
        {columns.flatMap(col =>
          col.nodes.map(node => {
            const p = nodePos[node.id]
            return (
              <g key={node.id}>
                <rect x={p.x} y={p.y} width={boxW} height={boxH} rx={7}
                  fill={col.bg} stroke={col.color} strokeWidth={1.5} />
                <text x={p.x + boxW / 2} y={p.y + (node.sub ? 14 : boxH / 2 + 1)}
                  textAnchor="middle" fontSize="9" fontWeight="700" fill={col.color}
                  dominantBaseline={node.sub ? 'auto' : 'middle'}
                  style={{ fontFamily: 'system-ui, sans-serif' }}>{node.label}</text>
                {node.sub && (
                  <text x={p.x + boxW / 2} y={p.y + 26}
                    textAnchor="middle" fontSize="7" fill="#9ca3af"
                    style={{ fontFamily: 'system-ui, sans-serif' }}>{node.sub}</text>
                )}
              </g>
            )
          })
        )}
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Mini Rack Visualization
// ═══════════════════════════════════════════════
const SLOT_COLORS = { switch: '#6366f1', core: '#ef4444', agg: '#f97316', empty: '#111827' }

function MiniRack({ rack, index, isSelected, onClick }) {
  const uH = 5, w = 52, h = RACK_TOTAL_U * uH
  const slots = []
  if (rack.torCount > 0) slots.push({ u: rack.torU || SWITCH_RESERVED_U, color: SLOT_COLORS.switch })
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

function RackDetail({ rack, tors, index }) {
  const rows = []
  let u = 1
  if (rack.torCount > 0) {
    const torU = rack.torU || SWITCH_RESERVED_U
    rows.push({ from: u, to: u + torU - 1, label: `ToR Switch Space (${tors}\u00d7 ToR)`, color: SLOT_COLORS.switch })
    u += torU
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
        <span className="bg-gray-800 rounded px-2 py-1">{tors}&times; ToR</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════
// Convert raw IOPS into 7U + 3U server counts (maximise 7U first)
function iopsToServers(iops) {
  if (iops <= 0) return { count7u: 0, count3u: 0 }
  const count7u = Math.floor(iops / 12000)
  const remaining = iops - count7u * 12000
  const count3u = remaining > 0 ? Math.ceil(remaining / 5000) : 0
  return { count7u, count3u }
}

export default function RackCalculator() {
  // ── State ──
  const [iopsInputs, setIopsInputs] = useState({ gpu: '', risc: '', system: '', mainframe: '' })
  const [gatewayType, setGatewayType] = useState("small")
  const [fallbackEnabled, setFallbackEnabled] = useState(false)
  const [mixedRacks, setMixedRacks] = useState(false)
  const [dedicatedNetworkRack, setDedicatedNetworkRack] = useState(false)
  const [moduleTypes, setModuleTypes] = useState({ gwToCore: 'sfp_10g_smf' })

  const [selectedRack, setSelectedRack] = useState(null)
  const [savedOffers, setSavedOffers] = useState([])
  const [offerName, setOfferName] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [shareToast, setShareToast] = useState(false)

  // ── Offer helpers ──
  const OFFERS_KEY = 'dc-tools-offers'

  const getConfig = useCallback(() => ({
    iopsInputs, gatewayType, fallbackEnabled, mixedRacks, dedicatedNetworkRack, moduleTypes,
  }), [iopsInputs, gatewayType, fallbackEnabled, mixedRacks, dedicatedNetworkRack, moduleTypes])

  const applyConfig = useCallback((cfg) => {
    if (cfg.iopsInputs) setIopsInputs(cfg.iopsInputs)
    if (cfg.gatewayType !== undefined) setGatewayType(cfg.gatewayType)
    if (cfg.fallbackEnabled !== undefined) setFallbackEnabled(cfg.fallbackEnabled)
    if (cfg.mixedRacks !== undefined) setMixedRacks(cfg.mixedRacks)
    if (cfg.dedicatedNetworkRack !== undefined) setDedicatedNetworkRack(cfg.dedicatedNetworkRack)
    if (cfg.moduleTypes) setModuleTypes(cfg.moduleTypes)
    setSelectedRack(null)
  }, [])

  // Load saved offers from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OFFERS_KEY)
      if (raw) setSavedOffers(JSON.parse(raw))
    } catch { /* ignore corrupt data */ }
  }, [])

  // Init from ?cfg= URL param
  useEffect(() => {
    const cfgParam = searchParams.get('cfg')
    if (cfgParam) {
      try {
        const cfg = JSON.parse(atob(cfgParam))
        applyConfig(cfg)
      } catch { /* ignore bad data */ }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const persistOffers = (offers) => {
    setSavedOffers(offers)
    localStorage.setItem(OFFERS_KEY, JSON.stringify(offers))
  }

  const saveOffer = () => {
    const name = offerName.trim() || `Offer ${savedOffers.length + 1}`
    const offer = { name, config: getConfig(), savedAt: new Date().toISOString() }
    persistOffers([...savedOffers, offer])
    setOfferName('')
  }

  const loadOffer = (offer) => applyConfig(offer.config)

  const deleteOffer = (idx) => persistOffers(savedOffers.filter((_, i) => i !== idx))

  const shareUrl = useMemo(() => {
    const base = window.location.origin + window.location.pathname
    return `${base}#/tools/rack-calculator?cfg=${btoa(JSON.stringify(getConfig()))}`
  }, [getConfig])

  const shareConfig = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setSearchParams({ cfg: btoa(JSON.stringify(getConfig())) }, { replace: true })
      setShareToast(true)
      setTimeout(() => setShareToast(false), 2000)
    })
  }

  // ── Handlers ──
  const handleIOPS = (key, val) => setIopsInputs(p => ({ ...p, [key]: val.replace(/\D/g, '') }))

  // ═══════════════════════════════════════════════
  //  Calculations
  // ═══════════════════════════════════════════════
  const results = useMemo(() => {
    // Convert IOPS to server counts
    const servers = {}
    let totalServers = 0, total3u = 0, total7u = 0, totalIOPSRequested = 0
    for (const t of SERVER_TYPES) {
      const requested = num(iopsInputs[t.key])
      totalIOPSRequested += requested
      const { count7u: c7, count3u: c3 } = iopsToServers(requested)
      servers[t.key] = { count3u: c3, count7u: c7, total: c3 + c7, iopsRequested: requested }
      totalServers += c3 + c7
      total3u += c3
      total7u += c7
    }

    // Parse gateway
    const selectedGw = gatewayType ? GATEWAY_TYPES.find(g => g.key === gatewayType) : null
    const totalGateways = selectedGw ? 1 : 0

    if (totalServers === 0) return null

    // Required throughput from servers
    const totalBandwidth = total7u * 0.6 + total3u * 0.25

    // ── Link & redundancy model ──
    // Without fallback: auto-scale LAG links for throughput
    // With fallback: dual redundant paths (2 ToRs/rack, 1 Agg/ToR, min 2 Cores, GW→all Cores)
    let coreToAggLinks = 1
    let gwToCoreLinks = 1
    let gwMaxThroughput = 0
    let gwInsufficient = false
    if (!fallbackEnabled) {
      // Auto-scale Core→Agg and GW→Core links for throughput
      coreToAggLinks = Math.max(1, Math.ceil(totalBandwidth / QSFP_SPEED))
      if (selectedGw) {
        const gwSpd = selectedGw.corePortType === 'sfp' ? getSfpSpeed(moduleTypes.gwToCore) : QSFP_SPEED
        gwToCoreLinks = Math.min(Math.max(1, Math.ceil(totalBandwidth / gwSpd)), selectedGw.maxUplinks)
      }
    }
    if (selectedGw) {
      const gwSpd = selectedGw.corePortType === 'sfp' ? getSfpSpeed(moduleTypes.gwToCore) : QSFP_SPEED
      gwMaxThroughput = selectedGw.maxUplinks * gwSpd
      gwInsufficient = gwMaxThroughput < totalBandwidth
    }

    // ── Pack servers into racks (fill 7U first, then 3U to fill remaining space) ──
    const torU = fallbackEnabled ? 2 : SWITCH_RESERVED_U // 2 ToRs per rack with fallback
    const serverU = RACK_TOTAL_U - torU // available U for servers
    const rackList = []
    if (mixedRacks) {
      // Build a single queue of all servers, preserving type order
      const allSv = []
      for (const t of SERVER_TYPES) {
        for (let i = 0; i < servers[t.key].count7u; i++) allSv.push({ type: t.key, size: 7 })
        for (let i = 0; i < servers[t.key].count3u; i++) allSv.push({ type: t.key, size: 3 })
      }
      let i7 = 0, i3 = 0
      const sv7 = allSv.filter(s => s.size === 7), sv3 = allSv.filter(s => s.size === 3)
      while (i7 < sv7.length || i3 < sv3.length) {
        const rackSv = []
        let uLeft = serverU
        // Fill with 7U first
        while (uLeft >= 7 && i7 < sv7.length) { rackSv.push(sv7[i7++]); uLeft -= 7 }
        // Fill remaining space with 3U
        while (uLeft >= 3 && i3 < sv3.length) { rackSv.push(sv3[i3++]); uLeft -= 3 }
        if (rackSv.length === 0) break
        const types = [...new Set(rackSv.map(s => s.type))]
        rackList.push(buildRack(rackSv, types.length > 1 ? 'Mixed' : (SERVER_TYPES.find(t => t.key === types[0])?.label ?? 'Mixed'), torU))
      }
    } else {
      for (const t of SERVER_TYPES) {
        let rem7 = servers[t.key].count7u, rem3 = servers[t.key].count3u
        if (rem7 === 0 && rem3 === 0) continue
        while (rem7 > 0 || rem3 > 0) {
          const rackSv = []
          let uLeft = serverU
          // Fill with 7U first
          while (uLeft >= 7 && rem7 > 0) { rackSv.push({ type: t.key, size: 7 }); rem7--; uLeft -= 7 }
          // Fill remaining space with 3U
          while (uLeft >= 3 && rem3 > 0) { rackSv.push({ type: t.key, size: 3 }); rem3--; uLeft -= 3 }
          if (rackSv.length === 0) break
          rackList.push(buildRack(rackSv, t.label, torU))
        }
      }
    }
    // ── ToR Switches ──
    const torServerPorts = TOR_PORTS - 1 // 1 uplink to Agg, rest for servers
    const serversPerTor = torServerPorts > 0 ? torServerPorts : 1
    const baseTorsPerRack = rackList.map(r => serversPerTor > 0 ? Math.max(1, Math.ceil(r.totalServers / serversPerTor)) : 1)
    // Fallback: 2 ToRs per rack (dual redundant paths)
    const torsPerRack = fallbackEnabled ? baseTorsPerRack.map(t => t * 2) : baseTorsPerRack
    const totalTors = torsPerRack.reduce((s, t) => s + t, 0)

    // ── Aggregation Switches ──
    let torsPerAgg, totalAggs, aggsPerPath = 0
    if (fallbackEnabled) {
      // Failover: 2 Agg groups — each ToR path connects to a different group
      // Each Agg still supports up to 16 ToRs
      torsPerAgg = AGG_SFP_PORTS
      const torsPerPath = Math.ceil(totalTors / 2)
      aggsPerPath = Math.max(1, Math.ceil(torsPerPath / torsPerAgg))
      totalAggs = aggsPerPath * 2
    } else {
      torsPerAgg = AGG_SFP_PORTS // 16 ToRs per Agg
      totalAggs = torsPerAgg > 0 ? Math.ceil(totalTors / torsPerAgg) : 0
    }

    // ── Core Switches ──
    let totalCores
    if (fallbackEnabled) {
      // 2 redundancy paths — Aggs split evenly across 2 Core groups
      const aggsPerPath = Math.ceil(totalAggs / 2)
      const gwPortsPerCore = selectedGw ? 1 : 0
      const portsPerPath = aggsPerPath + gwPortsPerCore
      totalCores = Math.max(2, Math.ceil(portsPerPath / CORE_QSFP_PORTS) * 2)
      gwToCoreLinks = selectedGw ? totalCores : 0
    } else {
      const corePortsForAggs = totalAggs * coreToAggLinks
      const corePortsForGw = selectedGw ? Math.min(gwToCoreLinks, selectedGw.maxUplinks) : 0
      const totalCorePortsNeeded = corePortsForAggs + corePortsForGw
      totalCores = totalCorePortsNeeded > 0 ? Math.ceil(totalCorePortsNeeded / CORE_QSFP_PORTS) : 1
    }

    // Effective link counts for display & modules
    const eff = {
      torToServer: 1,
      aggToTor: 1,
      coreToAgg: fallbackEnabled ? 1 : coreToAggLinks,
      gwToCore: gwToCoreLinks,
    }

    // With fallback, also check GW has enough uplinks for all cores
    if (fallbackEnabled && selectedGw && selectedGw.maxUplinks < totalCores) {
      gwInsufficient = true
    }

    // ── Assign ToR counts ──
    rackList.forEach((r, i) => { r.torCount = torsPerRack[i] })

    // ── Place Core & Agg switches into racks ──
    const switchesToPlace = []
    for (let i = 0; i < totalCores; i++) switchesToPlace.push({ kind: 'core', u: CORE_SWITCH_U })
    for (let i = 0; i < totalAggs; i++) switchesToPlace.push({ kind: 'agg', u: AGG_SWITCH_U })

    // Place Core & Agg switches
    if (dedicatedNetworkRack) {
      // All Core & Agg go into a dedicated network rack
      const netRack = {
        label: 'Network', servers: [], count7u: 0, count3u: 0,
        totalServers: 0, usedU: 0, freeU: RACK_TOTAL_U,
        torCount: 0, coreSwitches: 0, aggSwitches: 0,
      }
      for (const sw of switchesToPlace) {
        if (sw.kind === 'core') netRack.coreSwitches++; else netRack.aggSwitches++
        netRack.usedU += sw.u
        netRack.freeU -= sw.u
      }
      rackList.unshift(netRack)
    } else {
      // Distribute into first racks that have free space
      let swIdx = 0
      for (const rack of rackList) {
        while (swIdx < switchesToPlace.length && rack.freeU >= switchesToPlace[swIdx].u) {
          if (switchesToPlace[swIdx].kind === 'core') rack.coreSwitches++; else rack.aggSwitches++
          rack.usedU += switchesToPlace[swIdx].u
          rack.freeU -= switchesToPlace[swIdx].u
          swIdx++
        }
        if (swIdx >= switchesToPlace.length) break
      }
    }
    const totalRacks = rackList.length

    // ── Module Calculations ──
    const modules = { sfp_10g_smf: 0, sfp_25g_smf: 0, sfp_10g_eth: 0, qsfp_40g_mmf: 0 }

    // Agg -> ToR: SFP Ethernet modules on Agg side
    const aggToTorTotalLinks = totalTors * eff.aggToTor
    modules.sfp_10g_eth += aggToTorTotalLinks

    // Core <-> Agg: QSFP modules on both sides
    const coreToAggTotalLinks = totalAggs * eff.coreToAgg
    modules.qsfp_40g_mmf += coreToAggTotalLinks * 2

    // Gateway <-> Core: modules depend on gateway type
    if (selectedGw) {
      const gwUp = Math.min(eff.gwToCore, selectedGw.maxUplinks)
      if (selectedGw.corePortType === 'sfp') {
        modules[moduleTypes.gwToCore] = (modules[moduleTypes.gwToCore] || 0) + gwUp
        modules.qsfp_40g_mmf += gwUp // Core side
      } else {
        modules.qsfp_40g_mmf += gwUp * 2 // both sides
      }
    }

    // ── Throughput / LAG ──
    const maxRackBandwidth = RACK_7U_PER * 0.6 + RACK_3U_PER * 0.25 // 3.85 Gb/s per full rack
    const lagSummary = {
      torToServer: { links: eff.torToServer, speed: 'Ethernet', throughput: 'Ethernet (fixed per link)', required: maxRackBandwidth },
      aggToTor: { links: eff.aggToTor, speed: 10, throughput: `${eff.aggToTor} x 10Gb = ${eff.aggToTor * 10}Gb`, required: maxRackBandwidth },
      coreToAgg: { links: eff.coreToAgg, speed: QSFP_SPEED, throughput: `${eff.coreToAgg} x ${QSFP_SPEED}Gb = ${eff.coreToAgg * QSFP_SPEED}Gb`, required: totalBandwidth },
    }
    if (selectedGw) {
      const gwSpd = selectedGw.corePortType === 'sfp' ? getSfpSpeed(moduleTypes.gwToCore) : QSFP_SPEED
      lagSummary.gwToCore = { links: eff.gwToCore, speed: gwSpd, throughput: `${eff.gwToCore} x ${gwSpd}Gb = ${eff.gwToCore * gwSpd}Gb`, required: totalBandwidth }
    }

    // ── IOPS ──
    const totalIOPS = total7u * 12000 + total3u * 5000
    const totalIOPSReq = totalIOPSRequested

    // ── Shopping List ──
    const shoppingList = []

    for (const t of SERVER_TYPES) {
      if (servers[t.key].count7u > 0) shoppingList.push({ item: `${t.label} 7U`, qty: servers[t.key].count7u, purchase: servers[t.key].count7u, unitPrice: SERVER_PRICES[t.key]['7u'] })
      if (servers[t.key].count3u > 0) shoppingList.push({ item: `${t.label} 3U`, qty: servers[t.key].count3u, purchase: servers[t.key].count3u, unitPrice: SERVER_PRICES[t.key]['3u'] })
    }
    shoppingList.push({ item: 'Lanberg Rack Cabinet 19" 47U', qty: totalRacks, purchase: totalRacks, unitPrice: RACK_PRICE })
    if (selectedGw) shoppingList.push({ item: selectedGw.label, qty: 1, purchase: 1, unitPrice: GATEWAY_PRICES[selectedGw.key] || 0 })
    shoppingList.push({ item: '32 x QSFP+', qty: totalCores, purchase: totalCores, unitPrice: SWITCH_PRICES.core })
    shoppingList.push({ item: '4 x QSFP+ 16 x SFP+/SFP28', qty: totalAggs, purchase: totalAggs, unitPrice: SWITCH_PRICES.agg })
    shoppingList.push({ item: '16 x 10Gbps RJ45', qty: totalTors, purchase: totalTors, unitPrice: SWITCH_PRICES.tor })

    for (const mod of SFP_MODULE_OPTIONS) {
      if (modules[mod.key] > 0) {
        const packs = Math.ceil(modules[mod.key] / MODULE_PACK_SIZE)
        shoppingList.push({ item: '5x SFP+ Modules RJ45 10Gbps', qty: modules[mod.key], purchase: ceilToPack(modules[mod.key]), unitPrice: MODULE_PRICES.sfp_pack, packQty: packs, isModule: true })
      }
    }
    if (modules.qsfp_40g_mmf > 0) {
      const packs = Math.ceil(modules.qsfp_40g_mmf / MODULE_PACK_SIZE)
      shoppingList.push({ item: '5x QSFP+ Module Fiber', qty: modules.qsfp_40g_mmf, purchase: ceilToPack(modules.qsfp_40g_mmf), unitPrice: MODULE_PRICES.qsfp_pack, packQty: packs, isModule: true })
    }

    const totalCost = shoppingList.reduce((s, r) => s + (r.isModule ? (r.packQty * r.unitPrice) : (r.purchase * r.unitPrice)), 0)

    // ── Topology data (individual devices) ──
    const topoCols = []
    const topoEdges = []
    const topoLagLabels = []

    if (selectedGw) {
      topoCols.push({
        key: 'gw', label: 'Gateway', color: '#06b6d4', bg: '#083344',
        nodes: [{ id: 'gw_1', label: selectedGw.label, sub: selectedGw.desc }]
      })
    }
    topoCols.push({
      key: 'core', label: 'Core Switches', color: '#ef4444', bg: '#450a0a',
      nodes: Array.from({ length: totalCores }, (_, i) => ({
        id: `core_${i}`, label: `Core ${i + 1}`, sub: `${CORE_QSFP_PORTS} QSFP`
      }))
    })
    topoCols.push({
      key: 'agg', label: 'Agg Switches', color: '#f97316', bg: '#431407',
      nodes: Array.from({ length: totalAggs }, (_, i) => ({
        id: `agg_${i}`, label: `Agg ${i + 1}`, sub: `${AGG_SFP_PORTS} SFP + ${AGG_QSFP_PORTS} QSFP`
      }))
    })
    const torGroupNodes = []
    if (fallbackEnabled && aggsPerPath > 0) {
      // Each Agg pair (one per path) shares a ToR group
      const torsPerPath = Math.ceil(totalTors / 2)
      let pathAssigned = 0
      for (let p = 0; p < aggsPerPath; p++) {
        const pathCount = Math.min(torsPerAgg, torsPerPath - pathAssigned)
        if (pathCount > 0) {
          const rackCount = pathCount // each rack has 2 ToRs (one per path)
          torGroupNodes.push({ id: `tg_${p}`, label: `${rackCount}\u00d72 Racks`, sub: `2 ToR per rack`, aggA: p, aggB: p + aggsPerPath })
          pathAssigned += pathCount
        }
      }
    } else {
      let torAssigned = 0
      for (let ai = 0; ai < totalAggs; ai++) {
        const count = Math.min(torsPerAgg, totalTors - torAssigned)
        if (count > 0) {
          torGroupNodes.push({ id: `tg_${ai}`, label: `${count}\u00d7 ToR`, sub: `${TOR_PORTS} Eth each`, aggA: ai })
          torAssigned += count
        }
      }
    }
    topoCols.push({ key: 'tor', label: 'ToR Switches', color: '#6b7280', bg: '#1f2937', nodes: torGroupNodes })

    // Edges: GW → Cores
    if (selectedGw) {
      for (let ci = 0; ci < totalCores; ci++) topoEdges.push({ from: 'gw_1', to: `core_${ci}`, color: '#06b6d4' })
    }
    // Cores → Aggs
    if (fallbackEnabled && aggsPerPath > 0) {
      // Path A Aggs (0..aggsPerPath-1) → first half of Cores, Path B → second half
      const coresPerPath = Math.ceil(totalCores / 2)
      for (let ai = 0; ai < aggsPerPath; ai++) {
        topoEdges.push({ from: `core_${ai % coresPerPath}`, to: `agg_${ai}`, color: '#ef4444' })
      }
      for (let ai = 0; ai < aggsPerPath; ai++) {
        topoEdges.push({ from: `core_${coresPerPath + (ai % coresPerPath)}`, to: `agg_${ai + aggsPerPath}`, color: '#ef4444' })
      }
    } else {
      for (let ai = 0; ai < totalAggs; ai++) topoEdges.push({ from: `core_${ai % totalCores}`, to: `agg_${ai}`, color: '#ef4444' })
    }
    // Aggs → ToR groups
    for (const tg of torGroupNodes) {
      topoEdges.push({ from: `agg_${tg.aggA}`, to: tg.id, color: '#f97316' })
      if (tg.aggB !== undefined) topoEdges.push({ from: `agg_${tg.aggB}`, to: tg.id, color: '#f97316' })
    }

    // LAG labels per column gap
    if (selectedGw) {
      const gwSpd = selectedGw.corePortType === 'sfp' ? getSfpSpeed(moduleTypes.gwToCore) : QSFP_SPEED
      topoLagLabels.push({ label: `${eff.gwToCore}\u00d7 ${gwSpd}Gb = ${eff.gwToCore * gwSpd}Gb`, color: '#06b6d4' })
    }
    topoLagLabels.push({ label: `${eff.coreToAgg}\u00d7 ${QSFP_SPEED}Gb = ${eff.coreToAgg * QSFP_SPEED}Gb`, color: '#ef4444' })
    topoLagLabels.push({ label: `${eff.aggToTor}\u00d7 10Gb = ${eff.aggToTor * 10}Gb`, color: '#f97316' })

    return {
      servers, totalServers, total3u, total7u, totalIOPS, totalIOPSReq, totalBandwidth,
      selectedGateway: selectedGw, totalGateways, gwMaxThroughput, gwInsufficient,
      effectiveUplinks: eff,
      rackList, totalRacks,
      torsPerRack, totalTors, serversPerTor,
      totalAggs, torsPerAgg,
      totalCores,
      modules, lagSummary,
      shoppingList, totalCost,
      topoData: { columns: topoCols, edges: topoEdges, lagLabels: topoLagLabels },
    }
  }, [iopsInputs, gatewayType, fallbackEnabled, mixedRacks, dedicatedNetworkRack, moduleTypes])

  // ═══════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="mb-8">
          <a href="#/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">&larr; Back to Tools</a>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Rack & Network Planning Tool</h1>
        <p className="text-gray-400 mb-10">
          Plan server hardware, rack layouts, network topology, and generate a shopping list.
          Flow: Customer Gateway &rarr; Core Switch &rarr; Aggregation Switch &rarr; ToR Switch &rarr; Servers
        </p>

        {/* ════════════════════════════════════════ */}
        {/*  SERVER INPUTS                          */}
        {/* ════════════════════════════════════════ */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">IOPS Requirements</h2>
          <p className="text-xs text-gray-500 mb-4">Enter the raw IOPS needed per server type. Servers are auto-calculated: 7U (12,000 IOPS) first, remainder filled with 3U (5,000 IOPS).</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SERVER_TYPES.map(t => {
              const val = num(iopsInputs[t.key])
              const { count7u, count3u } = iopsToServers(val)
              const actualIOPS = count7u * 12000 + count3u * 5000
              return (
              <div key={t.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span>{t.emoji}</span>
                  <span className="font-medium text-sm">{t.label}</span>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Required IOPS</label>
                  <input type="text" inputMode="numeric" placeholder="0"
                    value={iopsInputs[t.key]}
                    onChange={e => handleIOPS(t.key, e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors text-sm" />
                </div>
                {val > 0 && (
                  <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                    <p>{count7u} &times; 7U + {count3u} &times; 3U = <strong className="text-white">{actualIOPS.toLocaleString()} IOPS</strong></p>
                    {actualIOPS > val && <p className="text-green-400">+{(actualIOPS - val).toLocaleString()} IOPS headroom</p>}
                  </div>
                )}
              </div>
              )
            })}
          </div>
        </section>

        {/* ════════════════════════════════════════ */}
        {/*  GATEWAY SELECTION                      */}
        {/* ════════════════════════════════════════ */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Customer Gateway</h2>
          <p className="text-xs text-gray-500 mb-4">Select the gateway type for the customer connection. Only one gateway is allowed.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {GATEWAY_TYPES.map(gw => (
              <button key={gw.key} onClick={() => setGatewayType(gw.key)}
                className={`bg-gray-900 border rounded-xl p-4 text-left transition-colors ${gatewayType === gw.key ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-gray-800 hover:border-gray-700'}`}>
                <p className="font-medium text-sm mb-1">{gw.label}</p>
                <p className="text-xs text-gray-500">{gw.desc}</p>
              </button>
            ))}
          </div>
          {results?.gwInsufficient && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-red-400 text-lg leading-none">&#9888;</span>
              <div>
                <p className="text-sm font-medium text-red-400">Gateway too small</p>
                <p className="text-xs text-red-400/70">
                  {results.selectedGateway.label} max throughput is {results.gwMaxThroughput}Gb ({results.selectedGateway.maxUplinks} uplinks),
                  but {results.totalBandwidth.toFixed(2)} Gb/s is required. Consider upgrading to a larger gateway.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ════════════════════════════════════════ */}
        {/*  OPTIONS                                */}
        {/* ════════════════════════════════════════ */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Options</h2>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 cursor-pointer select-none">
              <input type="checkbox" checked={fallbackEnabled} onChange={e => setFallbackEnabled(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500" />
              <div>
                <p className="font-medium text-sm">Fallback</p>
                <p className="text-xs text-gray-500">Redundant connections: minimum 2 links at every layer</p>
              </div>
            </label>
            <label className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 cursor-pointer select-none">
              <input type="checkbox" checked={mixedRacks} onChange={e => setMixedRacks(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500" />
              <div>
                <p className="font-medium text-sm">Mixed Racks</p>
                <p className="text-xs text-gray-500">Allow multiple server types in the same rack</p>
              </div>
            </label>
            <label className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 cursor-pointer select-none">
              <input type="checkbox" checked={dedicatedNetworkRack} onChange={e => setDedicatedNetworkRack(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500" />
              <div>
                <p className="font-medium text-sm">Dedicated Network Rack</p>
                <p className="text-xs text-gray-500">Place all Core & Aggregation switches in a separate rack</p>
              </div>
            </label>

          </div>
        </section>

        {/* ════════════════════════════════════════ */}
        {/*  SAVE SETUP / SHARE CODE               */}
        {/* ════════════════════════════════════════ */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Save Setup or Share</h2>
          <p className="text-xs text-gray-500 mb-4">Save locally or share a link to your setup.</p>
          <div className="flex flex-wrap gap-3 mb-4">
            <input type="text" placeholder="Setup name…" value={offerName} onChange={e => setOfferName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveOffer()}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 w-48" />
            <button onClick={saveOffer}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Save
            </button>
            <div className="relative">
              <button onClick={shareConfig}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Copy Share Link
              </button>
              {shareToast && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  Copied!
                </span>
              )}
            </div>
          </div>
          {savedOffers.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left">
                    <th className="px-4 py-3 text-gray-400 font-medium">Name</th>
                    <th className="px-4 py-3 text-gray-400 font-medium">Saved</th>
                    <th className="px-4 py-3 text-gray-400 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {savedOffers.map((offer, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-gray-300">{offer.name}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{new Date(offer.savedAt).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => loadOffer(offer)}
                          className="text-indigo-400 hover:text-indigo-300 text-xs font-medium mr-3 transition-colors">Load</button>
                        <button onClick={() => deleteOffer(i)}
                          className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>


        {/* ════════════════════════════════════════ */}
        {/*  OUTPUTS                                */}
        {/* ════════════════════════════════════════ */}
        {results && (
          <div className="space-y-12 border-t border-gray-800 pt-12">

            {/* ── Summary Stats ─────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Summary</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  [results.totalServers, 'Total Servers'],
                  [results.total7u, '7U Servers'],
                  [results.total3u, '3U Servers'],
                  [results.totalIOPSReq.toLocaleString(), 'IOPS Requested'],
                  [results.totalIOPS.toLocaleString(), 'IOPS Provided'],
                  [results.totalRacks, 'Racks Required'],
                  [`${results.totalBandwidth.toFixed(2)} Gb/s`, 'Required Throughput'],
                  [`${results.totalTors + results.totalAggs + results.totalCores}`, 'Total Switches'],
                ].map(([val, label]) => (
                  <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold">{val}</p>
                    <p className="text-xs text-gray-400 mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Shopping List ──────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Shopping List</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      <th className="px-4 py-3 text-gray-400 font-medium">Item</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Qty Needed</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Purchase</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Unit Price</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {results.shoppingList.map((row, i) => {
                      const lineTotal = row.isModule ? (row.packQty * row.unitPrice) : (row.purchase * row.unitPrice)
                      return (
                      <tr key={i}>
                        <td className="px-4 py-2 text-gray-300">{row.item}</td>
                        <td className="px-4 py-2 text-right">{row.qty}</td>
                        <td className="px-4 py-2 text-right font-bold">
                          {row.isModule ? `${row.packQty} pack${row.packQty > 1 ? 's' : ''}` : row.purchase}
                          {row.isModule && row.purchase > row.qty && (
                            <span className="text-xs text-gray-500 ml-1">(+{row.purchase - row.qty} spare)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-400">${row.unitPrice.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-bold">${lineTotal.toLocaleString()}</td>
                      </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-700 bg-gray-800/50">
                      <td className="px-4 py-3 font-semibold" colSpan={4}>Total Cost</td>
                      <td className="px-4 py-3 text-right font-bold text-lg text-green-400">${results.totalCost.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
                <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-500">
                  Servers, racks, switches, and gateways are purchased individually. Modules are sold in packs of {MODULE_PACK_SIZE}.
                </div>
              </div>
            </section>

            {/* ── Rack Layout ───────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Rack Layout</h2>
              <p className="text-xs text-gray-500 mb-4">Click a rack to see the U-by-U breakdown.</p>
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: SLOT_COLORS.switch, opacity: 0.65 }} />
                  ToR Switch
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: SLOT_COLORS.core, opacity: 0.65 }} />
                  Core Switch
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: SLOT_COLORS.agg, opacity: 0.65 }} />
                  Agg Switch
                </span>
                {SERVER_TYPES.map(t => (
                  <span key={t.key} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.color, opacity: 0.65 }} />
                    {t.label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border border-gray-700" style={{ backgroundColor: SLOT_COLORS.empty, opacity: 0.2 }} />
                  Empty
                </span>
              </div>
              {/* Mini rack grid */}
              <div className="flex flex-wrap gap-2 mb-4">
                {results.rackList.map((rack, idx) => (
                  <MiniRack key={idx} rack={rack} index={idx}
                    isSelected={selectedRack === idx} onClick={() => setSelectedRack(selectedRack === idx ? null : idx)} />
                ))}
              </div>
              {/* Detail panel */}
              {selectedRack !== null && results.rackList[selectedRack] && (
                <RackDetail rack={results.rackList[selectedRack]} tors={results.torsPerRack[selectedRack]} index={selectedRack} />
              )}
              {/* Totals bar */}
              {results.totalRacks > 0 && (
                <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                    <span>Total Racks: <strong className="text-white">{results.totalRacks}</strong></span>
                    <span>Total Used: <strong className="text-white">{results.rackList.reduce((s, r) => s + r.usedU, 0)}U</strong></span>
                    <span>Total Free: <strong className="text-white">{results.rackList.reduce((s, r) => s + r.freeU, 0)}U</strong></span>
                  </div>
                </div>
              )}
            </section>

            {/* ── Network Topology ──────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Network Topology</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <TopologyDiagram data={results.topoData} />
              </div>
            </section>

            {/* ── LAG / Throughput Summary ──────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Link Aggregation (LAG) Summary</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      <th className="px-4 py-3 text-gray-400 font-medium">Connection</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Links</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Combined Throughput</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Required Throughput</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {results.lagSummary.gwToCore && (
                      <tr>
                        <td className="px-4 py-2 text-gray-300">Gateway &rarr; Core</td>
                        <td className="px-4 py-2 text-right">{results.lagSummary.gwToCore.links}</td>
                        <td className="px-4 py-2 text-right font-bold">{results.lagSummary.gwToCore.throughput}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{results.lagSummary.gwToCore.required.toFixed(2)} Gb/s</td>
                      </tr>
                    )}
                    <tr>
                      <td className="px-4 py-2 text-gray-300">Core &rarr; Aggregation</td>
                      <td className="px-4 py-2 text-right">{results.lagSummary.coreToAgg.links}</td>
                      <td className="px-4 py-2 text-right font-bold">{results.lagSummary.coreToAgg.throughput}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{results.lagSummary.coreToAgg.required.toFixed(2)} Gb/s</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-gray-300">Aggregation &rarr; ToR</td>
                      <td className="px-4 py-2 text-right">{results.lagSummary.aggToTor.links}</td>
                      <td className="px-4 py-2 text-right font-bold">{results.lagSummary.aggToTor.throughput}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{results.lagSummary.aggToTor.required.toFixed(2)} Gb/s</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-gray-300">ToR &rarr; Server</td>
                      <td className="px-4 py-2 text-right">{results.lagSummary.torToServer.links}</td>
                      <td className="px-4 py-2 text-right font-bold">{results.lagSummary.torToServer.throughput}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{results.lagSummary.torToServer.required.toFixed(2)} Gb/s</td>
                    </tr>
                  </tbody>
                </table>
                {fallbackEnabled && (
                  <div className="px-4 py-3 border-t border-gray-800 text-xs text-indigo-400">
                    Fallback active &mdash; dual redundant paths: 2 ToRs per rack, 1 dedicated Agg per ToR, {results.totalCores} Core switches, {results.effectiveUplinks.gwToCore} GW links.
                  </div>
                )}
              </div>
            </section>

            {/* ── Switch Breakdown ──────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Switch & Device Breakdown</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {results.totalGateways > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-cyan-400 text-lg">&#9729;</span>
                      <span className="font-medium text-sm">Customer Gateway</span>
                    </div>
                    <p className="text-2xl font-bold">1</p>
                    <p className="text-xs text-gray-500">{results.selectedGateway.label}</p>
                    <p className="text-xs text-gray-500">{results.selectedGateway.desc}</p>
                  </div>
                )}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-red-400 text-lg">&#9733;</span>
                    <span className="font-medium text-sm">Core Switches</span>
                  </div>
                  <p className="text-2xl font-bold">{results.totalCores}</p>
                  <p className="text-xs text-gray-500">{CORE_QSFP_PORTS} QSFP ports each</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-orange-400 text-lg">&#9670;</span>
                    <span className="font-medium text-sm">Aggregation Switches</span>
                  </div>
                  <p className="text-2xl font-bold">{results.totalAggs}</p>
                  <p className="text-xs text-gray-500">{AGG_SFP_PORTS} SFP + {AGG_QSFP_PORTS} QSFP each</p>
                  <p className="text-xs text-gray-500">{results.torsPerAgg} ToRs per Agg (max)</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-400 text-lg">&#9642;</span>
                    <span className="font-medium text-sm">ToR Switches</span>
                  </div>
                  <p className="text-2xl font-bold">{results.totalTors}</p>
                  <p className="text-xs text-gray-500">{TOR_PORTS} Ethernet ports each</p>
                  <p className="text-xs text-gray-500">{results.serversPerTor} servers per ToR (max)</p>
                </div>
              </div>
            </section>

            {/* ── Module Breakdown ──────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Module Breakdown</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      <th className="px-4 py-3 text-gray-400 font-medium">Module Type</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Total Required</th>
                      <th className="px-4 py-3 text-gray-400 font-medium text-right">Purchase (packs of {MODULE_PACK_SIZE})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {SFP_MODULE_OPTIONS.map(mod => (
                      <tr key={mod.key} className={results.modules[mod.key] === 0 ? 'opacity-40' : ''}>
                        <td className="px-4 py-2 text-gray-300">{mod.label}</td>
                        <td className="px-4 py-2 text-right">{results.modules[mod.key]}</td>
                        <td className="px-4 py-2 text-right font-bold">{ceilToPack(results.modules[mod.key])}</td>
                      </tr>
                    ))}
                    <tr className={results.modules.qsfp_40g_mmf === 0 ? 'opacity-40' : ''}>
                      <td className="px-4 py-2 text-gray-300">40Gb Multi Mode Fibre (QSFP)</td>
                      <td className="px-4 py-2 text-right">{results.modules.qsfp_40g_mmf}</td>
                      <td className="px-4 py-2 text-right font-bold">{ceilToPack(results.modules.qsfp_40g_mmf)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Reference ─────────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Reference</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      <th className="px-4 py-3 text-gray-400 font-medium">Spec</th>
                      <th className="px-4 py-3 text-gray-400 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr><td className="px-4 py-2 text-gray-300">Rack</td><td className="px-4 py-2">{RACK_TOTAL_U}U total &middot; {SWITCH_RESERVED_U}U switches &middot; {AVAILABLE_U}U servers</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Default rack layout</td><td className="px-4 py-2">{SWITCH_RESERVED_U}U switches + 1x3U + 6x7U = {RACK_TOTAL_U}U</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">3U Server</td><td className="px-4 py-2">5,000 IOPS</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">7U Server</td><td className="px-4 py-2">12,000 IOPS</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">ToR Switch</td><td className="px-4 py-2">{TOR_PORTS} x Ethernet ports (fixed, no modules)</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Aggregation Switch</td><td className="px-4 py-2">{AGG_SFP_PORTS} x SFP + {AGG_QSFP_PORTS} x QSFP (Agg&rarr;ToR is Ethernet)</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Core Switch</td><td className="px-4 py-2">{CORE_QSFP_PORTS} x QSFP</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">SFP Modules</td><td className="px-4 py-2">10Gb SMF &middot; 25Gb SMF &middot; 10Gb Ethernet</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">QSFP Modules</td><td className="px-4 py-2">40Gb Multi Mode Fibre</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Module packs</td><td className="px-4 py-2">Sold in packs of {MODULE_PACK_SIZE}</td></tr>
                    {GATEWAY_TYPES.map(gw => (
                      <tr key={gw.key}><td className="px-4 py-2 text-gray-300">{gw.label}</td><td className="px-4 py-2">{gw.desc}</td></tr>
                    ))}
                    <tr><td className="px-4 py-2 text-gray-300">Server types</td><td className="px-4 py-2">GPU &middot; RISC &middot; System &middot; Mainframe</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Network flow</td><td className="px-4 py-2">Gateway &rarr; Core &rarr; Aggregation &rarr; ToR &rarr; Servers</td></tr>
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
