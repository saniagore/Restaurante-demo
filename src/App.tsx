import { FormEvent, useCallback, useEffect, useState, type MouseEvent } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { useCart, type CartItem, type Dish } from './lib/cart'
import { buildCheckoutInput, createCheckoutPayload } from './lib/orders'
import { allergensNotice, business, LEGAL_VERSION } from './config/business'
import { ActiveOrderBanner } from './components/ActiveOrderBanner'
import { SiteFooter } from './components/SiteFooter'
import { StorageNotice } from './components/StorageNotice'
import { clearRememberedOrderToken, createId, getClientId, getRememberedOrderToken, rememberOrderToken } from './lib/customer-session'
import { isLegalSlug, type LegalDocSlug } from './legal/content'
import { LegalPage } from './legal/LegalPage'
import { LegalModal } from './legal/LegalModal'
import heroImage from './assets/hero.png'
import './App.css'
import './legal/legal.css'

type Order = { id: string; track_token: string; status: string; customer_name: string; order_type: string; notes?: string; total?: number }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase: SupabaseClient | null = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function Icon({ name, size = 20 }: { name: 'bag' | 'plus' | 'minus' | 'arrow' | 'clock' | 'check' | 'close' | 'back'; size?: number }) {
  const paths = {
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M8 8a4 4 0 0 1 8 0" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <path d="M5 12h14" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></>,
    check: <path d="m6 12 4 4 8-9" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  const navigate = (to: string) => { window.history.pushState({}, '', to); setPath(to); window.scrollTo({ top: 0 }) }
  const token = path.match(/^\/track\/([^/]+)/)?.[1]
  const legalSlug = path.replace(/\/+$/, '').replace(/^\//, '')
  if (token) return <TrackingPage token={token} navigate={navigate} />
  if (isLegalSlug(legalSlug)) return <LegalPage slug={legalSlug} navigate={navigate} />
  return <MenuPage navigate={navigate} />
}

function MenuPage({ navigate }: { navigate: (to: string) => void }) {
  const [dishes, setDishes] = useState<Dish[]>([])
  const [menuError, setMenuError] = useState('')
  const [menuLoading, setMenuLoading] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const [search, setSearch] = useState('')
  const items = useCart((state) => state.items)
  const cartTotal = useCart((state) => state.total())
  const addItem = useCart((state) => state.addItem)
  const loadDishes = useCallback(async () => {
    setMenuLoading(true)
    setMenuError('')
    if (!supabase) {
      setMenuError('El menú requiere una conexión con Supabase.')
      setMenuLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('dishes')
      .select('id,nombre,descripcion,precio,imagen_url')
      .eq('is_available', true)
      .order('nombre')
    if (error) {
      setMenuError('No se pudo cargar el menú. Intenta de nuevo.')
    } else {
      setDishes((data || []).map((dish) => ({
          id: dish.id,
          name: dish.nombre,
          description: dish.descripcion || '',
          price: Number(dish.precio),
          image_url: dish.imagen_url || '',
      })))
    }
    setMenuLoading(false)
  }, [])
  useEffect(() => { loadDishes() }, [loadDishes])
  const visible = dishes.filter((dish) => {
    const matchesSearch = `${dish.name} ${dish.description}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}><span className="brand-mark">M</span><span>{business.brand}<small>{business.tagline}</small></span></a><nav><a href="#menu">Menú</a><a href="#about">El restaurante</a></nav><button className="cart-button" onClick={() => setCartOpen(true)} aria-label="Abrir carrito"><Icon name="bag" /><span>Tu pedido</span>{items.length > 0 && <b>{items.reduce((sum, item) => sum + item.quantity, 0)}</b>}</button></header>
    <ActiveOrderBanner onOpen={(token) => navigate(`/track/${token}`)} />
    <main>
      <section className="hero-section"><div className="hero-copy"><p className="eyebrow">SABORES PARA COMPARTIR</p><h1>Un buen momento<br /><em>empieza en la mesa.</em></h1><p className="hero-description">Ingredientes frescos, recetas hechas con cuidado y opciones para disfrutar a tu manera.</p><a className="gold-button" href="#menu">Explorar el menú <Icon name="arrow" size={16} /></a></div><div className="hero-art"><img src={heroImage} alt="Plato preparado para compartir" /></div></section>
      <section id="menu" className="menu-section"><div className="section-heading"><div><p className="eyebrow">NUESTRO MENÚ</p><h2>Elige algo delicioso</h2></div><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en el menú" aria-label="Buscar en el menú" /></label></div>
        {menuLoading ? <div className="loading" aria-live="polite">Cargando el menú...</div> : menuError ? <div className="empty-search"><p>{menuError}</p><button className="outline-button retry-button" onClick={loadDishes}>Reintentar</button></div> : <div className="dish-grid">{visible.map((dish) => <DishCard key={dish.id} dish={dish} onAdd={() => addItem(dish)} />)}</div>}{!menuLoading && !menuError && visible.length === 0 && <div className="empty-search">No encontramos ese plato. Intenta con otra búsqueda.</div>}
      </section>
    </main>
    <SiteFooter onNavigate={navigate} />
    {items.length > 0 && <button className="floating-cart" onClick={() => setCartOpen(true)} aria-label={`Abrir pedido, ${items.length} productos`}><span className="floating-cart-icon"><Icon name="bag" size={20} /><b>{items.reduce((sum, item) => sum + item.quantity, 0)}</b></span><span><strong>Tu pedido</strong><small>{money.format(cartTotal)}</small></span><Icon name="arrow" size={17} /></button>}
    {cartOpen && <CartDrawer close={() => setCartOpen(false)} navigate={navigate} />}
    <StorageNotice onOpenDetails={() => navigate('/cookies')} onClear={() => useCart.getState().clearCart()} />
  </div>
}

function DishCard({ dish, onAdd }: { dish: Dish; onAdd: () => void }) {
  return <article className="dish-card"><div className="dish-image"><img src={dish.image_url} alt={dish.name} loading="lazy" referrerPolicy="no-referrer" /><button className="add-button" onClick={onAdd} aria-label={`Añadir ${dish.name}`}><Icon name="plus" size={19} /></button></div><div className="dish-info"><div><h3>{dish.name}</h3><span className="price">{money.format(dish.price)}</span></div><p>{dish.description}</p></div></article>
}

function CartDrawer({ close, navigate }: { close: () => void; navigate: (to: string) => void }) {
  const [checkout, setCheckout] = useState(false)
  const items = useCart((state) => state.items)
  const total = useCart((state) => state.total())
  return <div className="drawer-layer" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="cart-drawer"><div className="drawer-head"><div><p className="eyebrow">TU PEDIDO</p><h2>{checkout ? 'Finaliza tu pedido' : 'Lo que elegiste'}</h2></div><button className="icon-button" onClick={close} aria-label="Cerrar"><Icon name="close" /></button></div>{checkout ? <Checkout close={close} navigate={navigate} onBack={() => setCheckout(false)} /> : items.length === 0 ? <div className="cart-empty"><div className="empty-icon"><Icon name="bag" size={28} /></div><h3>Tu pedido está vacío</h3><p>Agrega algo delicioso del menú para empezar.</p><button className="outline-button" onClick={close}>Ver el menú</button></div> : <><div className="cart-list">{items.map((item) => <CartRow key={item.id} item={item} />)}</div><div className="cart-summary"><div><span>Subtotal</span><strong>{money.format(total)}</strong></div><div><span>Pago</span><span>Efectivo al recibir</span></div><p className="cart-tax-note">Precios finales con impuestos incluidos; el domicilio se informa al finalizar.</p><button className="primary-button" onClick={() => setCheckout(true)}>Continuar <Icon name="arrow" size={17} /></button></div></>}</aside></div>
}

function CartRow({ item }: { item: CartItem }) {
  const updateQuantity = useCart((state) => state.updateQuantity)
  const removeItem = useCart((state) => state.removeItem)
  return <div className="cart-row"><img src={item.image_url} alt="" referrerPolicy="no-referrer" /><div className="cart-row-main"><div><h3>{item.name}</h3><button className="remove-link" onClick={() => removeItem(item.id)}>Eliminar</button></div><strong>{money.format(item.price * item.quantity)}</strong><div className="quantity"><button onClick={() => updateQuantity(item.id, item.quantity - 1)} aria-label="Reducir cantidad"><Icon name="minus" size={14} /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, item.quantity + 1)} aria-label="Aumentar cantidad"><Icon name="plus" size={14} /></button></div></div></div>
}

export function Checkout({ close, navigate, onBack }: { close: () => void; navigate: (to: string) => void; onBack: () => void }) {
  const items = useCart((state) => state.items)
  const total = useCart((state) => state.total())
  const clearCart = useCart((state) => state.clearCart)
  const [name, setName] = useState('')
  const [orderType, setOrderType] = useState('pickup')
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')
  const [clientId] = useState(() => getClientId())
  const [clientToken] = useState(() => createId())
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDocSlug | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!supabase) return
    supabase.from('restaurant_settings').select('delivery_fee').eq('id', true).single()
      .then(({ data, error }) => { if (!error) setDeliveryFee(Number(data?.delivery_fee || 0)) })
  }, [])
  const checkoutTotal = total + (orderType === 'delivery' ? deliveryFee : 0)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const payload = createCheckoutPayload(buildCheckoutInput(items, {
        customerName: name,
        phone,
        orderType,
        notes,
        deliveryAddress,
        acceptedTerms,
        legalVersion: LEGAL_VERSION,
        clientId,
        clientToken,
      }))
      let token = `demo-${Date.now().toString(36)}`
      if (supabase) {
        const { data: order, error: orderError } = await supabase.rpc('create_order_secure', { p_order: payload })
          const createdOrder = order?.[0]
          if (orderError) throw new Error(orderError.message || orderError.details || 'No se pudo crear la orden')
          if (!createdOrder) throw new Error('No se pudo crear la orden')
          token = createdOrder.track_token
      }
      rememberOrderToken(token); clearCart(); close(); navigate(`/track/${token}`)
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'No pudimos enviar tu pedido. Intenta de nuevo.'); setSaving(false) }
  }
  const rememberedOrderToken = getRememberedOrderToken()
  const openLegal = (slug: LegalDocSlug) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setLegalDoc(slug)
  }
  return <form className="checkout-form" onSubmit={submit}><button type="button" className="back-link" onClick={onBack}><Icon name="back" size={16} /> Volver al pedido</button><label>¿Cómo quieres recibirlo?<div className="radio-group"><button type="button" className={orderType === 'pickup' ? 'radio-card selected' : 'radio-card'} onClick={() => setOrderType('pickup')}><span>Recoger</span><small>Listo en el local</small><i /></button><button type="button" className={orderType === 'delivery' ? 'radio-card selected' : 'radio-card'} onClick={() => setOrderType('delivery')}><span>Domicilio</span><small>Te lo llevamos</small><i /></button></div></label><label>Tu nombre<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="¿Cómo te llamamos?" /></label><label>Teléfono de contacto<input required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="300 123 4567" /></label><p className="field-hint">Solo lo usamos para coordinar este pedido. No enviamos códigos de verificación.</p><p className="field-hint">Responsable: {business.legalName}. Tratamos tu nombre, teléfono, dirección y notas para gestionar el pedido y la entrega. Puedes conocer, actualizar, rectificar o suprimir tus datos escribiendo a {business.privacyEmail}. <a href="/privacidad" onClick={openLegal('privacidad')}>Política completa</a>.</p>{orderType === 'delivery' && <label>Dirección de entrega<input required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Calle, número, barrio y referencias" /></label>}<label>Notas para cocina <span className="optional">Opcional</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Alergias, indicaciones..." rows={3} /></label><p className="field-hint">{allergensNotice} <a href="/privacidad" onClick={openLegal('privacidad')}>Ver tratamiento de datos sensibles</a>.</p><div className="payment-note"><span>Forma de pago</span><strong>💵 Efectivo</strong></div><div className="checkout-total"><span>Subtotal</span><strong>{money.format(total)}</strong>{orderType === 'delivery' && <><span>Domicilio</span><strong>{money.format(deliveryFee)}</strong></>}<span>Total</span><strong>{money.format(checkoutTotal)}</strong></div><p className="cart-tax-note">Precios finales en pesos colombianos (COP), con impuestos y costos incluidos.</p><div className="consent-field"><input id="accept-terms" type="checkbox" checked={acceptedTerms} aria-required="true" aria-label="He leído y acepto los Términos y Condiciones y la Política de Tratamiento de Datos Personales" onChange={(event) => setAcceptedTerms(event.target.checked)} /><div className="consent-copy"><label className="consent-label" htmlFor="accept-terms">He leído y acepto los <span className="consent-required">documentos legales (obligatorio)</span></label><div className="consent-links"><a href="/terminos" onClick={openLegal('terminos')}>Términos y Condiciones</a><a href="/privacidad" onClick={openLegal('privacidad')}>Política de Tratamiento de Datos Personales</a></div></div></div>{error && <p className="form-error" role="alert">{error}</p>}{error && rememberedOrderToken && <p className="field-hint"><a href={`/track/${rememberedOrderToken}`} onClick={(event) => { event.preventDefault(); navigate(`/track/${rememberedOrderToken}`) }}>Ver mi pedido en curso</a></p>}<button disabled={saving} className="primary-button" type="submit">{saving ? 'Enviando...' : `Confirmar pedido · ${money.format(checkoutTotal)}`} {!saving && <Icon name="arrow" size={17} />}</button>{legalDoc && <LegalModal slug={legalDoc} onClose={() => setLegalDoc(null)} />}</form>
}

function TrackingPage({ token, navigate }: { token: string; navigate: (to: string) => void }) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  useEffect(() => {
    if (!supabase) { setOrder({ id: 'demo', track_token: token, status: 'preparing', customer_name: 'amigo', order_type: 'pickup', total: 32.4 }); setLoading(false); return }
    let active = true
    const load = async () => {
      const { data: orders, error: loadError } = await supabase.rpc('get_order_by_token', { p_token: token })
      if (!active) return
      const data = orders?.[0]
      if (loadError || !data) { setError('No encontramos una orden con este código.'); setLoading(false); return }
      setOrder(data as Order)
      setLoading(false)
      if (data.status === 'completed' || data.status === 'cancelled') clearRememberedOrderToken()
    }
    load()
    const timer = window.setInterval(load, 20000)
    return () => { active = false; window.clearInterval(timer) }
  }, [token])
  const statuses = ['pending', 'accepted', 'preparing', 'on_the_way', 'completed']
  const current = Math.max(0, statuses.indexOf(order?.status || 'pending'))
  const isCancelled = order?.status === 'cancelled'
  const labels = ['Pendiente', 'Aceptado', 'Preparando', 'En camino', 'Completado']
  return <div className="tracking-page"><header className="topbar"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}><span className="brand-mark">M</span><span>{business.brand}<small>{business.tagline}</small></span></a><a className="back-link page-back" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}><Icon name="back" size={16} /> Volver al menú</a></header><main className="tracking-main">{loading ? <div className="loading">Buscando tu pedido...</div> : error ? <div className="tracking-message"><div className="empty-icon"><Icon name="clock" size={28} /></div><h1>Pedido no encontrado</h1><p>{error}</p><button className="primary-button compact" onClick={() => navigate('/')}>Volver al menú</button></div> : order && <><div className="tracking-intro"><p className="eyebrow">PEDIDO #{token.slice(-6).toUpperCase()}</p><h1>¡Gracias, {order.customer_name}!</h1>{isCancelled ? <p>Este pedido no se preparó.</p> : <p>Te avisaremos cuando tu pedido avance.</p>}</div><section className="status-card"><div className="status-top"><div><p className="eyebrow">ESTADO ACTUAL</p><h2>{isCancelled ? 'Cancelado' : labels[current]}</h2></div><span className="live-dot"><i /> En vivo</span></div>{!isCancelled && <div className="timeline">{labels.map((label, index) => <div className={`timeline-step ${index <= current ? 'active' : ''} ${index === current ? 'current' : ''}`} key={label}><div className="step-dot">{index < current ? <Icon name="check" size={14} /> : index + 1}</div><span>{label}</span>{index < labels.length - 1 && <div className="step-line" />}</div>)}</div>}<div className="status-foot"><Icon name={isCancelled ? 'close' : current >= 4 ? 'check' : 'clock'} size={18} /><span>{isCancelled ? <>Pedido <strong>cancelado</strong>. Escríbenos si tienes dudas.</> : <>{current >= 4 ? 'Pedido' : 'Tiempo estimado'} <strong>{current >= 4 ? 'completado' : current >= 3 ? '¡Ya casi!' : business.deliveryEstimate}</strong></>}</span></div></section><section className="order-detail"><div><p className="eyebrow">RESUMEN</p><h2>Tu pedido</h2></div><p>{order.order_type === 'delivery' ? 'Domicilio' : 'Recoger en el local'} · Pago en efectivo</p><strong>{order.total ? money.format(order.total) : 'Total confirmado en caja'}</strong></section></>}</main><SiteFooter onNavigate={navigate} /></div>
}

export default App
