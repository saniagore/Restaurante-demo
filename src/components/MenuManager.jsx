import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const emptyDish = { name: '', description: '', price: '', imagen_url: '', is_available: true }
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'available', label: 'Disponibles' },
  { value: 'soldout', label: 'Agotados' },
]

function MenuManager() {
  const [dishes, setDishes] = useState([])
  const [form, setForm] = useState(emptyDish)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [savingFee, setSavingFee] = useState(false)
  const [feeSaved, setFeeSaved] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const formRef = useRef(null)

  useEffect(() => {
    let active = true
    async function loadDishes() {
      const { data, error: queryError } = await supabase.from('dishes').select('*').order('nombre')
      if (active) {
        if (queryError) setError('No se pudieron cargar los platos.')
        else setDishes(data || [])
        setLoading(false)
      }
    }
    loadDishes()
    supabase.from('restaurant_settings').select('delivery_fee').eq('id', true).single()
      .then(({ data, error: settingsError }) => { if (!settingsError) setDeliveryFee(Number(data?.delivery_fee || 0)) })
    const channel = supabase.channel('admin-dishes').on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, (payload) => {
      if (payload.eventType === 'INSERT') setDishes((current) => [...current, payload.new].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      if (payload.eventType === 'UPDATE') setDishes((current) => current.map((dish) => dish.id === payload.new.id ? payload.new : dish))
      if (payload.eventType === 'DELETE') setDishes((current) => current.filter((dish) => dish.id !== payload.old.id))
    }).subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  const available = dishes.filter((dish) => dish.is_available !== false).length
  const soldOut = dishes.length - available
  const average = dishes.length ? dishes.reduce((sum, dish) => sum + Number(dish.precio || 0), 0) / dishes.length : 0
  const visible = dishes.filter((dish) => {
    const matchesFilter = filter === 'all' || (filter === 'available' ? dish.is_available !== false : dish.is_available === false)
    const matchesSearch = `${dish.nombre || ''} ${dish.descripcion || ''}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesFilter && matchesSearch
  })

  function openForm(dish = null) {
    setError('')
    setEditingId(dish?.id || null)
    setForm(dish ? {
      name: dish.nombre || '',
      description: dish.descripcion || '',
      price: dish.precio ?? '',
      imagen_url: dish.imagen_url || '',
      is_available: dish.is_available !== false,
    } : emptyDish)
    setFormOpen(true)
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function closeForm() {
    setEditingId(null)
    setForm(emptyDish)
    setFormOpen(false)
    setError('')
  }

  async function saveDish(event) {
    event.preventDefault()
    setError('')
    const image = form.imagen_url.trim()
    if (image && !/^https:\/\//i.test(image) && !image.startsWith('/')) {
      setError('La imagen debe ser una URL https o una ruta interna del sitio.')
      return
    }
    const price = Number(form.price)
    if (!Number.isFinite(price) || price < 0) {
      setError('El precio debe ser un número mayor o igual a cero.')
      return
    }
    setSaving(true)
    const payload = { nombre: form.name.trim(), descripcion: form.description.trim(), precio: price, imagen_url: image, is_available: Boolean(form.is_available) }
    const response = editingId
      ? await supabase.from('dishes').update(payload).eq('id', editingId).select().single()
      : await supabase.from('dishes').insert(payload).select().single()
    if (response.error) {
      console.error('No se pudo guardar el plato', response.error)
      setError('No se pudo guardar el plato. Intenta de nuevo.')
    } else {
      setDishes((current) => editingId ? current.map((dish) => dish.id === editingId ? response.data : dish) : [...current, response.data])
      closeForm()
    }
    setSaving(false)
  }

  async function toggleAvailability(dish) {
    const { data, error: updateError } = await supabase.from('dishes').update({ is_available: !dish.is_available }).eq('id', dish.id).select().single()
    if (updateError) {
      console.error('No se pudo cambiar la disponibilidad', updateError)
      setError('No se pudo cambiar la disponibilidad.')
    } else {
      setDishes((current) => current.map((item) => item.id === dish.id ? data : item))
    }
  }

  async function saveDeliveryFee(event) {
    event.preventDefault()
    setSavingFee(true)
    setError('')
    setFeeSaved(false)
    const { error: feeError } = await supabase.from('restaurant_settings').update({ delivery_fee: Number(deliveryFee) }).eq('id', true)
    if (feeError) {
      console.error('No se pudo guardar la tarifa', feeError)
      setError('No se pudo guardar la tarifa de domicilio.')
    } else {
      setFeeSaved(true)
      window.setTimeout(() => setFeeSaved(false), 2500)
    }
    setSavingFee(false)
  }

  return <>
    <header className="page-header menu-header">
      <div><p className="eyebrow">CATÁLOGO · PRODUCTOS</p><h1>Gestor del menú</h1><p className="muted">Edita platos, precios y disponibilidad; los cambios se ven al instante.</p></div>
      <button className="primary-button menu-new-button" onClick={() => openForm()}>+ Nuevo plato</button>
    </header>
    {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}

    <section className="menu-stats">
      <article><span>Platos</span><strong>{dishes.length}</strong></article>
      <article><span>Disponibles</span><strong>{available}</strong></article>
      <article><span>Agotados</span><strong>{soldOut}</strong></article>
      <article><span>Precio promedio</span><strong>{money.format(average)}</strong></article>
      <article className="menu-fee-card">
        <div><span>Domicilio</span><small>Se suma a los pedidos a domicilio</small></div>
        <form onSubmit={saveDeliveryFee}><input aria-label="Tarifa de domicilio" min="0" step="100" type="number" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} /><button className="secondary-button" disabled={savingFee}>{savingFee ? '...' : 'Guardar'}</button>{feeSaved && <em>Guardado</em>}</form>
      </article>
    </section>

    <section className="panel menu-toolbar">
      <label className="menu-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o descripción" aria-label="Buscar plato" /></label>
      <div className="menu-filter-group" role="group" aria-label="Filtrar por disponibilidad">
        {FILTERS.map((option) => <button type="button" key={option.value} className={filter === option.value ? 'active' : ''} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}
      </div>
    </section>

    {formOpen && <section className="panel menu-form-panel" ref={formRef}>
      <div className="panel-heading"><div><h2>{editingId ? 'Editar plato' : 'Nuevo plato'}</h2><p className="muted">Completa la información y revisa la vista previa.</p></div><button className="text-button" onClick={closeForm}>Cerrar</button></div>
      <form className="dish-form menu-dish-form" onSubmit={saveDish}>
        <div className="menu-form-grid">
          <div className="menu-form-fields">
            <label>Nombre del plato<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Hamburguesa clásica" /></label>
            <label>Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows="3" placeholder="Ingredientes, tamaño o lo que lo hace especial" /></label>
            <div className="form-row">
              <label>Precio<input required min="0" step="100" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="0" /></label>
              <label>Imagen (URL)<input type="url" value={form.imagen_url} onChange={(event) => setForm({ ...form, imagen_url: event.target.value })} placeholder="https://... o /imagen.png" /></label>
            </div>
            <label className="menu-availability"><input type="checkbox" checked={form.is_available} onChange={(event) => setForm({ ...form, is_available: event.target.checked })} /> Disponible para pedir</label>
            <div className="menu-form-actions">
              <button className="primary-button" disabled={saving}>{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar al menú'}</button>
              <button type="button" className="outline-button" onClick={closeForm}>Cancelar</button>
            </div>
          </div>
          <aside className="menu-form-preview" aria-label="Vista previa del plato">
            <div className="menu-preview-image">{form.imagen_url ? <img src={form.imagen_url} alt="" /> : <span aria-hidden="true">◈</span>}</div>
            <strong>{form.name || 'Nombre del plato'}</strong>
            <span className="menu-preview-price">{form.price !== '' ? money.format(Number(form.price) || 0) : 'Precio'}</span>
            <p>{form.description || 'Una descripción corta ayuda a que el cliente elija.'}</p>
          </aside>
        </div>
      </form>
    </section>}

    <section className="panel menu-catalog">
      <div className="panel-heading"><div><h2>Platos del menú</h2><p className="muted">{visible.length} de {dishes.length} platos</p></div><span className="dish-count">{available} disponibles</span></div>
      {loading ? <div className="empty-state">Cargando menú...</div> : visible.length ? <div className="menu-grid">{visible.map((dish) => <article className="menu-card" key={dish.id}>
        <div className="menu-card-image">
          {dish.imagen_url ? <img src={dish.imagen_url} alt={dish.nombre} loading="lazy" referrerPolicy="no-referrer" /> : <span className="dish-placeholder" aria-hidden="true">◈</span>}
          <span className={`menu-card-badge ${dish.is_available ? 'available' : 'soldout'}`}>{dish.is_available ? 'Disponible' : 'Agotado'}</span>
        </div>
        <div className="menu-card-body">
          <div className="menu-card-title"><h3>{dish.nombre}</h3><strong>{money.format(Number(dish.precio || 0))}</strong></div>
          <p>{dish.descripcion || 'Sin descripción'}</p>
          <div className="menu-card-actions">
            <button className="edit-button" onClick={() => openForm(dish)}>Editar</button>
            <button className={`switch ${dish.is_available ? 'on' : ''}`} onClick={() => toggleAvailability(dish)} aria-label={`${dish.is_available ? 'Marcar agotado' : 'Marcar disponible'}: ${dish.nombre}`} aria-pressed={Boolean(dish.is_available)}><span /></button>
          </div>
        </div>
      </article>)}</div> : <div className="empty-state">{dishes.length ? 'No hay platos con ese filtro.' : 'Aún no hay platos en el menú.'}</div>}
    </section>
  </>
}

export default MenuManager
