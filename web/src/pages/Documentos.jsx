import React, { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, FileSpreadsheet, FileText, File, X, CheckCircle2, AlertCircle,
  Loader2, Clock, Eye, Database, Trash2, Play, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import BotStatus from '../components/BotStatus'

// Convertir created_at (UTC) a fecha local YYYY-MM-DD
function utcToLocalDate(isoStr) {
  if (!isoStr) return 'sin_fecha'
  const d = new Date(isoStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}


function extractDNIs(text) {
  const dnis = new Set()
  const clean = text.replace(/^\uFEFF/, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u200B-\u200F\uFEFF]/g, '')
    .replace(/["'\u2018\u2019\u201C\u201D_]/g, '')
  const matches = clean.match(/\b(?:[A-Za-z]\d{8}|\d{7,8}[A-Za-z]|[A-Za-z]\d{7}[A-Za-z])\b/g)
  const nieGuiones = clean.match(/\b[A-Za-z]-\d{7}-[A-Za-z]\b/g)
  if (matches) matches.forEach(d => dnis.add(d.toUpperCase()))
  if (nieGuiones) nieGuiones.forEach(d => dnis.add(d.toUpperCase().replace(/-/g, '')))
  return Array.from(dnis)
}

function detectColumn(headers) {
  const dniKeywords = ['dni', 'documento', 'identidad', 'nrodocumento', 'num_doc', 'documento_identidad', 'cedula', 'id']
  for (const h of headers) {
    const hclean = h.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (dniKeywords.some(k => hclean.includes(k))) return h
  }
  return headers[0]
}

export default function Documentos() {
  const [files, setFiles] = useState([])
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [agenteActivo, setAgenteActivo] = useState(false)
  const [soloHoy, setSoloHoy] = useState(true)
  const [expandedDay, setExpandedDay] = useState(null)
  const [dayDetails, setDayDetails] = useState({})  // { '2026-05-28': { docId: { total, procesados, pendientes } } }

  function hoyLocal() {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
  }

  const fetchHistory = async () => {
    setLoadingHistory(true)
    try {
      const { data, error } = await supabase.from('documentos').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      setUploaded(data || [])
    } catch (err) {
      console.error('Error cargando historial:', err?.message || err)
      setUploaded([])
    } finally { setLoadingHistory(false) }
  }

  useEffect(() => { fetchHistory() }, [])
  useEffect(() => {
    const interval = setInterval(fetchHistory, 300000)
    return () => clearInterval(interval)
  }, [])
  // Cuando uploaded cambia, limpiar detalles expandidos (se recargan al hacer click)
  useEffect(() => {
    if (expandedDay) {
      setDayDetails({})
    }
  }, [uploaded.length])

  // Verificar agente activo cada 10s
  const checkAgente = async () => {
    try {
      const ahora = Date.now()
      const { data } = await supabase.from('maquinas').select('nombre,estado,ultimo_heartbeat').limit(10)
      const activo = (data || []).some(m => {
        if (m.estado !== 'conectado' && m.estado !== 'activo') return false
        if (!m.ultimo_heartbeat) return false
        return (ahora - new Date(m.ultimo_heartbeat).getTime()) < 25000
      })
      setAgenteActivo(activo)
    } catch { setAgenteActivo(false) }
  }
  useEffect(() => {
    checkAgente()
    const interval = setInterval(checkAgente, 10000)
    return () => clearInterval(interval)
  }, [])

  const onDrop = useCallback((acceptedFiles) => {
    setError('')
    setFiles(prev => [...prev, ...acceptedFiles.map(f => ({
      id: `${f.name}-${Date.now()}`,
      file: f, name: f.name, size: f.size, type: f.type || f.name.split('.').pop(),
    }))])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'text/plain': ['.txt'],
    },
  })

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id))
    if (preview?.id === id) setPreview(null)
  }

  const previewFile = async (fileData) => {
    setError('')
    try {
      const text = await fileData.file.text()
      const lines = text.split('\n').filter(Boolean)
      const headers = (lines[0] || '').split(/[,;\t|]/).map(h => h.trim().replace(/^"|"$/g, ''))
      setPreview({ id: fileData.id, name: fileData.name, headers, detectedCol: detectColumn(headers), dnis: extractDNIs(text), totalLines: lines.length, sample: lines.slice(0, 6) })
    } catch (err) {
      setError('No se pudo leer el archivo.')
    }
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setError('')
    const errores = []
    try {
      for (const f of files) {
        const ext = f.name.split('.').pop().toLowerCase()
        if (['xlsx', 'xls'].includes(ext)) { errores.push(f.name + ' es binario.'); continue }
        const text = await f.file.text()
        const dnis = extractDNIs(text)
        if (dnis.length === 0) { errores.push('No hay DNIs en ' + f.name); continue }
        const { data: doc, error: errDoc } = await supabase.from('documentos').insert({
          nombre_archivo: f.name, semana: new Date().toISOString().slice(0, 7),
          total_dnis: dnis.length, procesados: 0, pendientes: dnis.length, errores: 0, no_encontrados: 0,
        }).select().single()
        if (errDoc) { errores.push('Error: ' + f.name); continue }
        for (let i = 0; i < dnis.length; i += 500) {
          const batch = dnis.slice(i, i + 500).map(dni => ({
            dni, nombre: 'N/A', direccion: 'N/A', linea: 'N/A', paquete: 'N/A',
            atributos_dinamicos: { estado: 'pendiente', datos_basicos: { nombre: 'N/A', direccion: 'N/A' }, pipeline: { estado: 'pendiente', asesor_id: null, notas: '' }, documento_id: doc.id },
          }))
          await supabase.from('lineas').insert(batch).select('id', { count: 'exact', head: true })
        }
      }
      await fetchHistory()
      setFiles([])
      setPreview(null)
      setError(errores.length > 0 ? errores.join(' | ') : '')
    } catch (err) { setError('Error: ' + err.message) }
    finally { setUploading(false) }
  }

  // ── Iniciar análisis de TODOS los documentos pendientes ──
  const handleStartAnalysis = async () => {
    const pendientes = uploaded.filter(d => d.estado !== 'completado' || !d.estado)
    const completados = uploaded.filter(d => d.estado === 'completado')

    if (pendientes.length === 0 && completados.length === 0) {
      alert('No hay documentos para analizar.')
      return
    }

    if (completados.length > 0) {
      const ok = window.confirm(`Hay ${completados.length} documento(s) ya analizados. ¿Re-analizarlos también?`)
      if (!ok) return
    }

    setAnalyzing(true)

    // Resetear completados si los hay (preservando pipeline)
    for (const doc of completados) {
      const { data: lineas } = await supabase.from('lineas').select('id,atributos_dinamicos')
        .filter('atributos_dinamicos->>documento_id', 'eq', String(doc.id))
      if (lineas) {
        for (const l of lineas) {
          const ad = l.atributos_dinamicos || {}
          const pipe = ad.pipeline || { estado: 'pendiente', asesor_id: null, notas: '' }
          await supabase.from('lineas').update({
            atributos_dinamicos: { estado: 'pendiente', documento_id: doc.id, pipeline: pipe }
          }).eq('id', l.id)
        }
      }
      await supabase.from('documentos').update({ estado: null, procesados: 0 }).eq('id', doc.id)
    }

    await fetchHistory()

    // Leer máquinas
    const { data: maquinas } = await supabase.from('maquinas').select('*')
    if (!maquinas || maquinas.length === 0) {
      alert('No hay máquinas configuradas.')
      setAnalyzing(false); return
    }

    const ahora = Date.now()
    const online = maquinas.filter(m => m.estado === 'conectado' || m.estado === 'activo')
      .filter(m => m.ultimo_heartbeat && (ahora - new Date(m.ultimo_heartbeat).getTime()) < 20000)
    if (online.length === 0) {
      alert('No hay agentes activos.')
      setAnalyzing(false); return
    }

    const workersConfig = {}
    for (const m of maquinas) { if (m.nombre) workersConfig[m.nombre] = parseInt(m.workers_config) || 1 }

    const comandos = maquinas.map(m => ({
      maquina_destino: m.nombre, comando: 'iniciar',
      parametros: { workers_config: workersConfig, documento_id: null, documento_nombre: 'todos' },
      estado: 'pendiente',
    }))
    await supabase.from('comandos_bot').insert(comandos)

    // Marcar todos como analizando
    for (const doc of [...pendientes, ...completados]) {
      await supabase.from('documentos').update({ estado: 'analizando' }).eq('id', doc.id)
    }
    await fetchHistory()

    // Monitorear progreso de todos los documentos
    const interval = setInterval(async () => {
      const docs = await supabase.from('documentos').select('id,total_dnis,procesados').order('created_at', { ascending: false }).limit(100)
      if (docs.data) {
        let todosTerminados = true
        for (const d of docs.data) {
          const { count } = await supabase.from('lineas').select('id', { count: 'exact', head: true })
            .filter('atributos_dinamicos->>documento_id', 'eq', String(d.id))
            .not('atributos_dinamicos->>estado', 'eq', 'pendiente')
          const proc = parseInt(count) || 0
          if (proc >= d.total_dnis) {
            await supabase.from('documentos').update({ estado: 'completado', procesados: proc }).eq('id', d.id)
          } else {
            todosTerminados = false
          }
        }
        await fetchHistory()
        if (todosTerminados) {
          clearInterval(interval)
          setAnalyzing(false)
        }
      }
    }, 3000)
  }

  const toggleDay = async (dia, docs) => {
    if (expandedDay === dia) {
      setExpandedDay(null)
      return
    }
    setExpandedDay(dia)
    // Cargar conteo de DNIs por documento para este día
    const docIds = docs.map(d => d.id)
    const detalles = {}
    for (const id of docIds) {
      try {
        const { count: total } = await supabase.from('lineas').select('id', { count: 'exact', head: true })
          .filter('atributos_dinamicos->>documento_id', 'eq', String(id))
        const { count: procesados } = await supabase.from('lineas').select('id', { count: 'exact', head: true })
          .filter('atributos_dinamicos->>documento_id', 'eq', String(id))
          .not('atributos_dinamicos->>estado', 'eq', 'pendiente')
        const { count: noClientes } = await supabase.from('lineas').select('id', { count: 'exact', head: true })
          .filter('atributos_dinamicos->>documento_id', 'eq', String(id))
          .filter('atributos_dinamicos->>estado', 'eq', 'no_cliente')
        const { count: errores } = await supabase.from('lineas').select('id', { count: 'exact', head: true })
          .filter('atributos_dinamicos->>documento_id', 'eq', String(id))
          .filter('atributos_dinamicos->>estado', 'eq', 'error')
        detalles[id] = { total: total || 0, procesados: procesados || 0, noClientes: noClientes || 0, errores: errores || 0 }
      } catch {}
    }
    setDayDetails(prev => ({ ...prev, [dia]: detalles }))
  }

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Eliminar "${doc.nombre_archivo}"?`)) return
    setDeletingId(doc.id)
    try {
      const { data: lineas } = await supabase.from('lineas').select('id')
        .filter('atributos_dinamicos->>documento_id', 'eq', String(doc.id))
      if (lineas?.length > 0) await supabase.from('lineas').delete().in('id', lineas.map(l => l.id))
      await supabase.from('documentos').delete().eq('id', doc.id)
      await fetchHistory()
    } catch (err) { alert('Error: ' + (err.message || err)) }
    finally { setDeletingId(null) }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-oratioo-dark flex items-center gap-2">
          <Upload size={22} className="text-oratioo-purple" /> Subida de documentos
        </h1>
        <p className="text-sm text-oratioo-gray mt-1">Carga archivos .xlsx, .csv o .txt con DNIs de clientes</p>
      </div>

      <BotStatus />

      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
        isDragActive ? 'border-oratioo-purple bg-purple-50' : 'border-oratioo-border hover:border-oratioo-purple bg-white'
      }`}>
        <input {...getInputProps()} />
        <Upload size={40} className={`mx-auto mb-3 ${isDragActive ? 'text-oratioo-gray' : 'text-oratioo-gray'}`} />
        {isDragActive ? (
          <p className="text-oratioo-gray font-medium">Suelta los archivos aquí...</p>
        ) : (
          <>
            <p className="text-oratioo-dark font-medium">Arrastra tus archivos aquí</p>
            <p className="text-oratioo-gray text-sm mt-1">o haz clic para seleccionarlos</p>
            <p className="text-oratioo-gray text-xs mt-2">Formatos: .xlsx, .xls, .csv, .txt</p>
          </>
        )}
      </div>

      {files.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-oratioo-dark">Archivos ({files.length})</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleUpload} disabled={uploading} className="btn-success flex items-center gap-2 text-sm">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Subiendo...' : 'Confirmar subida'}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {files.map(f => (
              <div key={f.id} className="flex items-center justify-between bg-oratioo-light/30 rounded-lg px-3 py-2 border border-oratioo-border">
                <div className="flex items-center gap-2">
                  {['xlsx', 'xls'].includes(f.name.split('.').pop().toLowerCase())
                    ? <FileSpreadsheet size={20} className="text-emerald-400" />
                    : f.name.endsWith('.csv')
                      ? <FileText size={20} className="text-oratioo-gray" />
                      : <File size={20} className="text-oratioo-gray" />}
                  <div>
                    <p className="text-sm text-oratioo-dark">{f.name}</p>
                    <p className="text-xs text-oratioo-gray">{formatSize(f.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => previewFile(f)} className="text-xs text-oratioo-gray hover:text-oratioo-dark p-1">
                    <Eye size={16} />
                  </button>
                  <button onClick={() => removeFile(f.id)} className="text-xs text-red-500 hover:text-red-700 p-1">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-oratioo-dark">{preview.name}</h3>
            <button onClick={() => setPreview(null)} className="text-oratioo-gray hover:text-oratioo-dark"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-oratioo-light/40 rounded-lg px-3 py-2 border border-oratioo-border">
              <p className="text-xs text-oratioo-gray">Líneas</p>
              <p className="text-sm font-semibold text-oratioo-dark">{preview.totalLines}</p>
            </div>
            <div className="bg-oratioo-light/40 rounded-lg px-3 py-2 border border-oratioo-border">
              <p className="text-xs text-oratioo-gray">Columna DNI</p>
              <p className="text-sm font-semibold text-oratioo-gray">{preview.detectedCol}</p>
            </div>
            <div className="bg-oratioo-light/40 rounded-lg px-3 py-2 border border-oratioo-border">
              <p className="text-xs text-oratioo-gray">DNIs</p>
              <p className="text-sm font-semibold text-oratioo-dark">{preview.dnis.length}</p>
            </div>
          </div>
          {preview.dnis.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {preview.dnis.slice(0, 20).map(d => (
                <span key={d} className="bg-oratioo-light text-xs font-mono text-oratioo-dark px-2 py-0.5 rounded border border-oratioo-border">{d}</span>
              ))}
              {preview.dnis.length > 20 && <span className="text-xs text-oratioo-gray self-center">+{preview.dnis.length - 20}</span>}
            </div>
          )}
          <pre className="text-xs text-oratioo-gray font-mono whitespace-pre-wrap bg-oratioo-light/50 rounded-lg p-3 border border-oratioo-border">
            {preview.sample.join('\n')}
          </pre>
        </div>
      )}

      {/* History */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-oratioo-dark flex items-center gap-2">
            <Clock size={14} className="text-oratioo-gray" /> Historial de cargas
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setSoloHoy(!soloHoy)}
              className={`text-xs px-3 py-2 rounded-lg border transition-all flex items-center gap-1.5 ${
                soloHoy ? 'bg-[#481163] text-white border-[#481163]' : 'bg-white text-oratioo-dark border-oratioo-border hover:bg-oratioo-light'
              }`}
              title={soloHoy ? 'Mostrar todos los días' : 'Mostrar solo hoy'}>
              <Clock size={14} /> {soloHoy ? 'Solo hoy' : 'Ver todo'}
            </button>
            <button onClick={fetchHistory} disabled={loadingHistory}
              className="text-xs bg-white border border-oratioo-border text-oratioo-dark px-3 py-2 rounded-lg hover:bg-oratioo-light transition-all flex items-center gap-1.5"
              title="Actualizar historial">
              <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
            </button>
            {!analyzing && uploaded.length > 0 && (
              <button onClick={handleStartAnalysis} disabled={!agenteActivo}
                className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
                  agenteActivo
                    ? 'bg-[#0a6ea9] hover:bg-[#085d8f] text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
                title={agenteActivo ? 'Iniciar análisis' : 'No hay agentes activos. Inicia agente.py primero.'}>
                <Play size={16} /> {agenteActivo ? 'Iniciar análisis' : 'Agente inactivo'}
              </button>
            )}
            {analyzing && (
              <span className="text-purple-600 text-sm flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Analizando...
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-oratioo-border">
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
                  const hoy = hoyLocal()
                  const grupos = {}
                  for (const h of uploaded) {
                    const dia = utcToLocalDate(h.created_at)
                    if (soloHoy && dia !== hoy) continue
                    if (!grupos[dia]) grupos[dia] = { dia, docs: [], totalDnis: 0, completados: 0, analizando: 0, pendientes: 0 }
                    grupos[dia].docs.push(h)
                    grupos[dia].totalDnis += (h.total_dnis || 0)
                    if (h.estado === 'completado') grupos[dia].completados++
                    else if (h.estado === 'analizando') grupos[dia].analizando++
                    else grupos[dia].pendientes++
                  }
                  return Object.values(grupos).sort((a, b) => b.dia.localeCompare(a.dia)).map(grupo => {
                    const expandido = expandedDay === grupo.dia
                    const detalles = dayDetails[grupo.dia] || {}
                    const todoCompletado = grupo.completados === grupo.docs.length
                    const algunAnalizando = grupo.analizando > 0
                    return (
                      <React.Fragment key={grupo.dia}>
                        <tr
                          onClick={() => toggleDay(grupo.dia, grupo.docs)}
                          className="border-b border-oratioo-border hover:bg-oratioo-light/30 cursor-pointer">
                          <td className="table-cell !py-2 text-xs font-medium flex items-center gap-2">
                            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
                            <span className="text-xs text-oratioo-gray">Click para ver</span>
                          </td>
                        </tr>
                        {expandido && (
                          <tr>
                            <td colSpan={5} className="!p-0 !border-0">
                              <div className="bg-oratioo-light/30 px-6 py-3">
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b border-oratioo-border">
                                      <th className="table-header px-2 py-1 text-[10px]">Archivo</th>
                                      <th className="table-header px-2 py-1 text-[10px]">Total DNIs</th>
                                      <th className="table-header px-2 py-1 text-[10px]">Analizados</th>
                                      <th className="table-header px-2 py-1 text-[10px]">No cliente</th>
                                      <th className="table-header px-2 py-1 text-[10px]">Errores</th>
                                      <th className="table-header px-2 py-1 text-[10px]">Estado</th>
                                      <th className="table-header px-2 py-1 text-[10px]">Eliminar</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {grupo.docs.map(d => {
                                      const det = detalles[d.id]
                                      const proc = det ? det.procesados : (d.procesados || 0)
                                      const noCli = det ? det.noClientes : 0
                                      const err = det ? det.errores : 0
                                      const tot = det ? det.total : (d.total_dnis || 0)
                                      return (
                                        <tr key={d.id} className="border-b border-oratioo-border/50 hover:bg-white/50">
                                          <td className="px-2 py-1.5 text-xs text-oratioo-dark">{d.nombre_archivo}</td>
                                          <td className="px-2 py-1.5 text-xs text-oratioo-gray">{tot}</td>
                                          <td className="px-2 py-1.5 text-xs text-emerald-600">{proc}</td>
                                          <td className="px-2 py-1.5 text-xs text-amber-600">{noCli}</td>
                                          <td className="px-2 py-1.5 text-xs text-red-500">{err}</td>
                                          <td className="px-2 py-1.5">
                                            {d.estado === 'analizando' ? (
                                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-purple-50 text-purple-700 border border-purple-200">
                                                <Loader2 size={8} className="animate-spin" /> Analizando
                                              </span>
                                            ) : d.estado === 'completado' ? (
                                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <CheckCircle2 size={8} /> Completo
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200">
                                                <Database size={8} /> Cargado
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {deletingId === d.id ? (
                                              <Loader2 size={10} className="animate-spin text-red-400" />
                                            ) : (
                                              <button onClick={(e) => { e.stopPropagation(); handleDeleteDocument(d) }}
                                                className="text-xs text-red-500 hover:text-red-700 p-1 rounded-lg transition-all"
                                                title="Eliminar lote">
                                                <Trash2 size={12} />
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
