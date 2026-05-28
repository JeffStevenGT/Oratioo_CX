import { useState, useEffect } from 'react'
import {
  ChevronDown, ChevronRight, Phone, FileText, Tag, RefreshCw,
  DollarSign, Wifi, Save, UserPlus,
} from 'lucide-react'
import { supabase, TABLA_PERFILES } from '../supabaseClient'

const PIPELINE_ESTADOS = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-gray-100 text-gray-700' },
  { value: 'contactado', label: 'Contactado', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'interesado', label: 'Interesado', color: 'bg-amber-100 text-amber-700' },
  { value: 'en_negociacion', label: 'En Negociación', color: 'bg-blue-100 text-blue-700' },
  { value: 'cerrado', label: 'Venta', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'no_interesa', label: 'No Interesa', color: 'bg-red-100 text-red-700' },
]

export default function FilaExpandible({ cliente, abierto, onToggle }) {
  const attr = cliente.atributos_dinamicos || {}
  const bas = attr.datos_basicos || {}
  const linea = attr.linea || {}
  const pestanas = attr.pestanas || {}
  const seguros = bas.seguros || []
  const pipeline = attr.pipeline || {}

  const session = JSON.parse(localStorage.getItem('oratioo_session') || '{}')
  const myRol = session.rol

  const [estado, setEstado] = useState(pipeline.estado || 'pendiente')
  const [asesorId, setAsesorId] = useState(pipeline.asesor_id || '')
  const [notas, setNotas] = useState(pipeline.notas || '')
  const [asesores, setAsesores] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (abierto) {
      supabase.from(TABLA_PERFILES).select('id, nombre').eq('rol', 'asesor').eq('activo', true)
        .then(({ data }) => { if (data) setAsesores(data) })
    }
  }, [abierto])

  const guardarPipeline = async (nuevoEstado) => {
    setSaving(true)
    const dni = cliente.dni
    const estadoFinal = nuevoEstado !== undefined ? nuevoEstado : estado
    const ad = { ...attr, pipeline: { estado: estadoFinal, asesor_id: asesorId, notas, ultimo_cambio: new Date().toISOString() } }

    // Guardar en lineas (atributos_dinamicos.pipeline)
    const { error: errLineas } = await supabase.from('lineas').update({ atributos_dinamicos: ad }).eq('dni', dni)
    if (errLineas) {
      console.error('Error al guardar pipeline en lineas:', errLineas)
      setSaving(false)
      return
    }

    // Guardar en lead_pipeline
    const { data: existing, error: errSelect } = await supabase.from('lead_pipeline').select('id').eq('linea_id', cliente.id).maybeSingle()
    if (errSelect && !errSelect.message?.includes('does not exist')) {
      console.error('Error al consultar lead_pipeline:', errSelect)
    }

    const pipeData = { linea_id: cliente.id, asesor_id: asesorId || null, estado: estadoFinal, notas, updated_at: new Date().toISOString() }

    if (existing) {
      const { error: errUpd } = await supabase.from('lead_pipeline').update(pipeData).eq('id', existing.id)
      if (errUpd) console.error('Error al actualizar lead_pipeline:', errUpd)
    } else {
      const { error: errIns } = await supabase.from('lead_pipeline').insert(pipeData)
      if (errIns && !errIns.message?.includes('does not exist')) {
        console.error('Error al insertar lead_pipeline:', errIns)
      }
    }

    setSaving(false)
  }

  const estadoCfg = PIPELINE_ESTADOS.find(e => e.value === estado) || PIPELINE_ESTADOS[0]

  const canEdit = ['asesor', 'supervisor', 'jefe_area', 'desarrollador'].includes(myRol)

  return (
    <>
      <tr onClick={onToggle}
        className="border-b border-[#e8dce6] hover:bg-[#f5ebf3]/50 cursor-pointer transition-colors">
        <td className="table-cell">
          <button className="p-0.5 rounded hover:bg-[#e8dce6] transition-colors">
            {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="table-cell font-mono text-xs">{cliente.dni}</td>
        <td className="table-cell font-medium">{bas.nombre || '-'}</td>
        <td className="table-cell">
          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs border ${
            attr.cima === 'SI' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-[#1a1030] border-[#e8dce6]'
          }`}>
            {attr.cima === 'SI' ? 'CIMA' : 'NO'}
          </span>
        </td>
        <td className="table-cell text-xs font-mono">{linea.numero || linea.linea_principal || '-'}</td>
        <td className="table-cell">{linea.paquete || '-'}</td>
        <td className="table-cell text-xs">
          {attr.renove_mixto_variante && attr.renove_mixto_variante !== 'N/A' ? (
            <span className="text-[#0a6ea9] font-medium text-xs">{attr.renove_mixto_variante}</span>
          ) : <span className="text-[#7c757c]">-</span>}
        </td>
        <td className="table-cell text-[#7c757c] text-xs">
          {(() => {
            const fh = cliente.atributos_dinamicos?.fecha_hora
            if (fh) {
              // fecha_hora es ISO: 2026-05-28T13:43:03Z
              const d = new Date(fh)
              return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
                d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
            }
            const fp = cliente.atributos_dinamicos?.fecha_procesado || cliente.created_at
            if (!fp) return '-'
            if (fp.length === 10 && fp[4] === '-' && fp[7] === '-') {
              const d = new Date(fp + 'T12:00:00')
              return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
            }
            return new Date(fp).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
          })()}
        </td>
      </tr>

      {abierto && (
        <tr key={`${cliente.dni}-detail`} className="animate-slide-in">
          <td colSpan={9} className="p-0">
            <div className="bg-[#f5ebf3]/30 border-b border-[#e8dce6] px-6 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="card !bg-white/60">
                    <h4 className="text-sm font-semibold text-[#1a1030] mb-3 flex items-center gap-2">
                      <FileText size={14} className="text-[#0a6ea9]" /> Datos del cliente
                    </h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div><span className="text-[#7c757c]">Nombre:</span><p className="text-[#1a1030]">{bas.nombre || '-'}</p></div>
                      <div><span className="text-[#7c757c]">DNI:</span><p className="text-[#1a1030] font-mono">{cliente.dni}</p></div>
                      <div className="col-span-2"><span className="text-[#7c757c]">Dirección:</span><p className="text-[#1a1030]">{bas.direccion || '-'}</p></div>
                      <div><span className="text-[#7c757c]">CIMA:</span>
                        <span className={attr.cima === 'SI' ? 'text-emerald-700 font-medium ml-1' : 'text-[#7c757c] ml-1'}>{attr.cima === 'SI' ? 'SÍ' : 'NO'}</span>
                      </div>
                      <div><span className="text-[#7c757c]">Renove Mixto:</span>
                        <span className={attr.tiene_renove_mixto ? 'text-emerald-700 font-medium ml-1' : 'text-[#7c757c] ml-1'}>{attr.tiene_renove_mixto ? 'SÍ' : 'NO'}</span>
                      </div>
                      {attr.renove_mixto_variante && attr.renove_mixto_variante !== 'N/A' && (
                        <div className="col-span-2"><span className="text-[#7c757c]">Variante:</span><p className="text-[#0a6ea9] font-medium">{attr.renove_mixto_variante}</p></div>
                      )}
                    </div>
                  </div>


                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-[#1a1030] mb-1 flex items-center gap-2">
                    <RefreshCw size={14} className="text-[#0a6ea9]" /> Ofertas por pestaña
                  </h4>
                  {pestanas.Destacadas && pestanas.Destacadas !== 'N/A' && (
                    <div className="bg-[#f5ebf3]/50 rounded-lg px-3 py-2 text-xs border border-[#e8dce6]">
                      <span className="font-medium text-[#1a1030]">Destacadas:</span>
                      <p className="text-[#7c757c] mt-1">{pestanas.Destacadas}</p>
                    </div>
                  )}
                  {pestanas.Renove && pestanas.Renove !== 'N/A' && (
                    <div className="bg-[#f5ebf3]/50 rounded-lg px-3 py-2 text-xs border border-[#e8dce6]">
                      <span className="font-medium text-[#1a1030]">Renove:</span>
                      <p className="text-[#7c757c] mt-1">{pestanas.Renove}</p>
                    </div>
                  )}
                  {pestanas['Bonos y D.'] && pestanas['Bonos y D.'] !== 'N/A' && (
                    <div className="bg-[#f5ebf3]/50 rounded-lg px-3 py-2 text-xs border border-[#e8dce6]">
                      <span className="font-medium text-[#1a1030]">Bonos y D.:</span>
                      <p className="text-[#7c757c] mt-1">{pestanas['Bonos y D.']}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
