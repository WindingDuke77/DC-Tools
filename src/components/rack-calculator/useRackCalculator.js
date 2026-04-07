import { useMemo } from 'react'
import {
  RACK_TOTAL_U, SWITCH_RESERVED_U, CORE_SWITCH_U, AGG_SWITCH_U,
  SERVER_TYPES, TOR_PORTS, AGG_SFP_PORTS, AGG_QSFP_PORTS,
  CORE_QSFP_PORTS, QSFP_SPEED, GATEWAY_TYPES, SFP_MODULE_OPTIONS,
  MODULE_PACK_SIZE, SERVER_PRICES, SWITCH_PRICES, RACK_PRICE,
  GATEWAY_PRICES, MODULE_PRICES, RACK_7U_PER, RACK_3U_PER,
} from './constants'
import { num, ceilToPack, getSfpSpeed, buildRack, iopsToServers } from './helpers'

export default function useRackCalculator({ iopsInputs, gatewayType, fallbackEnabled, mixedRacks, dedicatedNetworkRack, moduleTypes }) {
  return useMemo(() => {
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
    let coreToAggLinks = 1
    let gwToCoreLinks = 1
    let gwMaxThroughput = 0
    let gwInsufficient = false
    if (!fallbackEnabled) {
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

    // ── Pack servers into racks ──
    const torU = fallbackEnabled ? 2 : SWITCH_RESERVED_U
    const serverU = RACK_TOTAL_U - torU
    const rackList = []
    if (mixedRacks) {
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
        while (uLeft >= 7 && i7 < sv7.length) { rackSv.push(sv7[i7++]); uLeft -= 7 }
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
          while (uLeft >= 7 && rem7 > 0) { rackSv.push({ type: t.key, size: 7 }); rem7--; uLeft -= 7 }
          while (uLeft >= 3 && rem3 > 0) { rackSv.push({ type: t.key, size: 3 }); rem3--; uLeft -= 3 }
          if (rackSv.length === 0) break
          rackList.push(buildRack(rackSv, t.label, torU))
        }
      }
    }

    // ── ToR Switches ──
    const torServerPorts = TOR_PORTS - 1
    const serversPerTor = torServerPorts > 0 ? torServerPorts : 1
    const baseTorsPerRack = rackList.map(r => serversPerTor > 0 ? Math.max(1, Math.ceil(r.totalServers / serversPerTor)) : 1)
    const torsPerRack = fallbackEnabled ? baseTorsPerRack.map(t => t * 2) : baseTorsPerRack
    const totalTors = torsPerRack.reduce((s, t) => s + t, 0)

    // ── Aggregation Switches ──
    let torsPerAgg, totalAggs, aggsPerPath = 0
    if (fallbackEnabled) {
      torsPerAgg = AGG_SFP_PORTS
      const torsPerPath = Math.ceil(totalTors / 2)
      aggsPerPath = Math.max(1, Math.ceil(torsPerPath / torsPerAgg))
      totalAggs = aggsPerPath * 2
    } else {
      torsPerAgg = AGG_SFP_PORTS
      totalAggs = torsPerAgg > 0 ? Math.ceil(totalTors / torsPerAgg) : 0
    }

    // ── Core Switches ──
    let totalCores
    if (fallbackEnabled) {
      const aggsPerPath2 = Math.ceil(totalAggs / 2)
      const gwPortsPerCore = selectedGw ? 1 : 0
      const portsPerPath = aggsPerPath2 + gwPortsPerCore
      totalCores = Math.max(2, Math.ceil(portsPerPath / CORE_QSFP_PORTS) * 2)
      gwToCoreLinks = selectedGw ? totalCores : 0
    } else {
      const corePortsForAggs = totalAggs * coreToAggLinks
      const corePortsForGw = selectedGw ? Math.min(gwToCoreLinks, selectedGw.maxUplinks) : 0
      const totalCorePortsNeeded = corePortsForAggs + corePortsForGw
      totalCores = totalCorePortsNeeded > 0 ? Math.ceil(totalCorePortsNeeded / CORE_QSFP_PORTS) : 1
    }

    // Effective link counts
    const eff = {
      torToServer: 1,
      aggToTor: 1,
      coreToAgg: fallbackEnabled ? 1 : coreToAggLinks,
      gwToCore: gwToCoreLinks,
    }

    if (fallbackEnabled && selectedGw && selectedGw.maxUplinks < totalCores) {
      gwInsufficient = true
    }

    // ── Assign ToR counts ──
    rackList.forEach((r, i) => { r.torCount = torsPerRack[i] })

    // ── Place Core & Agg switches into racks ──
    const switchesToPlace = []
    for (let i = 0; i < totalCores; i++) switchesToPlace.push({ kind: 'core', u: CORE_SWITCH_U })
    for (let i = 0; i < totalAggs; i++) switchesToPlace.push({ kind: 'agg', u: AGG_SWITCH_U })

    if (dedicatedNetworkRack) {
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
    const aggToTorTotalLinks = totalTors * eff.aggToTor
    modules.sfp_10g_eth += aggToTorTotalLinks
    const coreToAggTotalLinks = totalAggs * eff.coreToAgg
    modules.qsfp_40g_mmf += coreToAggTotalLinks * 2
    if (selectedGw) {
      const gwUp = Math.min(eff.gwToCore, selectedGw.maxUplinks)
      if (selectedGw.corePortType === 'sfp') {
        modules[moduleTypes.gwToCore] = (modules[moduleTypes.gwToCore] || 0) + gwUp
        modules.qsfp_40g_mmf += gwUp
      } else {
        modules.qsfp_40g_mmf += gwUp * 2
      }
    }

    // ── Throughput / LAG ──
    const maxRackBandwidth = RACK_7U_PER * 0.6 + RACK_3U_PER * 0.25
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

    // ── Topology data ──
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
      const torsPerPath = Math.ceil(totalTors / 2)
      let pathAssigned = 0
      for (let p = 0; p < aggsPerPath; p++) {
        const pathCount = Math.min(torsPerAgg, torsPerPath - pathAssigned)
        if (pathCount > 0) {
          const rackCount = pathCount
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

    if (selectedGw) {
      for (let ci = 0; ci < totalCores; ci++) topoEdges.push({ from: 'gw_1', to: `core_${ci}`, color: '#06b6d4' })
    }
    if (fallbackEnabled && aggsPerPath > 0) {
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
    for (const tg of torGroupNodes) {
      topoEdges.push({ from: `agg_${tg.aggA}`, to: tg.id, color: '#f97316' })
      if (tg.aggB !== undefined) topoEdges.push({ from: `agg_${tg.aggB}`, to: tg.id, color: '#f97316' })
    }

    if (selectedGw) {
      const gwSpd = selectedGw.corePortType === 'sfp' ? getSfpSpeed(moduleTypes.gwToCore) : QSFP_SPEED
      topoLagLabels.push({ label: `${eff.gwToCore}\u00d7 ${gwSpd}Gb = ${eff.gwToCore * gwSpd}Gb`, color: '#06b6d4' })
    }
    topoLagLabels.push({ label: `${eff.coreToAgg}\u00d7 ${QSFP_SPEED}Gb = ${eff.coreToAgg * QSFP_SPEED}Gb`, color: '#ef4444' })
    topoLagLabels.push({ label: `${eff.aggToTor}\u00d7 10Gb = ${eff.aggToTor * 10}Gb`, color: '#f97316' })

    return {
      servers, totalServers, total3u, total7u, totalIOPS, totalIOPSReq: totalIOPSRequested, totalBandwidth,
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
}
