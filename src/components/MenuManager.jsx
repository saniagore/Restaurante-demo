import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const emptyDish = { name: '', description: '', price: '', imagen_url: '', is_available: true }
const money = (value) => `$${Number(value || 0).toFixed(2)}`

function MenuManager() {
  const [dishes, setDishes] = useState([])
  const [form, setForm] = useState(emptyDish)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadDishes() {
      const { data, error: queryError } = await supabase.from('dishes').select('*').order('name')
      if (active) {
        if (queryError) setError('No se pudieron cargar los platos.')
        else setDishes(data || [])
        setLoading(false)
      }
    }
    loadDishes()
    const channel = supabase.channel('admin-dishes').on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' }, (payload) => {
      if (payload.eventType === 'INSERT') setDishes((current) => [...current, payload.new].sort((a, b) => a.name.localeCompare(b.name)))
      if (payload.eventType === 'UPDATE') setDishes((current) => current.map((dish) => dish.id === payload.new.id ? payload.new : dish))
      if (payload.eventType === 'DELETE') setDishes((current) => current.filter((dish) => dish.id !== payload.old.id))
    }).subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  function editDish(dish) {
    setEditingId(dish.id)
    setForm({ name: dish.name || '', description: dish.description || '', price: dish.price || '', imagen_url: dish.imagen_url || '', is_available: dish.is_available !== false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveDish(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = { ...form, price: Number(form.price), is_available: Boolean(form.is_available) }
    const response = editingId
      ? await supabase.from('dishes').update(payload).eq('id', editingId).select().single()
      : await supabase.from('dishes').insert(payload).select().single()
    if (response.error) setError('No se pudo guardar el plato.')
    else {
      setDishes((current) => editingId ? current.map((dish) => dish.id === editingId ? response.data : dish) : [...current, response.data])
      setForm(emptyDish)
      setEditingId(null)
    }
    setSaving(false)
  }

  async function toggleAvailability(dish) {
    const { data, error: updateError } = await supabase.from('dishes').update({ is_available: !dish.is_available }).eq('id', dish.id).select().single()
    if (updateError) setError('No se pudo cambiar la disponibilidad.')
    else setDishes((current) => current.map((item) => item.id === dish.id ? data : item))
  }

  return <>
    <header className="page-header"><div><p className="eyebrow">CATÁLOGO · PRODUCTOS</p><h1>Gestor del menú</h1></div><span className="menu-summary">{dishes.filter((dish) => dish.is_available).length} disponibles</span></header>
    {error && <div className="alert">{error}<button onClick={() => setError('')}>×</button></div>}
    <div className="menu-layout">
      <section className="panel dish-form-panel"><div className="panel-heading"><div><h2>{editingId ? 'Editar plato' : 'Nuevo plato'}</h2><p className="muted">Los cambios se reflejan al instante.</p></div>{editingId && <button className="text-button" onClick={() => { setEditingId(null); setForm(emptyDish) }}>Cancelar</button>}</div>
        <form className="dish-form" onSubmit={saveDish}>
          <label>Nombre del plato<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Hamburguesa clásica" /></label>
          <label>Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows="3" placeholder="Describe los ingredientes..." /></label>
          <div className="form-row"><label>Precio<input required min="0" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="0.00" /></label><label>Imagen (URL)<input type="url" value={form.imagen_url} onChange={(event) => setForm({ ...form, imagen_url: event.target.value })} placeholder="https://..." /></label></div>
          <button className="primary-button full-width" disabled={saving}>{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar al menú'}</button>
        </form>
      </section>
      <section className="panel dishes-panel"><div className="panel-heading"><div><h2>Platos del menú</h2><p className="muted">Administra disponibilidad y precios.</p></div><span className="dish-count">{dishes.length} platos</span></div>
        {loading ? <div className="empty-state">Cargando menú...</div> : <div className="dish-table-wrap"><table className="dish-table"><thead><tr><th>Plato</th><th>Precio</th><th>Disponibilidad</th><th></th></tr></thead><tbody>{dishes.map((dish) => <tr key={dish.id}><td><div className="dish-cell">{dish.imagen_url ? <img src={dish.imagen_url} alt="" /> : <span className="dish-placeholder">◈</span>}<div><strong>{dish.name}</strong><small>{dish.description || 'Sin descripción'}</small></div></div></td><td>{money(dish.price)}</td><td><button className={`switch ${dish.is_available ? 'on' : ''}`} onClick={() => toggleAvailability(dish)} aria-label={`${dish.is_available ? 'Desactivar' : 'Activar'} ${dish.name}`}><span /></button><span className={dish.is_available ? 'available' : 'unavailable'}>{dish.is_available ? 'Disponible' : 'Agotado'}</span></td><td><button className="edit-button" onClick={() => editDish(dish)}>Editar</button></td></tr>)}</tbody></table>{!dishes.length && <div className="empty-state">Aún no hay platos en el menú.</div>}</div>}
      </section>
    </div>
  </>
}

export default MenuManager
