import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getRememberedOrderToken, isActiveOrderStatus, clearRememberedOrderToken } from '../lib/customer-session'

type ActiveOrderBannerProps = {
  onOpen: (token: string) => void
}

type ActiveOrder = { track_token: string; status: string }

export function ActiveOrderBanner({ onOpen }: ActiveOrderBannerProps) {
  const [order, setOrder] = useState<ActiveOrder | null>(null)

  useEffect(() => {
    if (!supabase) return
    const token = getRememberedOrderToken()
    if (!token) return
    let active = true
    supabase.rpc('get_order_by_token', { p_token: token }).then(({ data }) => {
      const found = data?.[0] as ActiveOrder | undefined
      if (!active || !found) return
      if (isActiveOrderStatus(found.status)) setOrder(found)
      else clearRememberedOrderToken()
    })
    return () => { active = false }
  }, [])

  if (!order) return null

  return <div className="active-order-banner" role="status">
    <span>Ya tienes un pedido en curso. Puedes seguirlo mientras terminas de elegir.</span>
    <button type="button" className="legal-link" onClick={() => onOpen(order.track_token)}>Ver seguimiento</button>
  </div>
}
