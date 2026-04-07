import {
  RACK_TOTAL_U, SWITCH_RESERVED_U, MODULE_PACK_SIZE, SFP_MODULE_OPTIONS,
  RACK_7U_PER,
} from './constants'

export const num = (v) => Math.max(0, parseInt(v) || 0)
export const ceilToPack = (n) => Math.ceil(n / MODULE_PACK_SIZE) * MODULE_PACK_SIZE
export const getSfpSpeed = (key) => (SFP_MODULE_OPTIONS.find(m => m.key === key)?.speed ?? 10)

export function buildRack(servers, typeLabel, torU = SWITCH_RESERVED_U) {
  const c7 = servers.filter(s => s.size === 7).length
  const c3 = servers.filter(s => s.size === 3).length
  const usedU = torU + c7 * 7 + c3 * 3
  return {
    label: typeLabel, servers, count7u: c7, count3u: c3,
    totalServers: servers.length, usedU, freeU: RACK_TOTAL_U - usedU,
    torCount: 0, torU, coreSwitches: 0, aggSwitches: 0,
  }
}

export function iopsToServers(iops) {
  if (iops <= 0) return { count7u: 0, count3u: 0 }

  let count7u = 0, count3u = 0
  let remaining = iops
  let slot = 0 // 0..5 = 7U slots, 6 = 3U slot

  while (remaining > 0) {
    if (slot < RACK_7U_PER) {
      count7u++
      remaining -= 12000
      slot++
    } else {
      count3u++
      remaining -= 5000
      slot = 0 // rack complete, start next
    }
  }

  return { count7u, count3u }
}
