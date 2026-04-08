import React from 'react'

export default function CustomerPresetModal({ open, customers, search, setSearch, selectedCustomer, onSelect, onClose }) {
  const filtered = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  return open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-lg">Select Customer</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-3 border-b border-gray-800">
          <input type="text" placeholder="Search customers…" autoFocus value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="overflow-y-auto flex-1 p-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No customers found.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {filtered.map(c => {
                const r = c.requirements
                const totalIops = r.system.iops + r.risc.iops + r.mainframe.iops + r.gpu.iops
                // Patch image path
                // Map company name to actual icon file (case-insensitive, spaces/typos handled)
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
                const iconFile = iconMap[c.name] || c.image?.replace(/^.*[\\/]/, '')
                const img = iconFile ? `/DC-Tools/customer-icons/${iconFile}` : null
                return (
                  <button key={c.id} onClick={() => onSelect(c)}
                    className={`text-left rounded-xl p-3 border transition-colors ${selectedCustomer?.id === c.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-800 hover:border-gray-600 bg-gray-800/40 hover:bg-gray-800'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      {img ? (
                        <img src={img} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 border-2 border-indigo-400" />
                      ) : (
                        <span className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-lg font-bold text-gray-400 shrink-0">{c.name.charAt(0)}</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-100 truncate">{c.name}</p>
                        <p className="text-[10px] text-gray-500">{c.switch} &middot; {c.rep} rep</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[10px]">
                      {r.system.iops > 0 && (
                        <span className="bg-yellow-500/15 text-yellow-400 rounded px-1.5 py-0.5 text-center truncate" title="System X">SYS {(r.system.iops / 1000).toFixed(0)}k</span>
                      )}
                      {r.risc.iops > 0 && (
                        <span className="bg-blue-500/15 text-blue-400 rounded px-1.5 py-0.5 text-center truncate" title="RISC">RISC {(r.risc.iops / 1000).toFixed(0)}k</span>
                      )}
                      {r.mainframe.iops > 0 && (
                        <span className="bg-purple-500/15 text-purple-400 rounded px-1.5 py-0.5 text-center truncate" title="Mainframe">MF {(r.mainframe.iops / 1000).toFixed(0)}k</span>
                      )}
                      {r.gpu.iops > 0 && (
                        <span className="bg-green-500/15 text-green-400 rounded px-1.5 py-0.5 text-center truncate" title="GPU">GPU {(r.gpu.iops / 1000).toFixed(0)}k</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1.5">Total: {totalIops.toLocaleString()} IOPS</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null
}
