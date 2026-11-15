import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCart } from '../src/lib/cart'
import { TERMS_MESSAGE } from '../src/lib/orders'

// Sin credenciales el checkout no llama a Supabase y el pedido se resuelve en local.
vi.stubEnv('VITE_SUPABASE_URL', '')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

type CheckoutComponent = typeof import('../src/App')['Checkout']
let Checkout: CheckoutComponent

beforeAll(async () => {
  ({ Checkout } = await import('../src/App'))
})

const dish = { id: '11111111-1111-4111-8111-111111111111', name: 'Arroz', description: '', price: 25000, image_url: '' }

function renderCheckout() {
  const props = { close: vi.fn(), navigate: vi.fn(), onBack: vi.fn() }
  render(<Checkout {...props} />)
  return props
}

const submitForm = () => fireEvent.submit(document.querySelector('form.checkout-form') as HTMLFormElement)

describe('checkout consent', () => {
  beforeEach(() => {
    localStorage.clear()
    useCart.setState({ items: [] })
    useCart.getState().addItem(dish)
  })

  it('blocks the order until the terms and privacy checkbox is checked', async () => {
    const { navigate } = renderCheckout()
    fireEvent.change(screen.getByPlaceholderText('¿Cómo te llamamos?'), { target: { value: 'Ana' } })

    submitForm()

    expect(await screen.findByRole('alert')).toHaveTextContent(TERMS_MESSAGE)
    expect(navigate).not.toHaveBeenCalled()
    expect(useCart.getState().items).toHaveLength(1)
  })

  it('opens the legal documents in a modal without leaving the checkout', async () => {
    renderCheckout()

    await userEvent.click(screen.getByRole('link', { name: 'Términos y Condiciones' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /Términos y Condiciones del Servicio/i })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends the order once the acceptance is checked', async () => {
    const { navigate, close } = renderCheckout()
    fireEvent.change(screen.getByPlaceholderText('¿Cómo te llamamos?'), { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).toBeChecked()

    submitForm()

    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/track\/demo-/))
    expect(close).toHaveBeenCalled()
    expect(useCart.getState().items).toEqual([])
  })

  it('shows the optional sensitive-data notice next to the kitchen notes', () => {
    renderCheckout()
    expect(screen.getByText(/El ingreso de datos sobre alergias es opcional/i)).toBeInTheDocument()
    expect(screen.getByText(/precios finales en pesos colombianos/i)).toBeInTheDocument()
  })
})
