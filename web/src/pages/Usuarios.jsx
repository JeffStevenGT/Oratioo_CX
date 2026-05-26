import { useState, useEffect } from 'react'
import {
  Plus, Trash2, Edit3, X, Users, ChevronDown, ChevronRight,
  Shield, UserCheck, UserX, Clock, Globe,
} from 'lucide-react'
import { supabase } from '../supabaseClient'

// Tabla de usuarios en Supabase (crear con migracion_usuarios.sql)
const TABLA_USUARIOS = 'usuarios'

// --- Roles disponibles ---

const ROLES = [
  { value: 'asesor', label: 'Asesor', desc: 'Visualiza Dashboard y Power Dialer para gestionar sus leads asignados.' },
  { value: 'back_office', label: 'Back Office', desc: 'Visualiza Dashboard, Clientes y Documentos. Puede subir archivos.' },
  { value: 'it', label: 'IT', desc: 'Acceso a Dashboard, Clientes, Proxies, Maquinas y Workers. Gestiona infraestructura.' },
  { value: 'jefe_area', label: 'Jefe de Area / CEO', desc: 'Acceso completo al sistema. Gestiona supervisores, equipos e infraestructura.' },
  { value: 'supervisor', label: 'Supervisor', desc: 'Gestiona asesores asignados. Visualiza Dashboard, Clientes y Documentos de su equipo.' },
  { value: 'desarrollador', label: 'Desarrollador', desc: 'Acceso total al sistema. Puede gestionar usuarios y toda la configuracion.' },
]

const ROL_COLORS = {
  supervisor: 'bg-amber-100 text-amber-700',
  asesor: 'bg-blue-100 text-blue-700',
  back_office: 'bg-slate-100 text-slate-700',
  it: 'bg-purple-100 text-purple-700',
  jefe_area: 'bg-emerald-100 text-emerald-700',
  desarrollador: 'bg-red-100 text-red-700',
}

// --- Permisos por rol (para sidebar) ---
export const ROL_PERMISOS = {
  supervisor: ['dashboard', 'clientes', 'documentos', 'usuarios', 'ranking', 'metas', 'alertas'],
  asesor: ['dashboard', 'dialer', 'agenda', 'ranking', 'metas', 'alertas'],
  back_office: ['dashboard', 'clientes', 'documentos'],
  it: ['dashboard', 'clientes', 'proxies', 'maquinas', 'workers'],
  jefe_area: ['dashboard', 'clientes', 'proxies', 'maquinas', 'documentos', 'workers', 'usuarios', 'lotes', 'ranking', 'metas', 'alertas'],
  desarrollador: ['dashboard', 'clientes', 'proxies', 'maquinas', 'documentos', 'workers', 'usuarios', 'dialer', 'agenda', 'ranking', 'metas', 'alertas'],
}

// --- Paises y banderas ---
const PAISES = [
  { clave: 'Espana', label: 'Espa\u00f1a', bandera: '\ud83c\uddea\ud83c\uddf8' },
  { clave: 'Peru', label: 'Per\u00fa', bandera: '\ud83c\uddf5\ud83c\uddea' },
]

const PAIS_MAP = {
  Espana: { label: 'Espa\u00f1a', bandera: '\ud83c\uddea\ud83c\uddf8' },
  Peru: { label: 'Per\u00fa', bandera: '\ud83c\uddf5\ud83c\uddea' },
}

function getPaisInfo(equipo) {
  return PAIS_MAP[equipo] || { label: equipo, bandera: '\ud83c\udf10' }
}






// ── Datos desde Supabase (no localStorage) ──
let usuariosCache = []

async function getUsuariosAsync() {
  try {
    const { data, error } = await supabase.from(TABLA_USUARIOS).select('*').order('id', { ascending: true })
    if (data && !error) {
      usuariosCache = data
      return usuariosCache
    }
  } catch (e) {
    console.log('Supabase usuarios no disponible')
  }
  usuariosCache = []
  return usuariosCache
}

function getUsuarios() {
  // Síncrono: devuelve cache; async: getUsuariosAsync
  return usuariosCache.length > 0 ? usuariosCache : []
}





// --- Formateo de fecha ---
function formatearFecha(iso) {
  if (!iso) return '\u2014'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch (_) {
    return '\u2014'
  }
}

