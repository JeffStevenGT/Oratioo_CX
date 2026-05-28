import sys
sys.stdout.reconfigure(encoding='utf-8')

# ─────────────────────────────────────────────
# 1. Documentos.jsx → Agrupar por día
# ─────────────────────────────────────────────
path_docs = r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\pages\Documentos.jsx'
with open(path_docs, 'r', encoding='utf-8') as f:
    docs = f.read()

old_tbody = '''            <tr className="border-b border-oratioo-border">
                <th className="table-header px-3 py-2">Archivo</th>
                <th className="table-header px-3 py-2">DNIs</th>
                <th className="table-header px-3 py-2">Fecha</th>
                <th className="table-header px-3 py-2">Estado</th>
                <th className="table-header px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <tr><td colSpan={5} className="text-center py-8"><Loader2 size={20} className="animate-spin text-oratioo-purple mx-auto" /></td></tr>
              ) : uploaded.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-oratioo-gray text-sm">Aún no hay cargas registradas</td></tr>
              ) : (
                uploaded.map(h => {
                  const enProgreso = analyzing && h.estado !== 'completado'
                  return (
                    <tr key={h.id} className="border-b border-oratioo-border hover:bg-oratioo-light/30">
                      <td className="table-cell !py-2 text-xs">{h.nombre_archivo}</td>
                      <td className="table-cell !py-2 text-xs">{h.total_dnis}</td>
                      <td className="table-cell !py-2 text-xs text-oratioo-gray">
                        {h.created_at ? new Date(h.created_at).toLocaleString('es') : '—'}
                      </td>
                      <td className="table-cell !py-2">
                        {h.estado === 'analizando' || enProgreso ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-purple-50 text-purple-700 border border-purple-200">
                            <Loader2 size={10} className="animate-spin" /> Analizando...
                          </span>
                        ) : h.estado === 'completado' ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={10} /> Completado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-blue-50 text-blue-600 border border-blue-200">
                            <Database size={10} /> Cargado
                          </span>
                        )}
                      </td>
                      <td className="table-cell !py-2">
                        {deletingId === h.id ? (
                          <Loader2 size={12} className="animate-spin text-red-400" />
                        ) : (
                          <button onClick={() => handleDeleteDocument(h)}
                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                            title="Eliminar documento">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>'''

new_tbody = '''            <tr className="border-b border-oratioo-border">
                <th className="table-header px-3 py-2">Día</th>
                <th className="table-header px-3 py-2">Documentos</th>
                <th className="table-header px-3 py-2">Total DNIs</th>
                <th className="table-header px-3 py-2">Estado</th>
                <th className="table-header px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <tr><td colSpan={5} className="text-center py-8"><Loader2 size={20} className="animate-spin text-oratioo-purple mx-auto" /></td></tr>
              ) : uploaded.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-oratioo-gray text-sm">Aún no hay cargas registradas</td></tr>
              ) : (
                (() => {
                  // Agrupar por día
                  const grupos = {}
                  for (const h of uploaded) {
                    const dia = h.created_at ? h.created_at.split('T')[0] : 'sin_fecha'
                    if (!grupos[dia]) grupos[dia] = { dia, docs: [], totalDnis: 0, completados: 0, analizando: 0, pendientes: 0 }
                    grupos[dia].docs.push(h)
                    grupos[dia].totalDnis += (h.total_dnis || 0)
                    if (h.estado === 'completado') grupos[dia].completados++
                    else if (h.estado === 'analizando') grupos[dia].analizando++
                    else grupos[dia].pendientes++
                  }
                  return Object.values(grupos).sort((a, b) => b.dia.localeCompare(a.dia)).map(grupo => {
                    const todoCompletado = grupo.completados === grupo.docs.length
                    const algunAnalizando = grupo.analizando > 0
                    return (
                      <tr key={grupo.dia} className="border-b border-oratioo-border hover:bg-oratioo-light/30">
                        <td className="table-cell !py-2 text-xs font-medium">
                          {new Date(grupo.dia + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </td>
                        <td className="table-cell !py-2 text-xs">{grupo.docs.length}</td>
                        <td className="table-cell !py-2 text-xs">{grupo.totalDnis.toLocaleString()}</td>
                        <td className="table-cell !py-2">
                          {algunAnalizando ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-purple-50 text-purple-700 border border-purple-200">
                              <Loader2 size={10} className="animate-spin" /> {grupo.analizando} analizando
                            </span>
                          ) : todoCompletado ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={10} /> Completo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-blue-50 text-blue-600 border border-blue-200">
                              <Database size={10} /> {grupo.pendientes} pendientes
                            </span>
                          )}
                        </td>
                        <td className="table-cell !py-2">
                          <button onClick={() => {
                            const docsDelDia = grupo.docs.map(d => `${d.nombre_archivo} (${d.total_dnis} DNIs - ${d.estado || 'cargado'})`).join('\\n')
                            alert(`Documentos del ${new Date(grupo.dia + 'T12:00:00').toLocaleDateString('es')}:\\n\\n` + docsDelDia)
                          }}
                            className="text-xs text-oratioo-purple hover:text-purple-800 hover:bg-purple-50 p-1.5 rounded-lg transition-all"
                            title="Ver documentos del día">
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                })()
              )}
            </tbody>'''

