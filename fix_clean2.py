import sys
filepath = sys.argv[1]

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Add abriendoOrange state
content = content.replace(
    'const [showPassModal, setShowPassModal]',
    'const [abriendoOrange, setAbriendoOrange] = useState(false);\n  const [showPassModal, setShowPassModal]'
)

# Step 2: Find the Abrir Orange section - from the comment to just before the password button
# The structure is:
# {/* Abrir Orange - ... */}
# {ABRIR_ORANGE_PERMS[...] && (
#   <div>...</div>
# )}
# <div className="p-2 border-t border-[#5d1a7a]">  <- password button
#   <button onClick={...}>Cambiar contraseña</button>
# </div>
# <div className="p-2">  <- Cerrar sesion
#   <button onClick={onLogout}>Cerrar sesion</button>
# </div>

# Find the start marker
start = content.find('{/* Abrir Orange')

# Find where the password button section starts
pass_div_marker = '<span className="text-sm font-medium">Cambiar contrase'
pass_label = content.find(pass_div_marker)
# Find the opening div for this section
pass_div_start = content.rfind('<div className="p-2', 0, pass_label)

# The section to replace is from start to pass_div_start
old_section = content[start:pass_div_start]

new_section = """{/* Abrir Orange - abre en PC-Jeff */}
      {ABRIR_ORANGE_PERMS[userRol] && (
        <div className="p-2 border-t border-[#5d1a7a]">
          <button
            onClick={async function () {
              setAbriendoOrange(true)
              try {
                let proxyAsignado = ''
                try {
                  const { data } = await supabase
                    .from('usuarios')
                    .select('proxy_asignado')
                    .eq('email', session.email || '')
                    .limit(1)
                    .single()
                  if (data?.proxy_asignado) proxyAsignado = data.proxy_asignado
                } catch {}
                await supabase.from('comandos_bot').insert({
                  maquina_destino: 'PC-Jeff',
                  comando: 'abrir_navegador',
                  parametros: { asesor_id: myId || '0', proxy_asignado: proxyAsignado },
                  estado: 'pendiente',
                })
                setTimeout(function () { setAbriendoOrange(false) }, 2000)
              } catch {
                setAbriendoOrange(false)
              }
            }}
            disabled={abriendoOrange}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200 disabled:opacity-50 ${
              abriendoOrange
                ? 'bg-emerald-600 text-white'
                : 'text-emerald-400 hover:text-white hover:bg-emerald-600'
            }`}
            title="Abrir Orange en PC-Jeff"
          >
            {abriendoOrange ? (
              <Loader2 size={18} className="animate-spin shrink-0" />
            ) : (
              <Globe size={18} className="shrink-0" />
            )}
            {!collapsed && (
              <span className="text-sm font-medium">
                {abriendoOrange ? 'Abriendo...' : 'Abrir Orange'}
              </span>
            )}
          </button>
        </div>
      )}

      """

content = content.replace(old_section, new_section)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("OK")
