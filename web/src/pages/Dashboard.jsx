import { useState, useEffect } from 'react'
import { LayoutDashboard, Users, UserCheck, RefreshCw, TrendingUp, Loader2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase, TABLA_CLIENTES } from '../supabaseClient'
import StatCard from '../components/StatCard'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, cima: 0, renoveMixto: 0, cimaRenove: 0, tasaExtraccion: 0, maxDescuento: 0, conDescuento: 0, mejorPrecio: 0, renoveBasico: 0, multidispositivo: 0, otros: 0 })
  const [chartData, setChartData] = useState([])
  const [periodo, setPeriodo] = useState('all')

  function getDateFilter(periodo) {
    const now = new Date()
    if (periodo === 'hoy') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (periodo === 'semana') { const s = new Date(now); s.setDate(s.getDate() - 7); return s }
    if (periodo === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1)
    if (periodo === 'trimestre') { const s = new Date(now); s.setMonth(s.getMonth() - 3); return s }
    if (periodo === '6m') { const s = new Date(now); s.setMonth(s.getMonth() - 6); return s }
    return null
  }

  const fetchData = async (periodoActual) => {
    const p = periodoActual || periodo
    setLoading(true)
    try {
      const { data } = await supabase.from(TABLA_CLIENTES).select('dni, created_at, atributos_dinamicos')
      let clientes = (data || []).filter(c => c.atributos_dinamicos?.estado === 'completado')

      const fechaCorte = getDateFilter(p)
      if (fechaCorte) {
        clientes = clientes.filter(c => {
          const f = c.atributos_dinamicos?.pipeline?.ultimo_cambio || c.created_at
          return f && new Date(f) >= fechaCorte
        })
      }

      const total = clientes.length
      const cima = clientes.filter(c => c.atributos_dinamicos?.cima === 'SI').length

      const VARIANTES_MIXTO = [
        'Renove mixto al mejor precio con máximo descuento',
        'Renove mixto al mejor precio con descuento',
        'Renove mixto al mejor precio',
        'Renove mixto',
      ]
      const renoveMixto = clientes.filter(c => {
        const v = c.atributos_dinamicos?.renove_mixto_variante
        return v && VARIANTES_MIXTO.includes(v)
      }).length

      const maxDescuento = clientes.filter(c => c.atributos_dinamicos?.renove_mixto_variante === 'Renove mixto al mejor precio con máximo descuento').length
      const conDescuento = clientes.filter(c => c.atributos_dinamicos?.renove_mixto_variante === 'Renove mixto al mejor precio con descuento').length
      const mejorPrecio = clientes.filter(c => c.atributos_dinamicos?.renove_mixto_variante === 'Renove mixto al mejor precio').length
      const renoveBasico = clientes.filter(c => c.atributos_dinamicos?.renove_mixto_variante === 'Renove mixto').length
      const multidispositivo = clientes.filter(c => c.atributos_dinamicos?.renove_mixto_variante === 'Renove Multidispositivo').length
      const otros = clientes.filter(c => {
        const v = c.atributos_dinamicos?.renove_mixto_variante
        return v && v !== 'N/A' && !VARIANTES_MIXTO.includes(v) && v !== 'Renove Multidispositivo'
      }).length

      const cimaRenove = clientes.filter(c => c.atributos_dinamicos?.cima === 'SI' && (
        c.atributos_dinamicos?.renove_mixto_variante && VARIANTES_MIXTO.includes(c.atributos_dinamicos?.renove_mixto_variante)
      )).length
      const tasaExtraccion = total > 0 ? Math.round((cimaRenove / total) * 100) : 0

      setStats({ total, cima, renoveMixto, cimaRenove, tasaExtraccion, maxDescuento, conDescuento, mejorPrecio, renoveBasico, multidispositivo, otros })

      // Chart: últimos 7 días
      const last7 = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        const dayLabel = d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' })
        const count = clientes.filter(c => c.created_at && c.created_at.split('T')[0] === dateStr).length
        last7.push({ day: dayLabel, Procesados: count })
      }
      setChartData(last7)
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [periodo])

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-oratioo-border rounded-lg px-3 py-2 text-xs shadow-lg">
          <p className="text-oratioo-gray">{label}</p>
          <p className="text-oratioo-purple font-semibold">{payload[0].value} DNIs</p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-oratioo-purple" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-oratioo-dark flex items-center gap-2"><LayoutDashboard size={22} className="text-oratioo-purple" /> Dashboard</h1>
          <p className="text-sm text-oratioo-gray mt-1">Resumen general de datos procesados</p>
        </div>
        <div className="flex items-center gap-2">
          {['hoy', 'semana', 'mes', 'trimestre', '6m', 'all'].map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                periodo === p ? 'bg-[#481163] text-white' : 'bg-white text-oratioo-dark border border-oratioo-border hover:bg-oratioo-light'
              }`}>
              {p === 'all' ? 'Todo' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <button onClick={() => fetchData()}
            className="text-oratioo-gray hover:text-oratioo-dark border border-oratioo-border hover:bg-[#f0ecf0] p-2 rounded-lg transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Datos del Bot */}
      <div className="flex items-center gap-2 mb-1">
        <div className="h-3 w-3 rounded-full bg-[#0a6ea9]"></div>
        <span className="text-[10px] text-[#7c757c] uppercase tracking-wider font-semibold">Datos del Bot</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={stats.total.toLocaleString()} subtitle="Leads procesados" icon={Users} color="indigo" />
        <StatCard title="Clientes CIMA" value={stats.cima.toLocaleString()} subtitle={`${stats.total > 0 ? Math.round((stats.cima / stats.total) * 100) : 0}% del total`} icon={UserCheck} color="violet" />
        <StatCard title="Renove Mixto" value={stats.renoveMixto.toLocaleString()} subtitle="4 variantes valiosas" icon={RefreshCw} color="emerald" />
        <StatCard title="Tasa CIMA+Renove" value={`${stats.tasaExtraccion}%`} subtitle={`${stats.cimaRenove} de ${stats.total} leads`} icon={TrendingUp} color="amber" />
      </div>

      {/* Desglose por variante */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <p className="text-[10px] text-emerald-700 font-medium">Máx descuento</p>
          <p className="text-lg font-bold text-emerald-600">{stats.maxDescuento}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <p className="text-[10px] text-blue-700 font-medium">Con descuento</p>
          <p className="text-lg font-bold text-blue-600">{stats.conDescuento}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-[10px] text-amber-700 font-medium">Mejor precio</p>
          <p className="text-lg font-bold text-amber-600">{stats.mejorPrecio}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <p className="text-[10px] text-slate-700 font-medium">Multidispositivo</p>
          <p className="text-lg font-bold text-slate-600">{stats.multidispositivo}</p>
        </div>
        <div className="bg-[#f0ecf0] border border-[#e8dce6] rounded-lg px-3 py-2">
          <p className="text-[10px] text-[#7c757c] font-medium">Otros</p>
          <p className="text-lg font-bold text-[#7c757c]">{stats.otros}</p>
        </div>
      </div>

      {/* Monitoreo - Chart */}
      <div className="flex items-center gap-2 mb-1 mt-2">
        <div className="h-3 w-3 rounded-full bg-amber-500"></div>
        <span className="text-[10px] text-[#7c757c] uppercase tracking-wider font-semibold">Monitoreo</span>
      </div>
      <div className="card !p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-[#7c757c] uppercase tracking-wider">Procesados por día</h3>
          <span className="text-[10px] text-[#7c757c]">Últimos 7 días</span>
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e8dce6" />
              <XAxis dataKey="day" tick={{ fill: '#7c757c', fontSize: 10 }} axisLine={{ stroke: '#e8dce6' }} tickLine={false} />
              <YAxis tick={{ fill: '#7c757c', fontSize: 10 }} axisLine={{ stroke: '#e8dce6' }} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(72,17,100,0.06)' }} />
              <Bar dataKey="Procesados" fill="#0a6ea9" radius={[4, 4, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
