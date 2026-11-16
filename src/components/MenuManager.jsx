import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const emptyDish = { name: '', description: '', price: '', imagen_url: '', is_available: true, category_id: '' }
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'available', label: 'Disponibles' },
  { value: 'soldout', label: 'Agotados' },
]

const sortCategories = (list) => [...list].sort((a, b) =>
  (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(a.nombre).localeCompare(String(b.nombre)),
)

function MenuManager() {
  const [dishes, setDishes] = useState([])
  const [categories, setCategories] = useState([])
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
  const [categoryFilter, setCategoryFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
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
    supabase.from('categories').select('id,nombre,orden').order('orden').then(({ data, error: categoryError }) => {
      if (!active) return
      if (categoryError) {
        console.error('No se pudieron cargar las categorías', categoryError)
        setError('No se pudieron cargar las categorías. Revisa que la migración esté aplicada.')
      } else {
        setCategories(sortCategories(data || []))
      }
    })
    supabase.from('restaurant_settings').select('delivery_fee').eq('id', true).single()
      .then(({ data, error: settingsError }) => { if (!settingsError) setDeliveryFee(Number(data?.delivery_fee || 0)) })
    const channel = supabase.channel('admin-dishes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, (payload) => {
        if (payload.eventType === 'INSERT') setDishes((current) => [...current, payload.new].sort((a, b) => a.nombre.localeCompare(b.nombre)))
        if (payload.eventType === 'UPDATE') setDishes((current) => current.map((dish) => dish.id === payload.new.id ? payload.new : dish))
        if (payload.eventType === 'DELETE') setDishes((current) => current.filter((dish) => dish.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => {
        if (payload.eventType === 'INSERT') setCategories((current) => sortCategories([...current, payload.new]))
        if (payload.eventType === 'UPDATE') setCategories((current) => sortCategories(current.map((category) => category.id === payload.new.id ? payload.new : category)))
        if (payload.eventType === 'DELETE') {
          setCategories((current) => current.filter((category) => category.id !== payload.old.id))
          setDishes((current) => current.map((dish) => dish.category_id === payload.old.id ? { ...dish, category_id: null } : dish))
        }
      })
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  const sortedCategories = sortCategories(categories)
  const categoryName = (id) => categories.find((category) => category.id === id)?.nombre || ''
  const categoryCounts = new Map(sortedCategories.map((category) => [category.id, dishes.filter((dish) => dish.category_id === category.id).length]))
  const available = dishes.filter((dish) => dish.is_available !== false).length
  const soldOut = dishes.length - available
  const average = dishes.length ? dishes.reduce((sum, dish) => sum + Number(dish.precio || 0), 0) / dishes.length : 0
  const visible = dishes.filter((dish) => {
    const matchesFilter = filter === 'all' || (filter === 'available' ? dish.is_available !== false : dish.is_available === false)
    const matchesCategory = !categoryFilter || (categoryFilter === 'none' ? !dish.category_id : dish.category_id === categoryFilter)
    const matchesSearch = `${dish.nombre || ''} ${dish.descripcion || ''}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesFilter && matchesCategory && matchesSearch
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
      category_id: dish.category_id || '',
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
    const payload = {
      nombre: form.name.trim(),
      descripcion: form.description.trim(),
      precio: price,
      imagen_url: image,
      is_available: Boolean(form.is_available),
      category_id: form.category_id || null,
    }
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

  async function addCategory(event) {
    event.preventDefault()
    const nombre = newCategory.trim()
    if (!nombre) return
    if (categories.some((category) => category.nombre.toLowerCase() === nombre.toLowerCase())) {
      setError('Ya existe una categoría con ese nombre.')
      return
    }
    const orden = categories.length ? Math.max(...categories.map((category) => Number(category.orden) || 0)) + 10 : 10
    const { data, error: createError } = await supabase.from('categories').insert({ nombre, orden }).select().single()
    if (createError) {
      console.error('No se pudo crear la categoría', createError)
      setError('No se pudo crear la categoría. Intenta de nuevo.')
      return
    }
    setCategories((current) => sortCategories([...current, data]))
    setNewCategory('')
  }

  function startEditingCategory(category) {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.nombre)
    setError('')
  }

  async function saveCategoryName(event) {
    event.preventDefault()
    const nombre = editingCategoryName.trim()
    if (!nombre) return
    if (categories.some((category) => category.id !== editingCategoryId && category.nombre.toLowerCase() === nombre.toLowerCase())) {
      setError('Ya existe una categoría con ese nombre.')
      return
    }
    const { data, error: updateError } = await supabase.from('categories').update({ nombre }).eq('id', editingCategoryId).select().single()
    if (updateError) {
      console.error('No se pudo renombrar la categoría', updateError)
      setError('No se pudo renombrar la categoría.')
      return
    }
    setCategories((current) => sortCategories(current.map((category) => category.id === data.id ? data : category)))
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  async function moveCategory(category, direction) {
    const ordered = sortCategories(categories)
    const index = ordered.findIndex((item) => item.id === category.id)
    const target = index + direction
    if (target < 0 || target >= ordered.length) return
    const reordered = [...ordered]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const results = await Promise.all(reordered.map((item, position) =>
      supabase.from('categories').update({ orden: (position + 1) * 10 }).eq('id', item.id),
    ))
    const updateError = results.find((result) => result.error)?.error
    if (updateError) {
      console.error('No se pudo reordenar las categorías', updateError)
      setError('No se pudo reordenar las categorías.')
      return
    }
    setCategories(reordered.map((item, position) => ({ ...item, orden: (position + 1) * 10 })))
  }

  async function deleteCategory(category) {
    const count = categoryCounts.get(category.id) || 0
    const message = count
      ? `¿Eliminar "${category.nombre}"? ${count} ${count === 1 ? 'plato quedará' : 'platos quedarán'} sin categoría.`
      : `¿Eliminar la categoría "${category.nombre}"?`
    if (!window.confirm(message)) return
    const { error: deleteError } = await supabase.from('categories').delete().eq('id', category.id)
    if (deleteError) {
      console.error('No se pudo eliminar la categoría', deleteError)
      setError('No se pudo eliminar la categoría.')
      return
    }
    setCategories((current) => current.filter((item) => item.id !== category.id))
    setDishes((current) => current.map((dish) => dish.category_id === category.id ? { ...dish, category_id: null } : dish))
    if (categoryFilter === category.id) setCategoryFilter('')
  }

  return <>
    <header className="page-header menu-header">
      <div><p className="eyebrow">CATÁLOGO · PRODUCTOS</p><h1>Gestor del menú</h1><p className="muted">Edita platos, categorías, precios y disponibilidad; los cambios se ven al instante.</p></div>
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

    <section className="panel category-manager">
      <div className="panel-heading"><div><h2>Categorías</h2><p className="muted">Agrupa el menú y asigna cada plato desde su formulario.</p></div><span className="dish-count">{categories.length} {categories.length === 1 ? 'categoría' : 'categorías'}</span></div>
      <form className="category-add" onSubmit={addCategory}>
        <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Nueva categoría, por ejemplo Postres" aria-label="Nueva categoría" maxLength={60} />
        <button className="secondary-button" disabled={!newCategory.trim()}>Agregar</button>
      </form>
      <div className="category-list">
        {sortedCategories.map((category, index) => <div className="category-row-item" key={category.id}>
          <span className="category-dot" aria-hidden="true" />
          {editingCategoryId === category.id ? <form className="category-edit" onSubmit={saveCategoryName}>
            <input autoFocus value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} aria-label={`Nuevo nombre para ${category.nombre}`} maxLength={60} />
            <button className="secondary-button">Guardar</button>
            <button type="button" className="text-button" onClick={() => { setEditingCategoryId(null); setEditingCategoryName('') }}>Cancelar</button>
          </form> : <>
            <strong>{category.nombre}</strong>
            <small>{categoryCounts.get(category.id) || 0} {categoryCounts.get(category.id) === 1 ? 'plato' : 'platos'}</small>
            <div className="category-actions">
              <button className="text-button" disabled={index === 0} onClick={() => moveCategory(category, -1)} aria-label={`Subir ${category.nombre}`}>↑</button>
              <button className="text-button" disabled={index === sortedCategories.length - 1} onClick={() => moveCategory(category, 1)} aria-label={`Bajar ${category.nombre}`}>↓</button>
              <button className="text-button" onClick={() => startEditingCategory(category)}>Editar</button>
              <button className="text-button" onClick={() => deleteCategory(category)}>Eliminar</button>
            </div>
          </>}
        </div>)}
        {!sortedCategories.length && <p className="muted category-empty">Aún no hay categorías. Crea la primera para agrupar el menú.</p>}
      </div>
    </section>

    <section className="panel menu-toolbar">
      <label className="menu-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o descripción" aria-label="Buscar plato" /></label>
      <label className="menu-category-filter">Categoría<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todas</option><option value="none">Sin categoría</option>{sortedCategories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
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
            <label>Categoría<select value={form.category_id || ''} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">Sin categoría</option>{sortedCategories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label>
            <label className="menu-availability"><input type="checkbox" checked={form.is_available} onChange={(event) => setForm({ ...form, is_available: event.target.checked })} /> Disponible para pedir</label>
            <div className="menu-form-actions">
              <button className="primary-button" disabled={saving}>{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar al menú'}</button>
              <button type="button" className="outline-button" onClick={closeForm}>Cancelar</button>
            </div>
          </div>
          <aside className="menu-form-preview" aria-label="Vista previa del plato">
            <div className="menu-preview-image">{form.imagen_url ? <img src={form.imagen_url} alt="" /> : <span aria-hidden="true">◈</span>}</div>
            <span className="menu-preview-category">{form.category_id ? categoryName(form.category_id) : 'Sin categoría'}</span>
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
          <span className="menu-card-category">{categoryName(dish.category_id) || 'Sin categoría'}</span>
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
