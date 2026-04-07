export default function TopologyDiagram({ data }) {
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
