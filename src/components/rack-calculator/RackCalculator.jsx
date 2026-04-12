import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../layout/Navbar'
import Footer from '../layout/Footer'
import {
  RACK_TOTAL_U, SERVER_TYPES, GATEWAY_TYPES, SFP_MODULE_OPTIONS,
  MODULE_PACK_SIZE, CORE_QSFP_PORTS, AGG_SFP_PORTS, AGG_QSFP_PORTS,
  TOR_PORTS, SWITCH_RESERVED_U, AVAILABLE_U, QSFP_SPEED, RACK_PRESETS,
} from './constants'
import { num, ceilToPack, iopsToServers } from './helpers'
import { MiniRack, RackDetail, SLOT_COLORS } from './RackVisuals'
import CustomerPresetModal from './CustomerPresetModal'
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
  const [rackPreset, setRackPreset] = useState('default')

  // ── Customer Presets ──
  const [customers, setCustomers] = useState([])
  const [presetOpen, setPresetOpen] = useState(false)
  const [presetSearch, setPresetSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const [selectedRack, setSelectedRack] = useState(null)
  const [savedOffers, setSavedOffers] = useState([])
  const [offerName, setOfferName] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [shareToast, setShareToast] = useState(false)

  // ── Offer helpers ──
  const OFFERS_KEY = 'dc-tools-offers'

  const getConfig = useCallback(() => ({
    iopsInputs, gatewayType, redundancyEnabled, skipCoreSwitch, mixedRacks, dedicatedNetworkRack, moduleTypes, rackPreset,
    customerName: selectedCustomer?.name || null,
  }), [iopsInputs, gatewayType, redundancyEnabled, skipCoreSwitch, mixedRacks, dedicatedNetworkRack, moduleTypes, rackPreset, selectedCustomer])

  const applyConfig = useCallback((cfg) => {
    if (cfg.iopsInputs) setIopsInputs(cfg.iopsInputs)
    if (cfg.gatewayType !== undefined) setGatewayType(cfg.gatewayType)
    if (cfg.redundancyEnabled !== undefined) setRedundancyEnabled(cfg.redundancyEnabled)
    else if (cfg.fallbackEnabled !== undefined) setRedundancyEnabled(cfg.fallbackEnabled)
    if (cfg.skipCoreSwitch !== undefined) setSkipCoreSwitch(cfg.skipCoreSwitch)
    if (cfg.mixedRacks !== undefined) setMixedRacks(cfg.mixedRacks)
    if (cfg.dedicatedNetworkRack !== undefined) setDedicatedNetworkRack(cfg.dedicatedNetworkRack)
    if (cfg.moduleTypes) setModuleTypes(cfg.moduleTypes)
    if (cfg.rackPreset) setRackPreset(cfg.rackPreset)
    setSelectedRack(null)
    setSelectedCustomer(null)
  }, [])

  // Load saved offers from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OFFERS_KEY)
      if (raw) setSavedOffers(JSON.parse(raw))
    } catch { /* ignore corrupt data */ }
  }, [])

  // Fetch customer presets
  useEffect(() => {
    fetch('/DC-Tools/companies.json')
      .then(r => r.json())
      .then(data => {
        // Patch image paths to include /DC-Tools
        setCustomers(data.map(c => ({
          ...c,
          image: c.image ? `/DC-Tools${c.image}` : ''
        })))
      })
      .catch(() => {})
  }, [])

  const SWITCH_TO_GATEWAY = { '4 Port': 'small', '4 + 16 Port': 'medium', '32 Port': 'large' }

  const applyCustomer = (customer) => {
    const reqs = customer.requirements
    setIopsInputs({
      system: reqs.system.iops ? String(reqs.system.iops) : '',
      risc: reqs.risc.iops ? String(reqs.risc.iops) : '',
      mainframe: reqs.mainframe.iops ? String(reqs.mainframe.iops) : '',
      gpu: reqs.gpu.iops ? String(reqs.gpu.iops) : '',
    })
    if (customer.switch && SWITCH_TO_GATEWAY[customer.switch]) {
      setGatewayType(SWITCH_TO_GATEWAY[customer.switch])
    }
    setSelectedCustomer(customer)
    setPresetOpen(false)
    setPresetSearch('')
    setSelectedRack(null)
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(presetSearch.toLowerCase())
  )

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

  // Resolve customerName from URL config once customers are loaded
  useEffect(() => {
    if (customers.length === 0) return
    const cfgParam = searchParams.get('cfg')
    if (cfgParam) {
      try {
        const cfg = JSON.parse(atob(cfgParam))
        if (cfg.customerName) {
          const match = customers.find(c => c.name === cfg.customerName)
          if (match) setSelectedCustomer(match)
        }
      } catch { /* ignore */ }
    }
  }, [customers]) // eslint-disable-line react-hooks/exhaustive-deps

  const persistOffers = (offers) => {
    setSavedOffers(offers)
    localStorage.setItem(OFFERS_KEY, JSON.stringify(offers))
  }

  const saveOffer = () => {
    const name = offerName.trim() || `Design ${savedOffers.length + 1}`
    // Check for existing offer with same name
    const existingIdx = savedOffers.findIndex(o => o.name === name)
    const offer = { name, config: getConfig(), savedAt: new Date().toISOString() }
    if (existingIdx !== -1) {
      // Do not override by default, require explicit override
      setPendingOverride({ offer, idx: existingIdx })
    } else {
      persistOffers([...savedOffers, offer])
      setOfferName('')
    }
  }

  // State for override confirmation
  const [pendingOverride, setPendingOverride] = useState(null)
  const confirmOverride = () => {
    if (pendingOverride) {
      const offers = [...savedOffers]
      offers[pendingOverride.idx] = pendingOverride.offer
      persistOffers(offers)
      setOfferName('')
      setPendingOverride(null)
    }
  }
  const cancelOverride = () => setPendingOverride(null)

  const loadOffer = (offer) => {
    applyConfig(offer.config)
    if (offer.config.customerName && customers.length > 0) {
      const match = customers.find(c => c.name === offer.config.customerName)
      if (match) setSelectedCustomer(match)
    }
  }

  const deleteOffer = (idx) => persistOffers(savedOffers.filter((_, i) => i !== idx))

  const [renamingIdx, setRenamingIdx] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  const handleRenameOffer = (idx, newName) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const next = savedOffers.map((o, i) => i === idx ? { ...o, name: trimmed } : o)
    persistOffers(next)
    setRenamingIdx(null)
  }

  const handleDragStart = (index) => setDragIndex(index)

  const handleDragOver = (e, index) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (e, index) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) { setDragIndex(null); setDragOverIndex(null); return }
    const next = [...savedOffers]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(index, 0, moved)
    persistOffers(next)
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null) }

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
  const results = useRackCalculator({ iopsInputs, gatewayType, redundancyEnabled, skipCoreSwitch, mixedRacks, dedicatedNetworkRack, moduleTypes, rackPreset })

  const buildSteps = useMemo(() => {
    if (!results) return []
    const steps = []
    steps.push({ text: `Place ${results.totalRacks} rack${results.totalRacks !== 1 ? 's' : ''}`, cat: 'build' })
    steps.push({ text: `Install ${results.totalTors} Top of Rack switch${results.totalTors !== 1 ? 'es' : ''}`, cat: 'build' })
    for (const t of SERVER_TYPES) {
      const s = results.servers[t.key]
      if (s.total > 0) {
        const parts = []
        if (s.count7u > 0) parts.push(`${s.count7u}\u00d7 7U`)
        if (s.count3u > 0) parts.push(`${s.count3u}\u00d7 3U`)
        steps.push({ text: `Install ${s.total} ${t.label} server${s.total !== 1 ? 's' : ''} (${parts.join(' + ')})`, cat: 'build' })
      }
    }
    if (results.totalAggs > 0) steps.push({ text: `Install ${results.totalAggs} Aggregation switch${results.totalAggs !== 1 ? 'es' : ''}`, cat: 'build' })
    if (results.totalCores > 0) steps.push({ text: `Install ${results.totalCores} Core switch${results.totalCores !== 1 ? 'es' : ''}`, cat: 'build' })
    const sfpTotal = Object.entries(results.modules).filter(([k]) => k !== 'qsfp_40g_mmf').reduce((s, [, v]) => s + v, 0)
    if (sfpTotal > 0) steps.push({ text: `Install ${sfpTotal} SFP module${sfpTotal !== 1 ? 's' : ''} (buy ${Math.ceil(sfpTotal / MODULE_PACK_SIZE)} pack${Math.ceil(sfpTotal / MODULE_PACK_SIZE) !== 1 ? 's' : ''}) in Aggregation switches`, cat: 'modules' })
    if (results.modules.qsfp_40g_mmf > 0) {
      const packs = Math.ceil(results.modules.qsfp_40g_mmf / MODULE_PACK_SIZE)
      steps.push({ text: `Install ${results.modules.qsfp_40g_mmf} QSFP module${results.modules.qsfp_40g_mmf !== 1 ? 's' : ''} (buy ${packs} pack${packs !== 1 ? 's' : ''}) in ${results.totalCores > 0 ? 'Core &' : ''} Aggregation switches`, cat: 'modules' })
    }
    steps.push({ text: `Cable ${results.totalServers} server${results.totalServers !== 1 ? 's' : ''} to their Top of Rack switches (Ethernet)`, cat: 'cable' })
    steps.push({ text: `Cable ${results.totalTors} Top of Rack uplink${results.totalTors !== 1 ? 's' : ''} to Aggregation switches`, cat: 'cable' })
    if (results.totalCores > 0) {
      const links = results.totalAggs * results.effectiveUplinks.coreToAgg
      steps.push({ text: `Cable ${links} fiber connection${links !== 1 ? 's' : ''} from Aggregation to Core switches`, cat: 'cable' })
    }
    if (results.selectedGateway) {
      const target = skipCoreSwitch ? 'Aggregation' : 'Core'
      steps.push({ text: `Connect the ${results.selectedGateway.label} to ${target} switch${(skipCoreSwitch ? results.totalAggs : results.totalCores) > 1 ? 'es' : ''}`, cat: 'cable' })
    }
    return steps
  }, [results, skipCoreSwitch])

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
        <p className="text-gray-400 mb-3">
          Plan your server hardware, rack layouts, and network topology — then follow the build order in-game.
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs mb-10">
          <span className="bg-cyan-500/15 text-cyan-400 px-2.5 py-1 rounded-full font-medium">Gateway</span>
          <span className="text-gray-600">&rarr;</span>
          <span className="bg-red-500/15 text-red-400 px-2.5 py-1 rounded-full font-medium">Core Switch</span>
          <span className="text-gray-600">&rarr;</span>
          <span className="bg-orange-500/15 text-orange-400 px-2.5 py-1 rounded-full font-medium">Aggregation</span>
          <span className="text-gray-600">&rarr;</span>
          <span className="bg-gray-500/15 text-gray-300 px-2.5 py-1 rounded-full font-medium">Top of Rack</span>
          <span className="text-gray-600">&rarr;</span>
          <span className="bg-indigo-500/15 text-indigo-400 px-2.5 py-1 rounded-full font-medium">Servers</span>
        </div>

        {/* ════════════════════════════════════════ */}
        {/*  CUSTOMER PRESET & SAVE/SHARE MERGED   */}
        {/* ════════════════════════════════════════ */}
        {(customers.length > 0) && (
          <section className="mb-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider"><span className="text-indigo-400 mr-1">Step 1</span> &mdash; Customer Preset</h2>
                {selectedCustomer && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    {selectedCustomer && (() => {
                      const iconMap = {
                        'Bermuda Triangle Backup': 'Bermuda Triangle Backup.png',
                        'Dad Joke Database': 'Dad Joke Database.png',
                        'UFO Download Station': 'UFO Download Station.png',
                        'TaxHaven Holdings': 'TaxHeaven.png',
                        'FakeNews Daily': 'FakeNews Daily.png',
                        'Pollution Plus': 'Pollution Plus.png',
                        'ClimateChange Industries': 'ClimateChange Industries.png',
                        'Probability Manufacturing': 'Probability Manufacturing.png',
                        'Counterfeit Good Distribution': 'Counterfeit Goods Distribution.png',
                        'Madeep': 'Madeep.png',
                        'Flat Earth Servers': 'Flat Earth Servers.png',
                        'Wealth Track': 'WealthTrack.png',
                        'Union Busters': 'Union Busterers.png',
                        'Esistential Crisis Cloud': 'Existential Crisis Cloud.png',
                        'Ludus': 'RandR.png',
                        'Healtcare Denial': 'Healthcare Denial.png',
                        'Student Hub': 'StudentHub.png',
                        'Houseplant Emotional Support': 'Houseplant Emotional Support.png',
                        'SockFetish Digital': 'SockFetish Digital.png',
                        'Midlife Crisis Consulting': 'Midlife Crisis Consulting.png',
                        'SimpeHub Premium': 'SimpeHub Premium.png',
                        'Motivational Sloth Network': 'Motivational Sloth Network.png',
                        'RoboticsHub': 'RoboticsHub.png',
                        'Make Mie': 'MAkeMie.png',
                        'Aero Dynasty': 'AeroDynasty.png',
                        'Standard': 'Standard.png',
                        'Richards and Richards': 'RandR.png',
                        'Dewey Chaeatm': 'DeweyCheatem.png',
                        'AeroSpace': 'Aerospace.png',
                        'Bull and Bearly': 'Bull and bearly.png',
                        'Waseku': 'Waseku.png',
                        'Sweatshop Effieciency': 'Sweatshop Efficiency.png',
                        'Pyramid Power': 'Pyramid Power.png',
                        'EvilCorp': 'EvilCorp.png',
                      }
                      const iconFile = iconMap[selectedCustomer.name] || selectedCustomer.image?.replace(/^.*[\\/]/, '')
                      return iconFile ? (
                        <img src={`/DC-Tools/customer-icons/${iconFile}`} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500" />
                      ) : null
                    })()}
                    <span>Active: <strong className="text-white">{selectedCustomer.name}</strong></span>
                  </div>
                )}
              </div>
              <button onClick={() => setPresetOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                Load Customer Preset
              </button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
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
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-4 max-h-64 overflow-y-auto">
                <div className="divide-y divide-gray-800">
                  {savedOffers.map((offer, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDrop={(e) => handleDrop(e, i)}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-3 px-4 py-2 transition-colors"
                      style={{
                        borderLeft: dragOverIndex === i && dragIndex !== i ? '2px solid #6366f1' : '2px solid transparent',
                        opacity: dragIndex === i ? 0.4 : 1,
                      }}
                    >
                      <span className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0" title="Drag to reorder">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
                        </svg>
                      </span>
                      {renamingIdx === i ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => handleRenameOffer(i, renameValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameOffer(i, renameValue)
                            if (e.key === 'Escape') setRenamingIdx(null)
                          }}
                          className="flex-1 bg-gray-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-gray-100 focus:outline-none min-w-0"
                        />
                      ) : (
                        <span className="text-sm text-gray-300 flex-1 truncate min-w-0">{offer.name}</span>
                      )}
                      <span className="text-gray-600 text-xs shrink-0 hidden sm:inline">{new Date(offer.savedAt).toLocaleDateString()}</span>
                      <button
                        onClick={() => { setRenamingIdx(i); setRenameValue(offer.name) }}
                        className="text-gray-600 hover:text-gray-300 cursor-pointer shrink-0 transition-colors"
                        title="Rename"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button onClick={() => loadOffer(offer)} className="text-indigo-400 hover:text-indigo-300 text-xs font-medium shrink-0 transition-colors">Load</button>
                      <button onClick={() => deleteOffer(i)} className="text-red-400 hover:text-red-300 text-xs font-medium shrink-0 transition-colors">Delete</button>
                      <button onClick={() => setPendingOverride({ offer: { ...offer, config: getConfig(), savedAt: new Date().toISOString() }, idx: i })}
                        className="text-yellow-400 hover:text-yellow-300 text-xs font-medium shrink-0 transition-colors">Override</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Override confirmation modal */}
            {pendingOverride && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">Override Saved Setup?</h3>
                  <p className="text-gray-300 mb-4">A setup named <span className="font-bold text-yellow-300">{pendingOverride.offer.name}</span> already exists. Do you want to override it?</p>
                  <div className="flex justify-center gap-4">
                    <button onClick={confirmOverride} className="bg-yellow-500 hover:bg-yellow-400 text-white font-medium px-4 py-2 rounded-lg transition-colors">Override</button>
                    <button onClick={cancelOverride} className="bg-gray-700 hover:bg-gray-600 text-white font-medium px-4 py-2 rounded-lg transition-colors">Cancel</button>
                  </div>
                </div>
              </div>
            )}
            <CustomerPresetModal
              open={presetOpen}
              customers={customers}
              search={presetSearch}
              setSearch={setPresetSearch}
              selectedCustomer={selectedCustomer}
              onSelect={applyCustomer}
              onClose={() => { setPresetOpen(false); setPresetSearch('') }}
            />
          </section>
        )}

        {/* ════════════════════════════════════════ */}
        {/*  SERVER INPUTS                          */}
        {/* ════════════════════════════════════════ */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4"><span className="text-indigo-400 mr-1">Step 2</span> &mdash; IOPS Requirements</h2>
          <p className="text-xs text-gray-500 mb-4">Enter the raw IOPS needed per server type. Servers are auto-calculated using the <strong className="text-gray-400">{(RACK_PRESETS.find(p => p.key === rackPreset) || RACK_PRESETS[0]).label}</strong> rack layout.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SERVER_TYPES.map(t => {
              const val = num(iopsInputs[t.key])
              const activePreset = RACK_PRESETS.find(p => p.key === rackPreset) || RACK_PRESETS[0]
              const { count7u, count3u } = iopsToServers(val, activePreset.per7u, activePreset.per3u)
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
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4"><span className="text-indigo-400 mr-1">Step 3</span> &mdash; Customer Gateway</h2>
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
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4"><span className="text-indigo-400 mr-1">Step 4</span> &mdash; Rack Layout</h2>
          <p className="text-xs text-gray-500 mb-4">Choose how servers are packed into each 47U rack.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {RACK_PRESETS.map(p => {
              const iops = p.per7u * 12000 + p.per3u * 5000
              const usedU = p.per7u * 7 + p.per3u * 3
              const totalU = p.noSwitch ? 47 : 46
              return (
                <button key={p.key} onClick={() => { setRackPreset(p.key); if (p.noSwitch) setDedicatedNetworkRack(true) }}
                  className={`bg-gray-900 border rounded-xl p-4 text-left transition-colors ${rackPreset === p.key ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-gray-800 hover:border-gray-700'}`}>
                  <p className="font-medium text-sm mb-1">{p.label}</p>
                  <p className="text-xs text-gray-500">{p.desc}</p>
                  <p className="text-[10px] text-gray-600 mt-2">{usedU}U / {totalU}U &middot; {iops.toLocaleString()} IOPS/rack</p>
                  {p.noSwitch && <p className="text-[10px] text-amber-500/70 mt-0.5">No Top of Rack switch in rack</p>}
                </button>
              )
            })}
          </div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Options</h3>
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
                {results && !skipCoreSwitch && !redundancyEnabled && results.selectedGateway && results.totalAggs <= results.selectedGateway.maxUplinks && (
                  <p className="text-xs text-green-400 mt-1">Recommended - only {results.totalAggs} Aggregation switch{results.totalAggs !== 1 ? 'es' : ''} needed</p>
                )}
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
            <label className={`flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 select-none ${(RACK_PRESETS.find(p => p.key === rackPreset) || RACK_PRESETS[0]).noSwitch ? 'opacity-60' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={dedicatedNetworkRack || (RACK_PRESETS.find(p => p.key === rackPreset) || RACK_PRESETS[0]).noSwitch}
                onChange={e => setDedicatedNetworkRack(e.target.checked)}
                disabled={(RACK_PRESETS.find(p => p.key === rackPreset) || RACK_PRESETS[0]).noSwitch}
                className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-indigo-500" />
              <div>
                <p className="font-medium text-sm">Dedicated Network Rack</p>
                <p className="text-xs text-gray-500">{(RACK_PRESETS.find(p => p.key === rackPreset) || RACK_PRESETS[0]).noSwitch ? 'Required — all switches moved to network rack' : 'Place all Core & Aggregation switches in a separate rack'}</p>
              </div>
            </label>

          </div>
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
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{results.totalServers}</p>
                  <p className="text-xs text-gray-400 mt-1">Total Servers</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{results.total7u}&times; 7U + {results.total3u}&times; 3U</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{results.totalIOPS.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">IOPS Provided</p>
                  {results.totalIOPS > results.totalIOPSReq && (
                    <p className="text-[10px] text-green-400 mt-0.5">+{(results.totalIOPS - results.totalIOPSReq).toLocaleString()} headroom</p>
                  )}
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{results.totalRacks}</p>
                  <p className="text-xs text-gray-400 mt-1">Racks</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{results.rackList.reduce((s, r) => s + r.freeU, 0)}U free space</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{results.totalTors + results.totalAggs + results.totalCores}</p>
                  <p className="text-xs text-gray-400 mt-1">Switches</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{results.totalTors} ToR + {results.totalAggs} Agg{results.totalCores > 0 ? ` + ${results.totalCores} Core` : ''}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">{results.totalBandwidth.toFixed(1)} <span className="text-base font-normal text-gray-500">Gb/s</span></p>
                  <p className="text-xs text-gray-400 mt-1">Throughput</p>
                </div>
                <div className="bg-gray-900 border border-green-500/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">${results.totalCost.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">Total Cost</p>
                </div>
              </div>
            </section>

            {/* ── Build Order ──────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">In-Game Build Order</h2>
              <p className="text-xs text-gray-500 mb-4">Follow these steps in order to set up your infrastructure in the game.</p>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <ol className="space-y-2.5">
                  {buildSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                        step.cat === 'cable' ? 'bg-green-500/20 text-green-400' :
                        step.cat === 'modules' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-indigo-500/20 text-indigo-400'
                      }`}>{i + 1}</span>
                      <span className="text-sm text-gray-300 pt-0.5">{step.text}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-800 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500/40" /> Hardware placement</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" /> Module installation</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500/40" /> Cabling</span>
                </div>
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
                  Top of Rack Switch
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
            <details className="group" open>
              <summary className="flex items-center gap-2 cursor-pointer list-none select-none mb-4 [&::-webkit-details-marker]:hidden">
                <svg className="w-3.5 h-3.5 text-gray-500 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 2l4 4-4 4"/></svg>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Network Topology</h2>
              </summary>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <TopologyDiagram data={results.topoData} />
              </div>
            </details>

            {/* ── LAG / Throughput Summary ──────── */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer list-none select-none mb-4 [&::-webkit-details-marker]:hidden">
                <svg className="w-3.5 h-3.5 text-gray-500 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 2l4 4-4 4"/></svg>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Link Aggregation (LAG) Summary</h2>
                <span className="text-[10px] text-gray-600 ml-1">advanced</span>
              </summary>
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
                      <td className="px-4 py-2 text-gray-300">Aggregation &rarr; Top of Rack</td>
                      <td className="px-4 py-2 text-right">{results.lagSummary.aggToTor.links}</td>
                      <td className="px-4 py-2 text-right font-bold">{results.lagSummary.aggToTor.throughput}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{results.lagSummary.aggToTor.required.toFixed(2)} Gb/s</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-gray-300">Top of Rack &rarr; Server</td>
                      <td className="px-4 py-2 text-right">{results.lagSummary.torToServer.links}</td>
                      <td className="px-4 py-2 text-right font-bold">{results.lagSummary.torToServer.throughput}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{results.lagSummary.torToServer.required.toFixed(2)} Gb/s</td>
                    </tr>
                  </tbody>
                </table>
                {redundancyEnabled && (
                  <div className="px-4 py-3 border-t border-gray-800 text-xs text-indigo-400">
                    Redundancy active &mdash; dual redundant paths: 2 Top of Rack switches per rack, 1 dedicated Agg per Top of Rack, {results.totalCores} Core switches, {results.effectiveUplinks.gwToCore} GW links.
                  </div>
                )}
              </div>
            </details>

            {/* ── Switch Breakdown ──────────────── */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer list-none select-none mb-4 [&::-webkit-details-marker]:hidden">
                <svg className="w-3.5 h-3.5 text-gray-500 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 2l4 4-4 4"/></svg>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Switch & Device Breakdown</h2>
                <span className="text-[10px] text-gray-600 ml-1">advanced</span>
              </summary>
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
                  <p className="text-xs text-gray-500">{results.torsPerAgg} Top of Rack per Agg (max)</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-400 text-lg">&#9642;</span>
                    <span className="font-medium text-sm">Top of Rack Switches</span>
                  </div>
                  <p className="text-2xl font-bold">{results.totalTors}</p>
                  <p className="text-xs text-gray-500">{TOR_PORTS} Ethernet ports each</p>
                  <p className="text-xs text-gray-500">{results.serversPerTor} servers per Top of Rack (max)</p>
                </div>
              </div>
            </details>

            {/* ── Reference ─────────────────────── */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer list-none select-none mb-4 [&::-webkit-details-marker]:hidden">
                <svg className="w-3.5 h-3.5 text-gray-500 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4.5 2l4 4-4 4"/></svg>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Reference</h2>
                <span className="text-[10px] text-gray-600 ml-1">game specs</span>
              </summary>
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
                    <tr><td className="px-4 py-2 text-gray-300">Active rack layout</td><td className="px-4 py-2">{(() => { const p = RACK_PRESETS.find(p => p.key === rackPreset) || RACK_PRESETS[0]; return `${p.noSwitch ? '0' : SWITCH_RESERVED_U}U switches${p.per3u > 0 ? ` + ${p.per3u}×3U` : ''}${p.per7u > 0 ? ` + ${p.per7u}×7U` : ''}` })()}</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">3U Server</td><td className="px-4 py-2">5,000 IOPS</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">7U Server</td><td className="px-4 py-2">12,000 IOPS</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Top of Rack Switch</td><td className="px-4 py-2">{TOR_PORTS} x Ethernet ports (fixed, no modules)</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Aggregation Switch</td><td className="px-4 py-2">{AGG_SFP_PORTS} x SFP + {AGG_QSFP_PORTS} x QSFP (Agg&rarr;Top of Rack is Ethernet)</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Core Switch</td><td className="px-4 py-2">{CORE_QSFP_PORTS} x QSFP</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">SFP Modules</td><td className="px-4 py-2">10Gb SMF &middot; 25Gb SMF &middot; 10Gb Ethernet</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">QSFP Modules</td><td className="px-4 py-2">40Gb Multi Mode Fibre</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Module packs</td><td className="px-4 py-2">Sold in packs of {MODULE_PACK_SIZE}</td></tr>
                    {GATEWAY_TYPES.map(gw => (
                      <tr key={gw.key}><td className="px-4 py-2 text-gray-300">{gw.label}</td><td className="px-4 py-2">{gw.desc}</td></tr>
                    ))}
                    <tr><td className="px-4 py-2 text-gray-300">Server types</td><td className="px-4 py-2">GPU &middot; RISC &middot; System &middot; Mainframe</td></tr>
                    <tr><td className="px-4 py-2 text-gray-300">Network flow</td><td className="px-4 py-2">Gateway &rarr; Core &rarr; Aggregation &rarr; Top of Rack &rarr; Servers</td></tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