if old_tbody in docs:
    docs = docs.replace(old_tbody, new_tbody, 1)
    with open(path_docs, 'w', encoding='utf-8') as f:
        f.write(docs)
    print('✅ Documentos.jsx actualizado (agrupado por día)')
else:
    print('❌ Documentos.jsx: patrón no encontrado')
    idx = docs.find('<tr className="border-b border-oratioo-border">')
    ctx_start = max(0, idx - 50)
    print('Contexto:', repr(docs[ctx_start:ctx_start+300]))

# ─────────────────────────────────────────────
# 2. Dashboard.jsx → Chart adaptativo al período
# ─────────────────────────────────────────────
path_dash = r'C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\web\src\pages\Dashboard.jsx'
with open(path_dash, 'r', encoding='utf-8') as f:
    dash = f.read()

# Replace the chart data building section (inside fetchData)
old_chart = '''      // Chart: \u00faltimos 7 d\u00edas (todos los procesados)
      const last7 = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        const dayLabel = d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' })
        const count = todosProcesados.filter(c => c.created_at && c.created_at.split('T')[0] === dateStr).length
        last7.push({ day: dayLabel, Procesados: count })
      }
      setChartData(last7)'''

# Also need to handle hardcoded "Últimos 7 días" label
old_chart += '\n      setChartData(last7)'

# Let me find the exact chart section using a different approach
idx_chart = dash.find('// Chart: últimos 7 días')
if idx_chart >= 0:
    ctx_before = dash[:idx_chart]
    ctx_after = dash[idx_chart:]
    # Find the end of this block (two consecutive setChartData calls)
    end_idx = ctx_after.find('      setChartData(last7)')
    if end_idx >= 0:
        end_idx += len('      setChartData(last7)')
    
    new_chart_code = '''      // Chart: según período seleccionado
      let dataPoints
      let label
      if (p === 'hoy') {
        // Horas del día
        dataPoints = []
        const ahora = new Date()
        const hoyStr = ahora.toISOString().split('T')[0]
        for (let i = 0; i < 24; i++) {
          const hh = String(i).padStart(2, '0')
          const inicio = new Date(hoyStr + 'T' + hh + ':00:00')
          const fin = new Date(hoyStr + 'T' + hh + ':59:59')
          const count = todosProcesados.filter(c => {
            const f = new Date(c.created_at)
            return f >= inicio && f <= fin
          }).length
          dataPoints.push({ day: hh + ':00', Procesados: count })
        }
        label = 'Hoy (por hora)'
      } else if (p === 'semana' || p === 'mes') {
        // Días del período
        const fechaCorte = getDateFilter(p)
        const diffDays = p === 'semana' ? 7 : Math.ceil((Date.now() - fechaCorte.getTime()) / 86400000)
        dataPoints = []
        for (let i = diffDays - 1; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const dateStr = d.toISOString().split('T')[0]
          const dayLabel = d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' })
          const count = todosProcesados.filter(c => c.created_at && c.created_at.split('T')[0] === dateStr).length
          dataPoints.push({ day: dayLabel, Procesados: count })
        }
        label = p === 'semana' ? 'Últimos 7 días' : 'Este mes (por día)'
      } else {
        // Trimestre/6m/todo → por semana
        dataPoints = []
        const semanas = {}
        for (const c of todosProcesados) {
          if (!c.created_at) continue
          const d = new Date(c.created_at)
          const weekStart = new Date(d)
          weekStart.setDate(d.getDate() - d.getDay())
          const key = weekStart.toISOString().split('T')[0]
          semanas[key] = (semanas[key] || 0) + 1
        }
        dataPoints = Object.entries(semanas)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-24)
          .map(([key, count]) => {
            const d = new Date(key + 'T12:00:00')
            return { day: d.toLocaleDateString('es', { day: 'numeric', month: 'short' }), Procesados: count }
          })
        label = 'Por semana'
      }
      setChartData(dataPoints)'''

    dash = dash[:idx_chart] + new_chart_code + dash[idx_chart + end_idx:]
    
    # Update the chart label
    old_label = '''          <h3 className="text-xs font-semibold text-[#7c757c] uppercase tracking-wider">Procesados por d\u00eda</h3>
          <span className="text-[10px] text-[#7c757c]">\u00daltimos 7 d\u00edas</span>'''
    
    new_label = '''          <h3 className="text-xs font-semibold text-[#7c757c] uppercase tracking-wider">Procesados</h3>
          <span className="text-[10px] text-[#7c757c]">{periodo === 'all' ? 'Todo' : periodo.charAt(0).toUpperCase() + periodo.slice(1)}</span>'''
    
    if old_label in dash:
        dash = dash.replace(old_label, new_label, 1)
    else:
        print('⚠️  Dashboard.jsx: label no encontrado, se deja igual')
    
    with open(path_dash, 'w', encoding='utf-8') as f:
        f.write(dash)
    print('✅ Dashboard.jsx actualizado (chart adaptativo al período)')
else:
    print('❌ Dashboard.jsx: no se encontró el bloque del chart')
