import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'
import {
  RACK_TOTAL_U, SERVER_TYPES, GATEWAY_TYPES, SFP_MODULE_OPTIONS,
  MODULE_PACK_SIZE, CORE_QSFP_PORTS, AGG_SFP_PORTS, AGG_QSFP_PORTS,
  TOR_PORTS, SWITCH_RESERVED_U, AVAILABLE_U, QSFP_SPEED,
} from './constants'
import { num, ceilToPack, iopsToServers } from './helpers'
import { MiniRack, RackDetail, SLOT_COLORS } from './RackVisuals'
import TopologyDiagram from './TopologyDiagram'
import useRackCalculator from './useRackCalculator'

export default function RackCalculator() {
  // ── State ──
  const [iopsInputs, setIopsInputs] = useState({ gpu: '', risc: '', system: '', mainframe: '' })
  const [gatewayType, setGatewayType] = useState("small")
  const [redundancyEnabled, setRedundancyEnabled] = useState(false)
  const [skipCoreSwitch, setSkipCoreSwitch] = useState(false)
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
    iopsInputs, gatewayType, redundancyEnabled, skipCoreSwitch, mixedRacks, dedicatedNetworkRack, moduleTypes,
  }), [iopsInputs, gatewayType, redundancyEnabled, skipCoreSwitch, mixedRacks, dedicatedNetworkRack, moduleTypes])

  const applyConfig = useCallback((cfg) => {
    if (cfg.iopsInputs) setIopsInputs(cfg.iopsInputs)
    if (cfg.gatewayType !== undefined) setGatewayType(cfg.gatewayType)
    if (cfg.redundancyEnabled !== undefined) setRedundancyEnabled(cfg.redundancyEnabled)
    else if (cfg.fallbackEnabled !== undefined) setRedundancyEnabled(cfg.fallbackEnabled)
    if (cfg.skipCoreSwitch !== undefined) setSkipCoreSwitch(cfg.skipCoreSwitch)
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

  // ── Calculations ──
  const results = useRackCalculator({ iopsInputs, gatewayType, redundancyEnabled, skipCoreSwitch, mixedRacks, dedicatedNetworkRack, moduleTypes })

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
              <input type="checkbox" checked={redundancyEnabled} onChange={e => setRedundancyEnabled(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500" />
              <div>
                <p className="font-medium text-sm">Redundancy</p>
                <p className="text-xs text-gray-500">Redundant connections: minimum 2 links at every layer</p>
              </div>
            </label>
            <label className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 cursor-pointer select-none">
              <input type="checkbox" checked={skipCoreSwitch} onChange={e => setSkipCoreSwitch(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500" />
              <div>
                <p className="font-medium text-sm">Skip Core Switch</p>
                <p className="text-xs text-gray-500">Gateway connects directly to Aggregation switches (no Core layer)</p>
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
        {/*  SAVE SETUP / SHARE                     */}
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
                    {results.lagSummary.gwToAgg && (
                      <tr>
                        <td className="px-4 py-2 text-gray-300">Gateway &rarr; Aggregation</td>
                        <td className="px-4 py-2 text-right">{results.lagSummary.gwToAgg.links}</td>
                        <td className="px-4 py-2 text-right font-bold">{results.lagSummary.gwToAgg.throughput}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{results.lagSummary.gwToAgg.required.toFixed(2)} Gb/s</td>
                      </tr>
                    )}
                    {results.lagSummary.coreToAgg && (
                    <tr>
                      <td className="px-4 py-2 text-gray-300">Core &rarr; Aggregation</td>
                      <td className="px-4 py-2 text-right">{results.lagSummary.coreToAgg.links}</td>
                      <td className="px-4 py-2 text-right font-bold">{results.lagSummary.coreToAgg.throughput}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{results.lagSummary.coreToAgg.required.toFixed(2)} Gb/s</td>
                    </tr>
                    )}
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
                {redundancyEnabled && (
                  <div className="px-4 py-3 border-t border-gray-800 text-xs text-indigo-400">
                    Redundancy active &mdash; dual redundant paths: 2 ToRs per rack, 1 dedicated Agg per ToR, {results.totalCores} Core switches, {results.effectiveUplinks.gwToCore} GW links.
                  </div>
                )}
              </div>
            </section>

            {/* ── Switch Breakdown ──────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Switch & Device Breakdown</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {results.totalCores > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-red-400 text-lg">&#9733;</span>
                    <span className="font-medium text-sm">Core Switches</span>
                  </div>
                  <p className="text-2xl font-bold">{results.totalCores}</p>
                  <p className="text-xs text-gray-500">{CORE_QSFP_PORTS} QSFP ports each</p>
                </div>
                )}
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
