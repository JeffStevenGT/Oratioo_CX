import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload,
  FileSpreadsheet,
  FileText,
  File,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Eye,
  Table2,
  Search,
  Database,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import BotStatus from '../components/BotStatus'

// Parse DNIs/NIFs from text content (heuristic)
function extractDNIs(text) {
  const dnis = new Set()
  
  // 1. Normalizar: eliminar caracteres no imprimibles, comillas, BOM, guiones bajos, etc.
  const clean = text.replace(/^\uFEFF/, '')  // quitar BOM
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u200B-\u200F\uFEFF]/g, '')  // caracteres de control y zero-width
    .replace(/["'\u2018\u2019\u201C\u201D_]/g, '')  // todo tipo de comillas y guion bajo
  
  // 2. Regex específicos para cada tipo de documento español:
  //    - 12345678A (DNI) - 7-8 dígitos + 1 letra
  //    - B12345678 (NIF) - 1 letra + 8 dígitos
  //    - X1234567A (NIE) - 1 letra + 7 dígitos + 1 letra
  //    - 08907904G (NIF que empieza con dígito, 8 dígitos + letra)
  //    - X-1234567-A (NIE con guiones)
  const matches = clean.match(/\b(?:[A-Za-z]\d{8}|\d{7,8}[A-Za-z]|[A-Za-z]\d{7}[A-Za-z])\b/g)
  
  // 3. También buscar NIE con guiones: X-1234567-A
  const nieGuiones = clean.match(/\b[A-Za-z]-\d{7}-[A-Za-z]\b/g)
  
  if (matches) matches.forEach((d) => dnis.add(d.toUpperCase()))
  if (nieGuiones) nieGuiones.forEach((d) => dnis.add(d.toUpperCase().replace(/-/g, '')))
  
  return Array.from(dnis)
}

// Detect DNI column from CSV/TSV header
function detectColumn(headers) {
  const dniKeywords = ['dni', 'documento', 'identidad', 'nrodocumento', 'num_doc', 'documento_identidad', 'cedula', 'id']
  for (const h of headers) {
    const hclean = h.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (dniKeywords.some((k) => hclean.includes(k))) return h
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
  const [search, setSearch] = useState('')
  const [analyzingId, setAnalyzingId] = useState(null)
  const [analyzingProgress, setAnalyzingProgress] = useState({ current: 0, total: 0 })
  const [deletingId, setDeletingId] = useState(null)


  // ── Cargar historial desde Supabase ─────────────────────────
  const fetchHistory = async () => {
    setLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      setUploaded(data || [])
    } catch (err) {
      console.error('Error cargando historial:', err?.message || err)
      setUploaded([])
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => { fetchHistory() }, [])

  const onDrop = useCallback((acceptedFiles) => {
    setError('')
    const newFiles = acceptedFiles.map((f) => ({
      id: `${f.name}-${Date.now()}`,
      file: f,
      name: f.name,
      size: f.size,
      type: f.type || f.name.split('.').pop(),
    }))
    setFiles((prev) => [...prev, ...newFiles])
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
    setFiles((prev) => prev.filter((f) => f.id !== id))
    if (preview?.id === id) setPreview(null)
  }

  const previewFile = async (fileData) => {
    setError('')
    try {
      const text = await fileData.file.text()
      const lines = text.split('\n').filter(Boolean)
      const headerLine = lines[0] || ''
      const headers = headerLine.split(/[,;\t|]/).map((h) => h.trim().replace(/^"|"$/g, ''))

      const detectedCol = detectColumn(headers)
      const dnis = extractDNIs(text)

      setPreview({
        id: fileData.id,
        name: fileData.name,
        headers,
        detectedCol,
        dnis,
        totalLines: lines.length,
        sample: lines.slice(0, 6),
      })
    } catch (err) {
      setError('No se pudo leer el archivo. Asegúrate de que sea .xlsx, .csv o .txt.')
    }
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setError('')

    try {
      for (const f of files) {
        const ext = f.name.split('.').pop().toLowerCase()
        if (['xlsx', 'xls'].includes(ext)) {
          setError(f.name + ' es binario. Conviértelo a .csv o .txt.')
          continue
        }

        const text = await f.file.text()
        const dnis = extractDNIs(text)

        if (dnis.length === 0) {
          setError('No se encontraron DNIs válidos en ' + f.name)
          continue
        }

        const { data: doc, error: errDoc } = await supabase
          .from('documentos')
          .insert({
            nombre_archivo: f.name,
            semana: new Date().toISOString().slice(0, 7),
            total_dnis: dnis.length,
            procesados: 0,
            pendientes: dnis.length,
            errores: 0,
            no_encontrados: 0,
          })
          .select()
          .single()

        if (errDoc) {
          console.error('Error insertando en documentos:', errDoc?.message || errDoc)
          setError('Error al guardar en Supabase: ' + (errDoc?.message || JSON.stringify(errDoc)))
          continue
        }

        let insertados = 0
        for (const dni of dnis) {
          const { error: errIns } = await supabase
            .from('lineas')
            .insert({
              dni,
              nombre: 'N/A',
              direccion: 'N/A',
              linea: 'N/A',
              paquete: 'N/A',
              atributos_dinamicos: {
                estado: 'pendiente',
                datos_basicos: { nombre: 'N/A', direccion: 'N/A' },
                pipeline: { estado: 'pendiente', asesor_id: null, notas: '' },
                documento_id: doc.id,
              },
            })

          if (errIns && errIns.code !== '23505') {
            console.error('Error insertando DNI:', dni, errIns)
          } else if (!errIns) {
            insertados++
          }
        }

        await supabase
          .from('documentos')
          .update({ procesados: insertados, pendientes: dnis.length - insertados })
          .eq('id', doc.id)
      }

      await fetchHistory()
      setFiles([])
      setPreview(null)
      // Limpiar error si todo salio bien
      setError('')
    } catch (err) {
      setError('Error al subir archivos: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Iniciar análisis del bot ──────────────────────────────────
  // ── Iniciar análisis del bot ──────────────────────────────────
  const handleStartAnalysis = async (doc) => {
    setAnalyzingId(doc.id)
    setAnalyzingProgress({ current: 0, total: doc.total_dnis })

    // Marcar como en progreso
    await supabase.from('documentos').update({ estado: 'analizando' }).eq('id', doc.id)

    // Leer configuración de máquinas desde Supabase
    const { data: maquinas } = await supabase.from('maquinas').select('*')
    if (!maquinas || maquinas.length === 0) {
      alert('No hay máquinas configuradas. Ve a Configurar Bot primero.')
      setAnalyzingId(null)
      await supabase.from('documentos').update({ estado: 'pendiente' }).eq('id', doc.id)
      return
    }

    // Verificar al menos una máquina con heartbeat reciente (< 20s)
    const ahora = Date.now()
    const online = maquinas.filter(m => {
      if (m.estado !== 'conectado' && m.estado !== 'activo') return false
      if (!m.ultimo_heartbeat) return false
      const diff = ahora - new Date(m.ultimo_heartbeat).getTime()
      return diff < 20000 // heartbeat menos de 20s
    })
    if (online.length === 0) {
      alert('No hay agentes activos. Asegúrate de tener python agente.py corriendo en al menos una máquina.')
      setAnalyzingId(null)
      await supabase.from('documentos').update({ estado: 'pendiente' }).eq('id', doc.id)
      return
    }

    // Construir workers_config
    const workersConfig = {}
    for (const m of maquinas) {
      if (m.nombre) {
        workersConfig[m.nombre] = parseInt(m.workers_config) || 1
      }
    }

    // Enviar comando a comandos_bot para cada máquina
    const comandos = maquinas.map(m => ({
      maquina_destino: m.nombre,
      comando: 'iniciar',
      parametros: {
        workers_config: workersConfig,
        documento_id: doc.id,
        documento_nombre: doc.nombre_archivo,
      },
      estado: 'pendiente',
    }))

    try {
      const { error } = await supabase.from('comandos_bot').insert(comandos)
      if (error) throw error
    } catch (err) {
      console.error('Error enviando comandos:', err)
    }

    // Monitorear progreso desde lineas (contar SOLO DNIs de este documento)
    const total = doc.total_dnis
    const interval = setInterval(async () => {
      const { count, error } = await supabase
        .from('lineas')
        .select('id', { count: 'exact', head: true })
        .contains('atributos_dinamicos', { documento_id: doc.id })
        .not('atributos_dinamicos->>estado', 'eq', 'pendiente')
      if (!error && count !== null) {
        const procesados = parseInt(count) || 0
        setAnalyzingProgress({ current: procesados, total })
        if (procesados >= total) {
          clearInterval(interval)
          setAnalyzingId(null)
          await supabase.from('documentos').update({ estado: 'completado' }).eq('id', doc.id)
          await supabase.from('documentos').update({ procesados }).eq('id', doc.id)
          await fetchHistory()
        }
      }
    }, 2000)

    // Timeout según tamaño del documento (30s x DNI, mínimo 5min)
    const timeoutMs = Math.max(300000, total * 30000)
    setTimeout(() => {
      clearInterval(interval)
      setAnalyzingId(null)
      supabase.from('documentos').update({ estado: 'pendiente' }).eq('id', doc.id)
      fetchHistory()
      alert('El análisis tardó demasiado. Verifica que el agente esté funcionando correctamente.')
    }, timeoutMs)
  }
  // ── Eliminar documento ──────────────────────────────────────
  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`¿Eliminar "${doc.nombre_archivo}" y sus ${doc.total_dnis} DNIs?`)) return

    setDeletingId(doc.id)
    try {
      // Eliminar lineas asociadas a este documento
      // (buscamos las que tengan atributos_dinamicos->documento_id = doc.id)
      const { data: lineas } = await supabase
        .from('lineas')
        .select('id')
        .contains('atributos_dinamicos', { documento_id: doc.id })

      if (lineas && lineas.length > 0) {
        const ids = lineas.map(l => l.id)
        await supabase.from('lineas').delete().in('id', ids)
      }

      // Eliminar el documento
      const { error } = await supabase.from('documentos').delete().eq('id', doc.id)
      if (error) throw error

      await fetchHistory()
    } catch (err) {
      console.error('Error eliminando documento:', err)
      alert('Error al eliminar: ' + (err.message || err))
    } finally {
      setDeletingId(null)
    }
  }

  // ── Re-analizar documento (resetear DNIs + iniciar) ────────────
  const handleReanalyze = async (doc) => {
    if (!window.confirm(`¿Re-analizar "${doc.nombre_archivo}"? Se resetearán todos sus ${doc.total_dnis} DNIs.`)) return

    setAnalyzingId(doc.id)
    setAnalyzingProgress({ current: 0, total: doc.total_dnis })

    try {
      // Resetear todos los DNIs de este documento a pendiente
      // IMPORTANTE: preservar pipeline (asignaciones de asesores) y documento_id
      const { data: lineas } = await supabase
        .from('lineas')
        .select('id,atributos_dinamicos')
        .contains('atributos_dinamicos', { documento_id: doc.id })

      if (lineas && lineas.length > 0) {
        const batchSize = 50
        for (let i = 0; i < lineas.length; i += batchSize) {
          const batch = lineas.slice(i, i + batchSize)
          for (const linea of batch) {
            const ad = linea.atributos_dinamicos || {}
            // Preservar pipeline existente (asignacion, notas, etc.)
            const pipelineExistente = ad.pipeline || { estado: 'pendiente', asesor_id: null, notas: '' }
            // Resetear: dejar solo estado pendiente + documento_id + pipeline
            await supabase
              .from('lineas')
              .update({
                atributos_dinamicos: {
                  estado: 'pendiente',
                  documento_id: doc.id,
                  pipeline: pipelineExistente,
                }
              })
              .eq('id', linea.id)
          }
        }
      }

      // Resetear el documento a estado pendiente
      await supabase
        .from('documentos')
        .update({ estado: null, procesados: 0, pendientes: doc.total_dnis })
        .eq('id', doc.id)

      // Refrescar historial
      await fetchHistory()

      // Lanzar análisis igual que handleStartAnalysis
      await handleStartAnalysis({ ...doc, estado: null })
    } catch (err) {
      console.error('Error re-analizando:', err)
      alert('Error al re-analizar: ' + (err.message || err))
      setAnalyzingId(null)
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (name) => {
    const ext = name.split('.').pop().toLowerCase()
    if (['xlsx', 'xls'].includes(ext)) return <FileSpreadsheet size={20} className="text-emerald-400" />
    if (ext === 'csv') return <FileText size={20} className="text-oratioo-gray" />
    return <File size={20} className="text-oratioo-gray" />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-oratioo-dark flex items-center gap-2"><Upload size={22} className="text-oratioo-purple" /> Subida de documentos</h1>
        <p className="text-sm text-oratioo-gray mt-1">
          Carga archivos .xlsx, .csv o .txt con DNIs de clientes
        </p>
      </div>

      {/* Bot Status */}
      <BotStatus />

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-oratioo-purple bg-purple-50'
            : 'border-oratioo-border hover:border-oratioo-purple bg-white hover:bg-oraito-light'
        }`}
      >
        <input {...getInputProps()} />
        <Upload
          size={40}
          className={`mx-auto mb-3 ${isDragActive ? 'text-oratioo-gray' : 'text-oratioo-gray'}`}
        />
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

      {/* Files list */}
      {files.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-oratioo-dark">
              Archivos seleccionados ({files.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="btn-success flex items-center gap-2 text-sm"
              >
                {uploading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {uploading ? 'Subiendo...' : 'Confirmar subida'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 mb-3 flex items-center gap-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between bg-oratioo-light/40 rounded-lg px-4 py-3 border border-oratioo-border"
              >
                <div className="flex items-center gap-3">
                  {getFileIcon(f.name)}
                  <div>
                    <p className="text-sm text-oratioo-dark font-medium">{f.name}</p>
                    <p className="text-xs text-oratioo-gray">{formatSize(f.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => previewFile(f)}
                    className="p-1.5 rounded-lg hover:bg-[#f5ebf3] text-oratioo-gray hover:text-oratioo-dark transition-colors"
                    title="Previsualizar"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => removeFile(f.id)}
                    className="p-1.5 rounded-lg hover:bg-[#f5ebf3] text-oratioo-gray hover:text-oratioo-gray transition-colors"
                    title="Eliminar"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-oratioo-dark flex items-center gap-2">
              <Table2 size={14} className="text-oratioo-gray" />
              Vista previa: {preview.name}
            </h3>
            <button onClick={() => setPreview(null)} className="p-1 rounded hover:bg-[#f5ebf3] text-oratioo-gray hover:text-oratioo-dark">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-oratioo-light/40 rounded-lg px-3 py-2 border border-oratioo-border">
              <p className="text-xs text-oratioo-gray">Columnas detectadas</p>
              <p className="text-sm font-semibold text-oratioo-dark">{preview.headers.length}</p>
            </div>
            <div className="bg-oratioo-light/40 rounded-lg px-3 py-2 border border-oratioo-border">
              <p className="text-xs text-oratioo-gray">Columna DNI</p>
              <p className="text-sm font-semibold text-oratioo-gray">{preview.detectedCol}</p>
            </div>
            <div className="bg-oratioo-light/40 rounded-lg px-3 py-2 border border-oratioo-border">
              <p className="text-xs text-oratioo-gray">DNIs encontrados</p>
              <p className="text-sm font-semibold text-oratioo-dark">{preview.dnis.length}</p>
            </div>
          </div>

          {preview.dnis.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-oratioo-gray mb-1">Primeros DNIs:</p>
              <div className="flex flex-wrap gap-1">
                {preview.dnis.slice(0, 20).map((dni) => (
                  <span key={dni} className="bg-oratioo-light text-xs font-mono text-oratioo-dark px-2 py-0.5 rounded border border-oratioo-border">
                    {dni}
                  </span>
                ))}
                {preview.dnis.length > 20 && (
                  <span className="text-xs text-oratioo-gray self-center">+{preview.dnis.length - 20} más</span>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-oratioo-gray mb-1">Primeras filas:</p>
            <div className="bg-oratioo-light/50 rounded-lg p-3 border border-oratioo-border overflow-x-auto">
              <pre className="text-xs text-oratioo-gray font-mono whitespace-pre-wrap">
                {preview.sample.join('\n')}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div className="card">
        <h3 className="text-sm font-semibold text-oratioo-dark mb-3 flex items-center gap-2">
          <Clock size={14} className="text-oratioo-gray" />
          Historial de cargas
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-oratioo-border">
                <th className="table-header px-3 py-2">Archivo</th>
                <th className="table-header px-3 py-2">DNIs</th>
                <th className="table-header px-3 py-2">Fecha</th>
                <th className="table-header px-3 py-2">Estado</th>
                <th className="table-header px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <tr><td colSpan={5} className="text-center py-8">
                  <Loader2 size={20} className="animate-spin text-oratioo-purple mx-auto" />
                </td></tr>
              ) : uploaded.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-oratioo-gray text-sm">
                  Aún no hay cargas registradas
                </td></tr>
              ) : (
                uploaded.map((h) => (
                  <tr key={h.id} className="border-b border-oratioo-border hover:bg-oratioo-light/30">
                    <td className="table-cell !py-2 text-xs">{h.nombre_archivo}</td>
                    <td className="table-cell !py-2 text-xs">{h.total_dnis}</td>
                    <td className="table-cell !py-2 text-xs text-oratioo-gray">
                      {h.created_at ? new Date(h.created_at).toLocaleString('es') : '—'}
                    </td>
                    <td className="table-cell !py-2">
                      {h.estado === 'analizando' ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-normal bg-purple-50 text-purple-700 border border-purple-200">
                          <Loader2 size={10} className="animate-spin" /> Analizando...
                        </span>
                      ) : h.procesados === h.total_dnis ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-normal bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={10} /> {h.procesados}/{h.total_dnis}
                        </span>
                      ) : h.procesados > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-normal bg-amber-50 text-amber-600 border border-amber-200">
                          <Clock size={10} /> {h.procesados}/{h.total_dnis}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-normal bg-blue-50 text-blue-600 border border-blue-200">
                          <Database size={10} /> {h.procesados}/{h.total_dnis}
                        </span>
                      )}
                    </td>
                    <td className="table-cell !py-2">
                      <div className="flex items-center gap-1.5">
                        {analyzingId === h.id ? (
                          <span className="flex items-center gap-1 text-xs text-purple-600">
                            <Loader2 size={12} className="animate-spin" /> Procesando...
                          </span>
                        ) : h.estado === 'completado' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-emerald-600 font-medium">Completado</span>
                            <button
                              onClick={() => handleReanalyze(h)}
                              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
                              title="Re-analizar este documento"
                            >
                              <RefreshCw size={11} /> Re-analizar
                            </button>
                          </div>
                        ) : h.estado === 'analizando' || analyzingId !== null ? (
                          <span className="text-xs text-purple-600">En cola...</span>
                        ) : (
                          <button
                            onClick={() => handleStartAnalysis(h)}
                            className="text-xs bg-[#0a6ea9] hover:bg-[#085d8f] text-white px-3 py-1 rounded-lg transition-all"
                          >
                            Iniciar análisis
                          </button>
                        )}
                        {deletingId === h.id ? (
                          <Loader2 size={12} className="animate-spin text-red-400" />
                        ) : (
                          <button
                            onClick={() => handleDeleteDocument(h)}
                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                            title="Eliminar documento"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
