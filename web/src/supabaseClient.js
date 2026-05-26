import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Tablas ────────────────────────────────────────
export const TABLA_CLIENTES = 'lineas'
export const TABLA_PERFILES = 'perfiles'
export const TABLA_EQUIPOS = 'equipos'
export const TABLA_PROXIES = 'proxies'
export const TABLA_MAQUINAS = 'maquinas'
export const TABLA_WORKERS = 'workers'

// ── Roles ─────────────────────────────────────────
export const ROLES = {
  ASESOR: 'asesor',
  SUPERVISOR: 'supervisor',
  IT: 'it',
  BACK_OFFICE: 'back_office',
  JEFE_AREA: 'jefe_area',
  CEO: 'ceo',
  DESARROLLADOR: 'desarrollador',
}

// ── Auth helpers ──────────────────────────────────

export async function loginWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from(TABLA_PERFILES).select('*').eq('user_id', user.id).single()
  return data
}

export async function signOut() {
  return supabase.auth.signOut()
}
