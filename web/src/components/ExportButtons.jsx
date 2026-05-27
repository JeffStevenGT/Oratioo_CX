import { useState } from 'react'
import { Download, FileSpreadsheet, FileJson, Loader2 } from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

// ── Helpers ──────────────────────────────────────

function detectarTipoDoc(doc) {
  if (!doc) return 'DNI'
  const docUp = doc.toUpperCase()
  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(docUp)) return 'NIE'
  // NIF: letra + 8 dígitos
  if (/^[A-Z]\d{8}$/.test(docUp)) return 'NIF'
  // DNI: 7-8 dígitos + letra
  if (/^\d{7,8}[A-Z]$/.test(docUp)) return 'DNI'
  return 'DNI'
}

function extraerCP(direccion) {
  if (!direccion) return ''
  const match = direccion.match(/\b(\d{5})\b/)
  return match ? match[1] : ''
}

function limpiarNumero(num) {
  if (!num) return ''
  // Quitar todo excepto dígitos y tomar últimos 9
  const digits = num.replace(/\D/g, '')
  return digits.slice(-9)
}

function limpiarNombre(nombre) {
  if (!nombre) return ''
  // Quitar puntos, guiones, espacios al inicio
  return nombre.replace(/^[.\-\s]+/, '').toUpperCase().trim()
}

// ── Componente ────────────────────────────────────

export default function ExportButtons({ data = [] }) {
  const [exporting, setExporting] = useState(null)

  const exportExcel = async () => {
    setExporting('excel')
    try {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Clientes')

      sheet.columns = [
        { header: 'documento', key: 'documento', width: 16 },
        { header: 'tipoDoc', key: 'tipoDoc', width: 10 },
        { header: 'nombre', key: 'nombre', width: 40 },
        { header: 'apellidos', key: 'apellidos', width: 5 },
        { header: 'telefono', key: 'telefono', width: 5 },
        { header: 'telefono2', key: 'telefono2', width: 18 },
        { header: 'email', key: 'email', width: 5 },
        { header: 'CP', key: 'cp', width: 8 },
      ]

      const rows = data.map((c) => {
        const attr = c.atributos_dinamicos || {}
        const bas = attr.datos_basicos || {}
        const doc = c.dni || ''

        // teléfono2: líneas adicionales (todas excepto la principal)
        const lineas = c._lineas || []
        const numeros = lineas.map(l => limpiarNumero(l.linea || '')).filter(Boolean)
        const telefonoPrincipal = numeros[0] || ''
        const adicionales = numeros.slice(1).join(', ')

        return {
          documento: doc,
          tipoDoc: detectarTipoDoc(doc),
          nombre: limpiarNombre(bas.nombre || c.nombre || ''),
          apellidos: '',
          telefono: '',
          telefono2: adicionales,
          email: '',
          cp: extraerCP(bas.direccion || c.direccion || ''),
        }
      })

      rows.forEach((r) => sheet.addRow(r))

      // Estilo encabezados
      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const today = new Date().toISOString().split('T')[0]
      saveAs(blob, `ORATIOO_CX_${today}.xlsx`)
    } catch (err) {
      console.error('Error exporting Excel:', err)
    } finally {
      setExporting(null)
    }
  }

  const exportJSON = () => {
    const clean = data.map((c) => {
      const attr = c.atributos_dinamicos || {}
      const bas = attr.datos_basicos || {}
      const linea = attr.linea || {}
      return {
        dni: c.dni,
        nombre: bas.nombre,
        direccion: bas.direccion,
        linea_principal: linea.linea_principal || c.linea,
        paquete: linea.paquete || c.paquete,
        cima: attr.cima,
        renove_mixto: attr.tiene_renove_mixto,
        variante_renove: attr.renove_mixto_variante,
        tags: attr.cima_tags,
        estado: attr.estado,
        fecha: c.created_at,
      }
    })
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' })
    const today = new Date().toISOString().split('T')[0]
    saveAs(blob, `ORATIOO_CX_${today}.json`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={exportExcel}
        disabled={exporting !== null}
        className="btn-primary flex items-center gap-2 text-xs"
      >
        {exporting === 'excel'
          ? <Loader2 size={14} className="animate-spin" />
          : <FileSpreadsheet size={14} />}
        Excel ({data.length})
      </button>
      <button
        onClick={exportJSON}
        className="btn-primary flex items-center gap-2 text-xs"
      >
        <FileJson size={14} />
        JSON ({data.length})
      </button>
    </div>
  )
}