// --- Construir arbol jerarquico ---
function construirArbol(usuarios, session) {
  const esSupervisor = session.rol === 'supervisor'
  const rolesStaff = ['desarrollador', 'jefe_area', 'it', 'back_office']

  let filtrados = usuarios
  if (esSupervisor) {
    filtrados = usuarios.filter(function (u) {
      return u.id === session.id || (u.equipo === session.equipo && u.supervisor_id === session.id)
    })
  } else {
    filtrados = usuarios.filter(function (u) { return !rolesStaff.includes(u.rol) })
  }

  const paises = {}

  for (const pais of PAISES) {
    const usuariosPais = filtrados.filter(function (u) { return u.equipo === pais.clave })
    if (usuariosPais.length === 0) continue

    const supervisores = usuariosPais.filter(function (u) { return u.supervisor_id === null })

    const asesoresMap = {}
    for (const u of usuariosPais) {
      if (u.supervisor_id !== null) {
        if (!asesoresMap[u.supervisor_id]) asesoresMap[u.supervisor_id] = []
        asesoresMap[u.supervisor_id].push(u)
      }
    }

    paises[pais.clave] = {
      info: pais,
      supervisores: supervisores.map(function (sup) {
        return { ...sup, asesores: asesoresMap[sup.id] || [] }
      }),
    }
  }

  return paises
}

// --- Construir lista de staff ---
function construirStaff(usuarios, session) {
  const rolesStaff = ['desarrollador', 'jefe_area', 'it', 'back_office']
  if (session.rol === 'supervisor' || session.rol === 'asesor') {
    return []
  }
  return usuarios.filter(function (u) { return rolesStaff.includes(u.rol) })
}

