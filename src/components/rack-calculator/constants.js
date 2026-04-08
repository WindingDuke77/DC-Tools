// ═══════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════
export const RACK_TOTAL_U = 47
export const SWITCH_RESERVED_U = 1
export const AVAILABLE_U = RACK_TOTAL_U - SWITCH_RESERVED_U // 46
export const CORE_SWITCH_U = 1
export const AGG_SWITCH_U = 1

export const SERVER_TYPES = [
  { key: 'system', label: 'System X', color: '#eab308', emoji: '🟡' },
  { key: 'risc', label: 'RISC', color: '#3b82f6', emoji: '🔵' },
  { key: 'mainframe', label: 'Mainframe', color: '#a855f7', emoji: '🟣' },
  { key: 'gpu', label: 'GPU', color: '#22c55e', emoji: '🟢' },
]

export const TOR_PORTS = 16
export const AGG_SFP_PORTS = 16
export const AGG_QSFP_PORTS = 4
export const CORE_QSFP_PORTS = 32
export const QSFP_SPEED = 40

export const GATEWAY_TYPES = [
  { key: 'small', label: '2 SFP + 2 Ethernet Gateway', desc: 'For the starting customers', maxUplinks: 2, corePortType: 'sfp' },
  { key: 'medium', label: '16 SFP + 4 QSFP Gateway', desc: 'For the mid to late game customers', maxUplinks: 4, corePortType: 'qsfp' },
  { key: 'large', label: '32 QSFP Gateway', desc: 'For the late game customers', maxUplinks: 32, corePortType: 'qsfp' },
]

export const SFP_MODULE_OPTIONS = [

  { key: 'sfp_10g_eth', label: '10Gb Ethernet', speed: 10 },
]

export const MODULE_PACK_SIZE = 5

// ═══════════════════════════════════════════════
//  In-game Prices
// ═══════════════════════════════════════════════
export const SERVER_PRICES = {
  system: { '3u': 400, '7u': 1600 },
  risc:   { '3u': 450, '7u': 1750 },
  mainframe: { '3u': 850, '7u': 2000 },
  gpu:    { '3u': 550, '7u': 2200 },
}
export const SWITCH_PRICES = {
  tor: 250,   // 16 x 10Gbps RJ45
  core: 3800, // 32 x QSFP+
  agg: 3500,  // 4 x QSFP+ 16 x SFP+/SFP28
}
export const RACK_PRICE = 1250
export const GATEWAY_PRICES = { small: 0, medium: 0, large: 0 }
export const MODULE_PRICES = {
  sfp_pack: 250,  // 5x SFP+ Modules RJ45 10Gbps
  qsfp_pack: 500, // 5x QSFP+ Module Fiber (estimated)
}

// Derived
export const RACK_7U_PER = 6
export const RACK_3U_PER = 1
