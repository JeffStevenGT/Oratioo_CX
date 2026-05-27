import { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Loader2,
  RefreshCw,
  ArrowUpDown,
  Users,
  ChevronDown,
  ChevronUp,
  X,
  UserPlus,
  Send,
} from 'lucide-react'
import { supabase, TABLA_CLIENTES, TABLA_PERFILES, TABLA_EQUIPOS } from '../supabaseClient'
import FilaExpandible from '../components/FilaExpandible'
import ExportButtons from '../components/ExportButtons'


// ── Opciones de filtros ─────────────────────────────────────────

const VARIANTES_VALIOSAS = [
  { key: 'maximo', label: 'Máx descuento', bd: 'Renove mixto al mejor precio con máximo descuento', color: 'emerald' },
  { key: 'con_descuento', label: 'Con descuento', bd: 'Renove mixto al mejor precio con descuento', color: 'blue' },
  { key: 'mejor_precio', label: 'Mejor precio', bd: 'Renove mixto al mejor precio', color: 'amber' },
]

const VARIANTES_MENORES = [
  { key: 'multidispositivo', label: 'Multidispositivo', color: 'slate' },
  { key: 'otros', label: 'Otros', color: 'slate' },
]

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' })
  const [cimaFilter, setCimaFilter] = useState(null) // null | 'SI' | 'NO'
  const [renoveFilter, setRenoveFilter] = useState(null) // null | 'SI' | 'NO'
  const [variantesActivas, setVariantesActivas] = useState([])
  const [tagsActivas, setTagsActivas] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandido, setExpandido] = useState(null)
  const showAssignBtn = true
  const [assignModal, setAssignModal] = useState(false)
  const [assignEquipoId, setAssignEquipoId] = useState('')
  const [assignAsesorId, setAssignAsesorId] = useState('')
  const [equipos, setEquipos] = useState([])
  const [asesoresEquipo, setAsesoresEquipo] = useState([])
  const [assigning, setAssigning] = useState(false)
  const [assignMsg, setAssignMsg] = useState('')
  const [assignCantidad, setAssignCantidad] = useState('')
  const [clientesPage, setClientesPage] = useState(1)
  const [clientesPageSize, setClientesPageSize] = useState(10)

  const fetchClientes = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(TABLA_CLIENTES)
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      let clientes = data || []



      setClientes(clientes)
    } catch (err) {
      console.error('Error fetching clientes:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchClientes() }, [])

  // ── Reset paginación cuando cambian filtros ────────────────────
  useEffect(() => { setClientesPage(1) }, [cimaFilter, renoveFilter, variantesActivas, tagsActivas, dateFrom, dateTo, search])



  // ── Añadir/quitar filtros ──────────────────────────────────────

  // ── Filtrado + búsqueda ────────────────────────────────────────

  // Agrupar por DNI: si un cliente tiene CIMA en UNA linea y Renove en OTRA, mostrar
  const filtered = useMemo(() => {
    // 1. Agrupar por DNI
    const grupos = {}
    for (const c of clientes) {
      const ad = c.atributos_dinamicos || {}
      if (ad.estado !== 'completado') continue
      const dni = c.dni
      if (!grupos[dni]) {
        grupos[dni] = {
          dni: dni,
          nombre: c.nombre || ad.datos_basicos?.nombre || '',
          created_at: c.created_at,
          _lineas: [],
          _cima: false,
          _renove_mixto: false,
          _variantes: new Set(),
        }
      }
      const g = grupos[dni]
      g._lineas.push(c)
      if (ad.cima === 'SI') g._cima = true
      if (ad.tiene_renove_mixto) g._renove_mixto = true
      if (ad.renove_mixto_variante && ad.renove_mixto_variante !== 'N/A') {
        g._variantes.add(ad.renove_mixto_variante)
      }
      // Usar datos de la primera linea para mostrar
      if (g._lineas.length === 1) {
        g.linea = c.linea
        g.paquete = c.paquete
        g.atributos_dinamicos = {
          cima: ad.cima,
          tiene_renove_mixto: ad.tiene_renove_mixto,
          renove_mixto_variante: ad.renove_mixto_variante || 'N/A',
          datos_basicos: ad.datos_basicos,
          linea: ad.linea,
          pestanas: ad.pestanas,
          pipeline: ad.pipeline,
          estado: 'completado',
        }
      }
    }

    let result = Object.values(grupos)

    // Actualizar atributos_dinamicos con datos agregados (CIMA y Renove)
    for (const g of result) {
      const variantesArr = Array.from(g._variantes)
      g.atributos_dinamicos = g.atributos_dinamicos || {}
      g.atributos_dinamicos.cima = g._cima ? 'SI' : 'NO'
      g.atributos_dinamicos.tiene_renove_mixto = g._renove_mixto
      // Solo mostrar la variante de MAYOR valor (prioridad ordenada)
      const PRIORIDAD_RENOVE = [
        'Renove mixto al mejor precio con máximo descuento',  // más valioso
        'Renove mixto al mejor precio con descuento',
        'Renove mixto al mejor precio',
        'Renove mixto',
        'Renove Multidispositivo',
      ]
      let mejorVariante = 'N/A'
      if (variantesArr.length > 0) {
        for (const p of PRIORIDAD_RENOVE) {
          if (variantesArr.some(v => v === p)) {
            mejorVariante = p
            break
          }
        }
        if (mejorVariante === 'N/A') {
          // Si ninguna coincide con la lista, mostrar la primera encontrada
          mejorVariante = variantesArr[0]
        }
      }
      g.atributos_dinamicos.renove_mixto_variante = mejorVariante
      g.atributos_dinamicos.estado = 'completado'
    }

    // ── Aplicar TODOS los filtros activos (AND) ──
    // CIMA (si ALGUNA linea tiene CIMA)
    if (cimaFilter === 'SI') {
      result = result.filter((g) => g._cima)
    } else if (cimaFilter === 'NO') {
      result = result.filter((g) => !g._cima)
    }

    // Renove Mixto (SOLO las 4 variantes que nos interesan, NO Multidispositivo)
    const VARIANTES_RENOVE_MIXTO = [
      'Renove mixto al mejor precio con máximo descuento',
      'Renove mixto al mejor precio con descuento',
      'Renove mixto al mejor precio',
      'Renove mixto',
    ]
    if (renoveFilter === 'SI') {
      result = result.filter((g) =>
        g._variantes.size > 0 && [...g._variantes].some(v => VARIANTES_RENOVE_MIXTO.includes(v))
      )
    } else if (renoveFilter === 'NO') {
      result = result.filter((g) =>
        !([...g._variantes].some(v => VARIANTES_RENOVE_MIXTO.includes(v)))
      )
    }

    // Variantes de Renove (OR acumulativo — se suman)
    if (variantesActivas.length > 0) {
      result = result.filter((g) =>
        variantesActivas.some(vk => {
          const vData = VARIANTES_VALIOSAS.find(x => x.key === vk)
          return vData && g._variantes.has(vData.bd)
        })
      )
    }

    // Tags/Otros (OR acumulativo — se suman)
    const VARIANTES_CONOCIDAS = [
      'Renove Multidispositivo',
      'Renove mixto al mejor precio con máximo descuento',
      'Renove mixto al mejor precio con descuento',
      'Renove mixto al mejor precio',
      'Renove mixto',
    ]
    if (tagsActivas.length > 0) {
      result = result.filter((g) =>
        tagsActivas.some(tk => {
          switch (tk) {
            case 'multidispositivo':
              return [...g._variantes].some(v => v.toLowerCase().includes('multidispositivo'))
            case 'otros':
              // Captura cualquier Renove que NO sea de los 5 principales
              return [...g._variantes].some(v => !VARIANTES_CONOCIDAS.includes(v))
            default:
              return true
          }
        })
      )
    }

    // ── Rango de fechas ──
    if (dateFrom) {
      result = result.filter((g) => {
        if (!g.created_at) return false
        return g.created_at >= `${dateFrom}T00:00:00Z`
      })
    }
    if (dateTo) {
      result = result.filter((g) => {
        if (!g.created_at) return false
        return g.created_at <= `${dateTo}T23:59:59Z`
      })
    }

    // ── Búsqueda ──
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((g) => {
        const dni = (g.dni || '').toLowerCase()
        const nombre = (g.nombre || '').toLowerCase()
        const lineasCoinciden = g._lineas.some(l => (l.linea || '').toLowerCase().includes(q))
        return dni.includes(q) || nombre.includes(q) || lineasCoinciden
      })
    }

    // ── Ordenar ──
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aVal, bVal
        switch (sortConfig.key) {
          case 'dni': aVal = a.dni || ''; bVal = b.dni || ''; break
          case 'nombre': aVal = a.nombre || ''; bVal = b.nombre || ''; break
          case 'cima': aVal = a._cima ? 'SI' : 'NO'; bVal = b._cima ? 'SI' : 'NO'; break
          case 'linea': aVal = a._lineas[0]?.linea || ''; bVal = b._lineas[0]?.linea || ''; break
          case 'paquete': aVal = a._lineas[0]?.paquete || ''; bVal = b._lineas[0]?.paquete || ''; break
          case 'renove': aVal = a._renove_mixto ? 'SI' : 'NO'; bVal = b._renove_mixto ? 'SI' : 'NO'; break
          case 'estado': aVal = 'completado'; bVal = 'completado'; break
          case 'fecha': aVal = a.created_at || ''; bVal = b.created_at || ''; break
          default: return 0
        }
        if (aVal < bVal) return sortConfig.dir === 'asc' ? -1 : 1
        if (aVal > bVal) return sortConfig.dir === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [clientes, search, sortConfig, cimaFilter, renoveFilter, variantesActivas, tagsActivas, dateFrom, dateTo])

  const toggleSort = (key) => {
    setSortConfig((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const SortHeader = ({ label, sortKey }) => (
    <th className="table-header px-4 py-3 cursor-pointer hover:text-oratioo-dark select-none"
      onClick={() => toggleSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        {sortConfig.key === sortKey
          ? (sortConfig.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
          : <ArrowUpDown size={12} className="opacity-30" />}
      </div>
    </th>
  )

  const totalReales = clientes.filter((c) => {
    const ad = c.atributos_dinamicos || {}
    return ad.estado !== "no_cliente"
  })
  // Contar DNIs unicos para el total
  const dnisUnicos = new Set(totalReales.map(c => c.dni).filter(Boolean))

  const toggleCimaFilter = () => {
    if (cimaFilter === 'SI') setCimaFilter(null)
    else setCimaFilter('SI')
  }

  const toggleRenoveFilter = () => {
    if (renoveFilter === 'SI') setRenoveFilter(null)
    else setRenoveFilter('SI')
  }

  const toggleVariante = (key) => {
    setVariantesActivas(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const toggleTag = (key) => {
    setTagsActivas(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const clearAllFilters = () => {
    setCimaFilter(null)
    setRenoveFilter(null)
    setVariantesActivas([])
    setTagsActivas([])
    setDateFrom('')
    setDateTo('')
  }

  // Bulk Assign
  const openAssignModal = async () => {
    // Obtener equipos distintos desde la tabla usuarios
    const { data: users } = await supabase.from('usuarios').select('equipo').not('equipo', 'eq', '').not('equipo', 'is', null)
    const equiposUnicos = [...new Set((users || []).map(u => u.equipo).filter(Boolean))]
    const equiposList = equiposUnicos.map((nombre, i) => ({ id: i + 1, nombre }))
    setEquipos([{ id: 0, nombre: 'Todos los equipos' }, ...equiposList])
    setAssignEquipoId('')
    setAssignAsesorId('')
    setAssignCantidad('')
    setAssignMsg('')
    setAssignModal(true)
  }
  useEffect(() => {
    if (assignEquipoId) {
      // Equipo especifico
      supabase.from('usuarios').select('id, nombre').eq('rol', 'asesor').eq('equipo', assignEquipoId).eq('activo', true)
        .then(({ data }) => setAsesoresEquipo(data || []))
    } else {
      // Todos los asesores activos (sin filtrar por equipo)
      supabase.from('usuarios').select('id, nombre').eq('rol', 'asesor').eq('activo', true)
        .then(({ data }) => setAsesoresEquipo(data || []))
    }
  }, [assignEquipoId])
  const bulkAssign = async () => {
    setAssigning(true)
    setAssignMsg('')
    let leads = filtered  // Todos los leads visibles (incluye ya asignados)
    const ases = asesoresEquipo
    if (!leads.length) { setAssignMsg('No hay leads en vista'); setAssigning(false); return }
    if (!ases.length) { setAssignMsg('No hay asesores en este equipo'); setAssigning(false); return }
    // Aplicar límite de cantidad
    const limite = parseInt(assignCantidad) || leads.length
    if (limite > 0 && limite < leads.length) leads = leads.slice(0, limite)
    let count = 0
    for (let i = 0; i < leads.length; i++) {
      const aId = assignAsesorId ? parseInt(assignAsesorId) : ases[i % ases.length].id
      const ad = { ...(leads[i].atributos_dinamicos || {}), pipeline: { asesor_id: aId, estado: 'asignado', ultimo_cambio: new Date().toISOString() } }
      await supabase.from('lineas').update({ atributos_dinamicos: ad }).eq('dni', leads[i].dni)
      count++
    }
    setAssignMsg('OK ' + count + ' leads asignados')
    setAssigning(false)
    setTimeout(() => { setAssignModal(false); fetchClientes() }, 1500)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-oratioo-dark flex items-center gap-2"><Users size={22} className="text-oratioo-purple" /> Clientes</h1>
          <p className="text-sm text-oratioo-gray mt-1">
            {(cimaFilter || renoveFilter || variantesActivas.length > 0 || tagsActivas.length > 0 || dateFrom || dateTo)
              ? `${filtered.length} de ${dnisUnicos.size} clientes (filtros activos)`
              : `${filtered.length} clientes encontrados (de ${dnisUnicos.size} reales)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showAssignBtn && filtered.length > 0 && (
            <button onClick={openAssignModal} className="bg-[#0a6ea9] hover:bg-[#085d8f] text-white flex items-center gap-2 text-xs px-4 py-2 rounded-lg transition-all">
              <Send size={14} /> Asignar leads
            </button>
          )}
          <button onClick={fetchClientes} className="btn-primary p-2" title="Recargar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filtros */}

      {/* Filtros principales - siempre visibles */}
      <div className="card !p-4 space-y-3">
        {/* Barra superior: busqueda + acciones */}
        <div className="flex items-center justify-between gap-3">
          {/* Izquierda: busqueda */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7c757c]" />
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por DNI, nombre o linea..."
              className="w-full bg-white border border-oratioo-border rounded-lg pl-9 pr-8 py-2 text-sm text-oratioo-dark placeholder-[#7c757c] focus:outline-none focus:ring-2 focus:ring-[#0a6ea9]/20 focus:border-[#0a6ea9]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7c757c] hover:text-[#0a6ea9]">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Derecha: fechas + export + refresh */}
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="date" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white border border-[#e8dce6] rounded px-2.5 py-1.5 text-xs text-[#1a1030] w-[135px]"
              title="Fecha inicio"
            />
            <span className="text-[#7c757c] text-xs">-</span>
            <input
              type="date" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white border border-[#e8dce6] rounded px-2.5 py-1.5 text-xs text-[#1a1030] w-[135px]"
              title="Fecha fin"
            />
            <ExportButtons data={filtered} />
          </div>
        </div>

        {/* Fila de filtros rapidos */}
        <div className="flex flex-wrap items-center gap-2">

          {/* CIMA toggle */}
          <span
            onClick={() => toggleCimaFilter()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer select-none transition-all ${
              cimaFilter === 'SI'
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300 shadow-sm'
                : 'bg-white text-oratioo-dark border border-oratioo-border hover:border-gray-400 hover:shadow-sm'
            }`}
          >
            CIMA
          </span>

          {/* Renove toggle */}
          <span
            onClick={() => toggleRenoveFilter()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer select-none transition-all ${
              renoveFilter === 'SI'
                ? 'bg-[#e6f3fb] text-[#0a6ea9] border border-[#b8ddf4] shadow-sm'
                : 'bg-white text-oratioo-dark border border-oratioo-border hover:border-gray-400 hover:shadow-sm'
            }`}
          >
            Renove Mixto
          </span>

          <span className="text-oratioo-gray text-xs">|</span>

          {/* Variantes valiosas - 4 colores */}
          <span className="text-xs text-oratioo-gray font-medium mr-1">Variantes:</span>
          {VARIANTES_VALIOSAS.map((v) => {
            const activa = variantesActivas.includes(v.key)
            const colorMap = {
              emerald: 'border-emerald-300 text-emerald-700 bg-emerald-100',
              blue: 'border-blue-300 text-blue-700 bg-blue-100',
              amber: 'border-amber-300 text-amber-700 bg-amber-100',
              gray: 'border-gray-300 text-[#1a1030] bg-gray-100',
            }
            const colorOff = 'bg-white text-oratioo-dark border border-oratioo-border hover:border-gray-400'
            return (
              <span key={v.key}
                onClick={() => toggleVariante(v.key)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer select-none transition-all border ${
                  activa ? colorMap[v.color] || colorMap.gray : colorOff
                } hover:border-gray-500`}
              >
                {activa ? '\u2713' : '\u25CB'} {v.label}
              </span>
            )
          })}

          <span className="text-oratioo-gray text-xs">|</span>

          {/* Tags: Multidispositivo + Pago único */}
          <span className="text-xs text-oratioo-gray font-medium mr-1">Otros:</span>
          {VARIANTES_MENORES.map((v) => {
            const activa = tagsActivas.includes(v.key)
            return (
              <span key={v.key}
                onClick={() => toggleTag(v.key)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer select-none transition-all border ${
                  activa
                    ? 'border-slate-300 text-slate-700 bg-slate-100'
                    : 'bg-white text-oratioo-dark border border-oratioo-border hover:border-gray-400'
                }`}
              >
                {activa ? '\u2713' : '\u25CB'} {v.label}
              </span>
            )
          })}

        {/* Limpiar filtros */}
        {(cimaFilter || renoveFilter || variantesActivas.length > 0 || tagsActivas.length > 0 || dateFrom || dateTo) && (
          <button onClick={clearAllFilters}
            className="text-xs text-oratioo-gray hover:text-oratioo-purple underline ml-2">
            Limpiar filtros
          </button>
        )}
        </div>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full">
            <thead>
              <tr className="border-b border-oratioo-border">
                <th className="table-header px-4 py-3 w-10"></th>
                <SortHeader label="DNI" sortKey="dni" />
                <SortHeader label="Nombre" sortKey="nombre" />
                <SortHeader label="CIMA" sortKey="cima" />
                <SortHeader label="Línea Principal" sortKey="linea" />
                <SortHeader label="Paquete" sortKey="paquete" />
                <SortHeader label="Tipo Renove" sortKey="renove" />
                <SortHeader label="Estado" sortKey="estado" />
                <SortHeader label="Fecha" sortKey="fecha" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <Loader2 size={24} className="animate-spin text-oratioo-purple mx-auto mb-2" />
                  <p className="text-oratioo-gray text-sm">Cargando clientes...</p>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <Users size={32} className="text-oratioo-gray mx-auto mb-2" />
                  <p className="text-oratioo-gray text-sm">No se encontraron clientes</p>
                  <p className="text-oratioo-gray text-xs mt-1">Intenta ajustar los filtros</p>
                </td></tr>
              ) : (
                (() => {
                  const start = (clientesPage - 1) * clientesPageSize
                  const paginated = filtered.slice(start, start + clientesPageSize)
                  return paginated.map((c) => (
                    <FilaExpandible key={c.dni + (c.id || '')}
                      cliente={c}
                      abierto={expandido === c.dni}
                      onToggle={() => setExpandido(expandido === c.dni ? null : c.dni)} />
                  ))
                })()
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > clientesPageSize && (
          <div className="border-t border-[#e8dce6] px-4 py-2 flex items-center justify-between bg-[#faf8fa]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#7c757c]">
                {filtered.length} resultados — Pág. {clientesPage} de {Math.ceil(filtered.length / clientesPageSize)}
              </span>
              <select value={clientesPageSize} onChange={e => { setClientesPageSize(Number(e.target.value)); setClientesPage(1) }}
                className="bg-white border border-[#e8dce6] rounded px-2 py-1 text-xs text-[#1a1030]">
                <option value={10}>10 / pág</option>
                <option value={25}>25 / pág</option>
                <option value={50}>50 / pág</option>
                <option value={100}>100 / pág</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setClientesPage(p => Math.max(1, p - 1))} disabled={clientesPage === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-[#e8dce6] bg-white text-[#1a1030] hover:bg-[#f5ebf3] disabled:opacity-30 disabled:cursor-not-allowed">
                Anterior
              </button>
              {Array.from({ length: Math.min(5, Math.ceil(filtered.length / clientesPageSize)) }, (_, i) => {
                const total = Math.ceil(filtered.length / clientesPageSize)
                let start = Math.max(1, clientesPage - 2)
                if (start + 4 > total) start = Math.max(1, total - 4)
                const pageNum = start + i
                if (pageNum > total) return null
                return (
                  <button key={pageNum} onClick={() => setClientesPage(pageNum)}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      pageNum === clientesPage ? 'bg-[#0a6ea9] text-white border-[#0a6ea9]' : 'border-[#e8dce6] bg-white text-[#1a1030] hover:bg-[#f5ebf3]'
                    }`}>
                    {pageNum}
                  </button>
                )
              })}
              <button onClick={() => setClientesPage(p => Math.min(Math.ceil(filtered.length / clientesPageSize), p + 1))}
                disabled={clientesPage === Math.ceil(filtered.length / clientesPageSize)}
                className="px-3 py-1.5 text-xs rounded-lg border border-[#e8dce6] bg-white text-[#1a1030] hover:bg-[#f5ebf3] disabled:opacity-30 disabled:cursor-not-allowed">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Bulk Assign Modal */}
      {assignModal && (() => {
        const totalLeads = filtered.length
        const yaAsignados = filtered.filter(c => c.atributos_dinamicos?.pipeline?.asesor_id).length
        const leadsAAssign = parseInt(assignCantidad) || totalLeads
        return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAssignModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[#1a1030]">Asignar leads</h2>
              <button onClick={() => setAssignModal(false)} className="p-1 rounded hover:bg-[#f5ebf3]"><X size={18} /></button>
            </div>
            <p className="text-sm text-[#7c757c] mb-2">{totalLeads} leads en vista, <strong>{yaAsignados}</strong> ya asignados</p>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-[#7c757c] mb-1">Cuantos asignar?</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max={totalLeads}
                      value={assignCantidad}
                      onChange={e => setAssignCantidad(e.target.value)}
                      placeholder={String(totalLeads)}
                      className="w-20 border border-[#e8dce6] rounded-lg px-3 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-[#7c757c]">
                      {assignCantidad ? `de ${totalLeads} leads` : `de ${totalLeads} (todos)`}
                    </span>
                    <button onClick={() => setAssignCantidad('')} className="text-xs text-[#1495e0] hover:underline">
                      {assignCantidad ? 'Todos' : ''}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#7c757c] mb-1">Equipo</label>
                <select value={assignEquipoId} onChange={e => setAssignEquipoId(e.target.value)} className="w-full border border-[#e8dce6] rounded-lg px-3 py-2 text-sm">
                  {equipos.map(eq => <option key={eq.id} value={eq.nombre}>{eq.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#7c757c] mb-1">Asesor</label>
                <select value={assignAsesorId} onChange={e => setAssignAsesorId(e.target.value)} className="w-full border border-[#e8dce6] rounded-lg px-3 py-2 text-sm">
                  <option value="">Repartir entre todos</option>
                  {asesoresEquipo.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              {assignMsg && <p className={assignMsg.startsWith('OK') ? 'text-sm text-emerald-600' : 'text-sm text-red-500'}>{assignMsg}</p>}
              <button onClick={bulkAssign} disabled={assigning} className="w-full bg-[#0a6ea9] hover:bg-[#085d8f] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
                {assigning ? 'Asignando...' : (
                  assignCantidad
                    ? `Asignar ${parseInt(assignCantidad) || 0} leads`
                    : `Asignar todos (${totalLeads})`
                )}
              </button>
            </div>
          </div>
        </div>
      )
      })()}
    </div>
  )
}