// ==============================================================
// COMPONENTE PRINCIPAL
// ==============================================================

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ usuario: '', password: '', nombre: '', email: '', rol: 'asesor', equipo: 'Peru', grupo: '', supervisor_id: '' })
  const [error, setError] = useState('')
  const [paisesExpandidos, setPaisesExpandidos] = useState({})
  const [supervisoresExpandidos, setSupervisoresExpandidos] = useState({})
  const [searchUser, setSearchUser] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [equipos, setEquipos] = useState([])
  const [proxyModal, setProxyModal] = useState({ open: false, user: null, value: '' })
  const PAGE_SIZE = 10

  const session = JSON.parse(localStorage.getItem('oratioo_session') || '{}')
  const myRol = session.rol
  const canManage = myRol === 'supervisor' || myRol === 'jefe_area' || myRol === 'desarrollador'

  useEffect(function () {
    getUsuariosAsync().then(lista => {
      setUsuarios(lista)
      const exp = {}
      for (const p of PAISES) exp[p.clave] = true
      setPaisesExpandidos(exp)
      setLoading(false)
    })
    supabase.from('equipos').select('*').then(({ data }) => {
      if (data) setEquipos(data)
    })
  }, [])

  const refresh = function () {
    getUsuariosAsync().then(lista => setUsuarios(lista))
  }

  // Construir arbol
  const arbol = construirArbol(usuarios, session)
  const paisesOrdenados = PAISES.filter(function (p) { return arbol[p.clave] })

  // Construir staff
  const staffUsuarios = construirStaff(usuarios, session)

  // Filtrar por busqueda
  function usuarioCoincide(u, query) {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      u.usuario.toLowerCase().includes(q) ||
      u.nombre.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.rol.toLowerCase().includes(q) ||
      (getPaisInfo(u.equipo).label.toLowerCase() || '').includes(q)
    )
  }

  function filtrarArbol(arbolData) {
    if (!searchUser.trim()) return arbolData
    const q = searchUser.toLowerCase()
    const resultado = {}
    for (const [clave, pais] of Object.entries(arbolData)) {
      const supervisoresFiltrados = pais.supervisores
        .map(function (sup) {
          const asesoresFiltrados = sup.asesores.filter(function (a) { return usuarioCoincide(a, q) })
          const supCoincide = usuarioCoincide(sup, q)
          if (supCoincide || asesoresFiltrados.length > 0) {
            return {
              ...sup,
              asesores: supCoincide ? sup.asesores : asesoresFiltrados,
            }
          }
          return null
        })
        .filter(Boolean)
      if (supervisoresFiltrados.length > 0) {
        resultado[clave] = { ...pais, supervisores: supervisoresFiltrados }
      }
    }
    return resultado
  }

  const arbolFiltrado = filtrarArbol(arbol)

  // Paginacion a nivel de supervisor
  let todosSupervisores = []
  for (const p of paisesOrdenados) {
    const pais = arbolFiltrado[p.clave]
    if (!pais) continue
    for (const sup of pais.supervisores) {
      todosSupervisores.push({ paisClave: p.clave, ...sup })
    }
  }

  const totalItems = todosSupervisores.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const paginados = todosSupervisores.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // Paises en pagina actual
  const paisesEnPagina = []
  const vistos = new Set()
  for (const item of paginados) {
    if (!vistos.has(item.paisClave)) {
      vistos.add(item.paisClave)
      const pais = arbolFiltrado[item.paisClave]
      if (pais) {
        paisesEnPagina.push({
          clave: item.paisClave,
          info: pais.info,
          supervisores: [],
        })
      }
    }
  }
  for (const item of paginados) {
    const paisObj = paisesEnPagina.find(function (p) { return p.clave === item.paisClave })
    if (paisObj) {
      paisObj.supervisores.push(item)
    }
  }

  // Abrir modal crear
  const openCreate = function () {
    setEditingId(null)
    const supEquipo = session.equipo || 'Peru'
    setForm({
      usuario: '',
      password: '',
      nombre: '',
      email: '',
      rol: session.rol === 'supervisor' ? 'asesor' : 'asesor',
      equipo: supEquipo,
      grupo: '',
      supervisor_id: session.rol === 'supervisor' ? session.id : '',
    })
    setError('')
    setShowModal(true)
  }

  // Abrir modal editar
  const openEdit = function (u) {
    setEditingId(u.id)
    setForm({
      usuario: u.usuario,
      password: '',
      nombre: u.nombre || '',
      email: u.email || '',
      rol: u.rol || 'asesor',
      equipo: u.equipo || 'Peru',
      grupo: u.grupo || '',
      supervisor_id: u.supervisor_id !== null && u.supervisor_id !== undefined ? u.supervisor_id : '',
    })
    setError('')
    setShowModal(true)
  }

  // Guardar (crear o editar)
  const handleSave = async function () {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    if (myRol !== 'supervisor' && !form.equipo) { setError('El equipo/pais es requerido'); return }

    if (editingId) {
      // --- EDITAR usuario existente ---
      const obj = {
        usuario: form.email.trim().split('@')[0],
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        rol: form.rol,
        equipo: form.equipo,
        grupo: form.grupo.trim(),
        supervisor_id: form.supervisor_id !== '' ? Number(form.supervisor_id) : null,
      }
      if (form.password.trim()) {
        obj.password = form.password
      }
      try {
        const { error } = await supabase.from(TABLA_USUARIOS).update(obj).eq('id', editingId)
        if (error) { setError('Error al actualizar: ' + error.message); return }
      } catch (e) {
        setError('Error de conexion al actualizar'); return
      }
    } else {
      // --- CREAR nuevo usuario ---
      if (!form.email.trim()) { setError('El email es requerido'); return }
      if (!form.password.trim()) { setError('La contrasena es requerida'); return }

      // Validar duplicado por email
      try {
        const { data: dupEmail } = await supabase
          .from(TABLA_USUARIOS)
          .select('id')
          .eq('email', form.email.trim())
          .maybeSingle()
        if (dupEmail) { setError('El email ya esta registrado'); return }
      } catch (_) { /* ignorar error de consulta */ }

      // Generar usuario desde email (parte antes del @)
      const usuarioGenerado = form.email.trim().split('@')[0]
      if (!usuarioGenerado) { setError('Email invalido'); return }
      
      // Validar duplicado por usuario
      try {
        const { data: dupUser } = await supabase
          .from(TABLA_USUARIOS)
          .select('id')
          .eq('usuario', usuarioGenerado)
          .maybeSingle()
        if (dupUser) { setError('El usuario \"' + usuarioGenerado + '\" ya existe. Usa otro email.'); return }
      } catch (_) { /* ignorar error de consulta */ }

      // 1. Crear cuenta en Supabase Auth
      try {
        const { error: authError } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
        })
        if (authError) {
          if (authError.message.toLowerCase().includes('already registered') ||
              authError.message.toLowerCase().includes('already exists')) {
            setError('El email ya esta registrado en el sistema de autenticacion')
          } else {
            setError('Error al crear cuenta de acceso: ' + authError.message)
          }
          return
        }
      } catch (e) {
        setError('Error de conexion al crear cuenta de acceso'); return
      }

      // 2. Insertar en la tabla usuarios (sin id, lo genera Supabase)
      try {
        const { error: insertError } = await supabase.from(TABLA_USUARIOS).insert({
          usuario: usuarioGenerado,
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          rol: form.rol,
          equipo: form.equipo,
          grupo: form.grupo.trim(),
          supervisor_id: form.supervisor_id !== '' ? Number(form.supervisor_id) : null,
          activo: true,
          ultima_conexion: null,
        })
        if (insertError) {
          setError('Error al guardar en la base de datos: ' + insertError.message)
          return
        }
      } catch (e) {
        setError('Error de conexion al guardar'); return
      }
    }

    setShowModal(false)
    refresh()
  }

  // Cambiar estado activo/inactivo
  const toggleEstado = async function (id) {
    const user = usuarios.find(u => u.id === id)
    if (!user) return
    const newActive = !user.activo
    try {
      await supabase.from(TABLA_USUARIOS).update({ activo: newActive }).eq('id', id)
    } catch (e) {
      console.log('Error al cambiar estado:', e.message)
    }
    refresh()
  }

  // Eliminar usuario (soft delete)
  const handleDelete = async function (id, usuario) {
    if (!confirm('¿Eliminar al usuario "' + usuario + '"?')) return
    try {
      await supabase.from(TABLA_USUARIOS).update({ activo: false }).eq('id', id)
    } catch (e) {
      console.log('Error al eliminar usuario:', e.message)
    }
    refresh()
  }

  // Descripcion del rol seleccionado en el modal
  const rolSeleccionado = ROLES.find(function (r) { return r.value === form.rol })

  // Obtener supervisores disponibles para el equipo seleccionado
  const supervisoresDisponibles = usuarios.filter(function (u) {
    return u.id !== editingId && u.rol === 'supervisor' && u.equipo === form.equipo && u.activo !== false
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#1495e0]/30 border-t-[#1495e0] rounded-full animate-spin" />
      </div>
    )
  }

  // Filtrar staff por busqueda
  const staffFiltrados = searchUser
    ? staffUsuarios.filter(function (u) { return usuarioCoincide(u, searchUser) })
    : staffUsuarios

  const hayOperativos = Object.keys(arbolFiltrado).length > 0
  const noHayDatos = staffFiltrados.length === 0 && !hayOperativos

  return (
    <div className="space-y-6 animate-fade-in">
      { /* Header */ }
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1a1030] flex items-center gap-2"><Shield size={22} className="text-oratioo-purple" /> 
            {'Gesti\u00f3n de Usuarios'}
          </h1>
          <p className="text-sm text-[#7c757c] mt-1">
            {usuarios.length}
            {' usuario'}
            {usuarios.length !== 1 ? 's' : ''}
            {' registrado'}
            {usuarios.length !== 1 ? 's' : ''}
            {searchUser && ' \u00b7 ' + totalItems + ' coincidencias'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="bg-[#1495e0] hover:bg-[#0f7cc0] text-white flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg transition-all shadow-sm"
          >
            <Plus size={16} />
            {'Registrar usuario'}
          </button>
        )}
      </div>

      { /* Buscador */ }
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchUser}
            onChange={function (e) { setSearchUser(e.target.value); setCurrentPage(1) }}
            placeholder="Buscar por usuario, nombre, rol, email o pais..."
            className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-8 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1495e0]/20 focus:border-[#1495e0]"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          {searchUser && (
            <button
              onClick={function () { setSearchUser(''); setCurrentPage(1) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {totalItems > 0 && '' + totalItems + ' usuario' + (totalItems !== 1 ? 's' : '') + ' \u00b7 P\u00e1g ' + currentPage + ' de ' + totalPages}
        </div>
      </div>

      { /* Paginacion superior */ }
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={function () { setCurrentPage(function (p) { return Math.max(1, p - 1) }) }}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 text-xs rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {'Anterior'}
          </button>
          <span className="text-xs text-gray-500 px-2">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={function () { setCurrentPage(function (p) { return p + 1 }) }}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 text-xs rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {'Siguiente'}
          </button>
        </div>
      )}

            { /* Bloque 1: Administracion (staff) */ }
      {staffFiltrados.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-5 py-4 bg-white border-b border-[#e8dce6] flex items-center gap-2">
            <Shield size={18} className="text-[#1495e0]" />
            <h2 className="text-base font-semibold text-[#1a1030] flex-1">
              {'Administraci\u00f3n'}
            </h2>
            <span className="text-xs text-[#7c757c] bg-[#f0ecf0] rounded-full px-2.5 py-1">
              {staffFiltrados.length}
              {' miembro'}
              {staffFiltrados.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="bg-white divide-y divide-[#f0ecf0]">
            {staffFiltrados.map(function (staff) {
              const rolColor = ROL_COLORS[staff.rol] || 'bg-gray-100 text-gray-600'
              const rolLabel = ROLES.find(function (r) { return r.value === staff.rol })?.label || staff.rol
              return (
                <div key={staff.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f6fb]/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#e6f3fb] flex items-center justify-center text-[#1495e0] flex-shrink-0">
                    <Shield size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-medium text-[#1a1030]">{staff.usuario}</span>
                      <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + rolColor}>{rolLabel}</span>
                      {staff.grupo && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">{staff.grupo}</span>
                      )}
                      <span className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' + (staff.activo !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                        {staff.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="text-xs text-[#7c757c] mt-0.5 truncate">{staff.nombre} · {staff.email}</div>
                  </div>
                  <div className="hidden md:block text-xs text-[#7c757c] truncate max-w-[120px]">
                    {staff.ultima_conexion ? 'Últ. conexión: ' + new Date(staff.ultima_conexion).toLocaleDateString('es') : 'Sin conexión'}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={function () { openEdit(staff) }} className="p-1.5 rounded hover:bg-[#e6f3fb] text-[#7c757c] hover:text-[#1495e0] transition-colors" title="Editar">
                      <Edit3 size={14} />
                    </button>
                    <button onClick={function () { setProxyModal({ open: true, user: staff, value: staff.proxy_asignado || '' }) }} className="p-1.5 rounded hover:bg-[#1d366b] text-[#7c757c] hover:text-[#1495e0] transition-colors" title="Asignar proxy">
                      <Globe size={14} />
                    </button>
                    <button onClick={function () { handleDelete(staff.id, staff.usuario) }} className="p-1.5 rounded hover:bg-red-50 text-[#7c757c] hover:text-red-600 transition-colors" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      { /* Bloque 2: Equipos operativos por pais */ }
      {hayOperativos ? (
        <div className="space-y-4">
          {paisesEnPagina.map(function (pais) {
            const estaExpandidoPais = paisesExpandidos[pais.clave]
            return (
              <div key={pais.clave} className="card !p-0 overflow-hidden">
                { /* PRIMER NIVEL: Pais */ }
                <button
                  onClick={function () {
                    setPaisesExpandidos(function (prev) { return { ...prev, [pais.clave]: !prev[pais.clave] } })
                  }}
                  className="w-full flex items-center gap-3 px-5 py-4 bg-white hover:bg-[#f8f6fb]/80 transition-colors border-b border-[#e8dce6]"
                >
                  <span className="text-xl">{pais.info.bandera}</span>
                  <span className="text-base font-semibold text-[#1a1030] flex-1 text-left">
                    {pais.info.label}
                  </span>
                  <span className="text-xs text-[#7c757c] bg-[#f0ecf0] rounded-full px-2.5 py-1">
                    {pais.supervisores.length}
                    {' '}
                    {pais.supervisores.length === 1 ? 'responsable' : 'responsables'}
                  </span>
                  {estaExpandidoPais ? (
                    <ChevronDown size={18} className="text-[#7c757c]" />
                  ) : (
                    <ChevronRight size={18} className="text-[#7c757c]" />
                  )}
                </button>

                { /* SEGUNDO NIVEL: Supervisores */ }
                {estaExpandidoPais && (
                  <div className="bg-white">
                    {pais.supervisores.map(function (sup) {
                      const estaExpandidoSup = supervisoresExpandidos[sup.id]
                      const tieneAsesores = sup.asesores && sup.asesores.length > 0
                      const rolColor = ROL_COLORS[sup.rol] || 'bg-gray-100 text-gray-600'
                      const rolLabel = ROLES.find(function (r) { return r.value === sup.rol })?.label || sup.rol

                      return (
                        <div key={sup.id}>
                          { /* Fila del supervisor */ }
                          <div className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f6fb]/50 transition-colors border-b border-[#f0ecf0]">
                            {tieneAsesores ? (
                              <button
                                onClick={function () {
                                  setSupervisoresExpandidos(function (prev) {
                                    return { ...prev, [sup.id]: !prev[sup.id] }
                                  })
                                }}
                                className="p-0.5 rounded hover:bg-[#e8dce6] transition-colors flex-shrink-0"
                              >
                                {estaExpandidoSup ? (
                                  <ChevronDown size={14} className="text-[#7c757c]" />
                                ) : (
                                  <ChevronRight size={14} className="text-[#7c757c]" />
                                )}
                              </button>
                            ) : (
                              <span className="w-4 flex-shrink-0" />
                            )}

                            <div className="flex-1 flex items-center gap-3 min-w-0">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-medium text-[#1a1030]">{sup.usuario}</span>
                                  <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + rolColor}>{rolLabel}</span>
                                  {sup.grupo && (
                                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">{sup.grupo}</span>
                                  )}
                                  <span className={
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
                                    (sup.activo !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')
                                  }>
                                    {sup.activo !== false ? 'Activo' : 'Inactivo'}
                                  </span>
                                  {tieneAsesores && (
                                    <span className="text-xs text-[#7c757c]">
                                      {sup.asesores.length} asesor{sup.asesores.length !== 1 ? 'es' : ''}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[#7c757c] mt-0.5 truncate">
                                  {sup.nombre} \u00b7 {sup.email}
                                </div>
                              </div>

                              <div className="hidden md:block text-xs text-[#7c757c] flex-shrink-0">
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={11} />
                                  {formatearFecha(sup.ultima_conexion)}
                                </span>
                              </div>
                            </div>

                            {canManage && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={function (e) { e.stopPropagation(); openEdit(sup) }}
                                  className="p-1.5 rounded hover:bg-[#e6f3fb] text-[#7c757c] hover:text-[#1495e0] transition-colors"
                                  title="Editar usuario"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={function (e) {
                                    e.stopPropagation()
                                    setProxyModal({ open: true, user: sup, value: sup.proxy_asignado || '' })
                                  }}
                                  className="p-1.5 rounded hover:bg-[#1d366b] text-[#7c757c] hover:text-[#1495e0] transition-colors"
                                  title="Asignar proxy"
                                >
                                  <Globe size={14} />
                                </button>
                                <button
                                  onClick={function (e) { e.stopPropagation(); toggleEstado(sup.id) }}
                                  className={
                                    'p-1.5 rounded transition-colors ' +
                                    (sup.activo !== false
                                      ? 'hover:bg-amber-50 text-[#7c757c] hover:text-amber-600'
                                      : 'hover:bg-emerald-50 text-[#7c757c] hover:text-emerald-600')
                                  }
                                  title={sup.activo !== false ? 'Desactivar usuario' : 'Activar usuario'}
                                >
                                  {sup.activo !== false ? <UserX size={14} /> : <UserCheck size={14} />}
                                </button>
                                <button
                                  onClick={function (e) { e.stopPropagation(); handleDelete(sup.id, sup.usuario) }}
                                  className="p-1.5 rounded hover:bg-red-50 text-[#7c757c] hover:text-red-600 transition-colors"
                                  title="Eliminar usuario"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>

                          { /* TERCER NIVEL: Asesores */ }
                          {estaExpandidoSup && tieneAsesores && (
                            <div className="bg-[#faf8fc]/60">
                              {sup.asesores.map(function (asesor) {
                                const rolColorAs = ROL_COLORS[asesor.rol] || 'bg-gray-100 text-gray-600'
                                const rolLabelAs = ROLES.find(function (r) { return r.value === asesor.rol })?.label || asesor.rol
                                return (
                                  <div
                                    key={asesor.id}
                                    className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#f5ebf3]/30 transition-colors border-b border-[#f0ecf0] ml-8"
                                  >
                                    <div className="w-4 flex-shrink-0 flex items-center justify-center">
                                      <div className="w-2 h-2 rounded-full bg-[#d0c8d0]" />
                                    </div>

                                    <div className="flex-1 flex items-center gap-3 min-w-0">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-mono text-xs font-medium text-[#1a1030]">
                                            {asesor.usuario}
                                          </span>
                                          <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + rolColorAs}>
                                            {rolLabelAs}
                                          </span>
                                          {asesor.grupo && (
                                            <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700">{asesor.grupo}</span>
                                          )}
                                          <span className={
                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
                                            (asesor.activo !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')
                                          }>
                                            {asesor.activo !== false ? 'Activo' : 'Inactivo'}
                                          </span>
                                        </div>
                                        <div className="text-xs text-[#7c757c] mt-0.5 truncate">
                                          {asesor.nombre} \u00b7 {asesor.email}
                                        </div>
                                      </div>

                                      <div className="hidden md:block text-xs text-[#7c757c] flex-shrink-0">
                                        <span className="inline-flex items-center gap-1">
                                          <Clock size={11} />
                                          {formatearFecha(asesor.ultima_conexion)}
                                        </span>
                                      </div>
                                    </div>

                                    {canManage && (
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                          onClick={function (e) { e.stopPropagation(); openEdit(asesor) }}
                                          className="p-1.5 rounded hover:bg-[#e6f3fb] text-[#7c757c] hover:text-[#1495e0] transition-colors"
                                          title="Editar usuario"
                                        >
                                          <Edit3 size={13} />
                                        </button>
                                        <button
                                          onClick={function (e) {
                                            e.stopPropagation()
                                            setProxyModal({ open: true, user: asesor, value: asesor.proxy_asignado || '' })
                                          }}
                                          className="p-1.5 rounded hover:bg-[#1d366b] text-[#7c757c] hover:text-[#1495e0] transition-colors"
                                          title="Asignar proxy"
                                        >
                                          <Globe size={13} />
                                        </button>
                                        <button
                                          onClick={function (e) { e.stopPropagation(); toggleEstado(asesor.id) }}
                                          className={
                                            'p-1.5 rounded transition-colors ' +
                                            (asesor.activo !== false
                                              ? 'hover:bg-amber-50 text-[#7c757c] hover:text-amber-600'
                                              : 'hover:bg-emerald-50 text-[#7c757c] hover:text-emerald-600')
                                          }
                                          title={asesor.activo !== false ? 'Desactivar usuario' : 'Activar usuario'}
                                        >
                                          {asesor.activo !== false ? <UserX size={13} /> : <UserCheck size={13} />}
                                        </button>
                                        <button
                                          onClick={function (e) { e.stopPropagation(); handleDelete(asesor.id, asesor.usuario) }}
                                          className="p-1.5 rounded hover:bg-red-50 text-[#7c757c] hover:text-red-600 transition-colors"
                                          title="Eliminar usuario"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : noHayDatos ? (
        <div className="card flex flex-col items-center justify-center py-16">
          <Users size={40} className="text-[#b8b0b8] mb-3" />
          <p className="text-[#7c757c] text-sm">
            {searchUser
              ? 'No se encontraron usuarios con ese criterio de busqueda'
              : 'No hay usuarios registrados'}
          </p>
          {canManage && !searchUser && (
            <button
              onClick={openCreate}
              className="mt-3 text-[#1495e0] text-sm hover:underline"
            >
              {'Registrar el primer usuario'}
            </button>
          )}
        </div>
      ) : null}

      { /* Paginacion inferior */ }
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={function () { setCurrentPage(function (p) { return Math.max(1, p - 1) }) }}
            disabled={currentPage <= 1}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {'\u2190 Anterior'}
          </button>
          {Array.from({ length: totalPages }, function (_, i) { return i + 1 }).map(function (p) {
            return (
              <button
                key={p}
                onClick={function () { setCurrentPage(p) }}
                className={
                  'w-9 h-9 text-sm rounded-lg transition-colors ' +
                  (p === currentPage
                    ? 'bg-[#1495e0] text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50')
                }
              >
                {p}
              </button>
            )
          })}
          <button
            onClick={function () { setCurrentPage(function (p) { return p + 1 }) }}
            disabled={currentPage >= totalPages}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {'Siguiente \u2192'}
          </button>
        </div>
      )}

      { /* Modal crear/editar */ }
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={function () { setShowModal(false) }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={function (e) { e.stopPropagation() }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[#1a1030]">
                {editingId ? 'Editar usuario' : 'Registrar nuevo usuario'}
              </h2>
              <button
                onClick={function () { setShowModal(false) }}
                className="p-1 rounded hover:bg-[#f0f0f8] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              { /* Nombre */ }
              <div>
                <label className="block text-xs text-[#7c757c] font-medium mb-1">
                  {'Nombre completo '}
                  <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={function (e) { setForm({ ...form, nombre: e.target.value }) }}
                  className="input-field text-sm"
                  placeholder="ej: Juan Perez"
                />
              </div>

              { /* Email */ }
              <div>
                <label className="block text-xs text-[#7c757c] font-medium mb-1">
                  {'Email '}
                  <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={function (e) { setForm({ ...form, email: e.target.value }) }}
                  className="input-field text-sm"
                  placeholder="ej: juan@oratioo.com"
                />
              </div>

              { /* Password */ }
              <div>
                <label className="block text-xs text-[#7c757c] font-medium mb-1">
                  {'Contraseña '}
                  <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={function (e) {
                    setForm({ ...form, password: e.target.value })
                  }}
                  className="input-field text-sm"
                  placeholder={editingId ? 'Dejar vacío para no cambiar' : 'Mín. 8 caracteres'}
                />
              </div>

              {myRol !== 'supervisor' && (
              <div>
                <label className="block text-xs text-[#7c757c] font-medium mb-1">
                  {'Equipo - Pa\u00eds '}
                  <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.equipo}
                  onChange={function (e) {
                    setForm({ ...form, equipo: e.target.value, supervisor_id: '' })
                  }}
                  className="input-field text-sm"
                >
                  {equipos.length > 0
                    ? equipos
                        .filter(function (eq) {
                          if (myRol === 'supervisor') return eq.nombre === session.equipo
                          return true
                        })
                        .map(function (eq) {
                          return (
                            <option key={eq.id} value={eq.nombre}>
                              {eq.pais === 'PE' ? '\ud83c\uddf5\ud83c\uddea' : '\ud83c\uddea\ud83c\uddf8'} {eq.nombre}
                            </option>
                          )
                        })
                    : PAISES
                        .filter(function (p) {
                          if (myRol === 'supervisor') return p.clave === session.equipo
                          return true
                        })
                        .map(function (p) {
                          return (
                            <option key={p.clave} value={p.clave}>
                              {p.bandera} {p.label}
                            </option>
                          )
                        })}
                </select>
              </div>
              )}

              {myRol !== 'supervisor' && (
              <div>
                <label className="block text-xs text-[#7c757c] font-medium mb-1">
                  Grupo
                </label>
                <input
                  type="text"
                  value={form.grupo}
                  onChange={function (e) { setForm({ ...form, grupo: e.target.value }) }}
                  className="input-field text-sm"
                  placeholder="Ej: Team Alpha"
                />
              </div>
              )}

              { /* Rol */ }
              <div>
                <label className="block text-xs text-[#7c757c] font-medium mb-1">
                  {'Rol '}
                  <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.rol}
                  onChange={function (e) { setForm({ ...form, rol: e.target.value }) }}
                  className="input-field text-sm"
                >
                  {ROLES.filter(function (r) {
                    const s = JSON.parse(localStorage.getItem('oratioo_session') || '{}')
                    return s.rol === 'supervisor' ? r.value === 'asesor' : true
                  }).map(function (r) {
                    return (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    )
                  })}
                </select>
                {rolSeleccionado && (
                  <p className="text-xs text-[#7c757c] mt-1.5 italic">
                    {rolSeleccionado.desc}
                  </p>
                )}
              </div>

              {myRol !== 'supervisor' && (
              <div>
                <label className="block text-xs text-[#7c757c] font-medium mb-1">
                  Supervisor (solo para asesores)
                </label>
                <select
                  value={form.supervisor_id}
                  onChange={function (e) { setForm({ ...form, supervisor_id: e.target.value }) }}
                  className="input-field text-sm"
                >
                  <option value="">{'\u2014 Sin supervisor \u2014'}</option>
                  {supervisoresDisponibles.map(function (s) {
                    return (
                      <option key={s.id} value={s.id}>{s.nombre} (@{s.usuario})</option>
                    )
                  })}
                </select>
              </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mt-4">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={function () { setShowModal(false) }}
                className="flex-1 border border-[#e0e0f0] rounded-lg py-2.5 text-sm text-[#7c757c] hover:bg-[#f0f0f8] transition-colors"
              >
                {'Cancelar'}
              </button>
              <button
                onClick={handleSave}
                className="flex-1 bg-[#1495e0] hover:bg-[#0f7cc0] text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
              >
                {editingId ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      { /* Modal asignar proxy */ }
      {proxyModal.open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={function () { setProxyModal({ open: false, user: null, value: '' }) }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={function (e) { e.stopPropagation() }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#1a1030]">Asignar proxy</h2>
              <button
                onClick={function () { setProxyModal({ open: false, user: null, value: '' }) }}
                className="p-1 rounded hover:bg-[#f0f0f8] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#7c757c] mb-1">
              Usuario: <strong>{proxyModal.user?.nombre || proxyModal.user?.usuario}</strong>
            </p>
            <p className="text-xs text-[#7c757c] mb-4">
              Formato Webshare: <code className="bg-gray-100 px-1 rounded">ip:puerto:user:pass</code>
            </p>

            <input
              type="text"
              value={proxyModal.value}
              onChange={function (e) { setProxyModal({ ...proxyModal, value: e.target.value }) }}
              className="w-full border border-[#e8dce6] rounded-lg px-3 py-2.5 text-sm mb-5"
              placeholder="192.168.1.1:8080:user:pass"
            />

            <div className="flex gap-3">
              <button
                onClick={function () { setProxyModal({ open: false, user: null, value: '' }) }}
                className="flex-1 border border-[#e8dce6] rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async function () {
                  if (!proxyModal.user) return
                  const val = proxyModal.value.trim()
                  await supabase.from('usuarios').update({ proxy_asignado: val || null }).eq('id', proxyModal.user.id)
                  setProxyModal({ open: false, user: null, value: '' })
                  cargarUsuarios()
                }}
                className="flex-1 bg-[#1495e0] hover:bg-[#0f7cc0] text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
