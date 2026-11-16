import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPurchaseDraft,
  getCustomerOrder,
  getCustomerOrders,
  getPurchaseWorkspace,
} from './customerPortal.js'

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('customer purchase API', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=portal-token; path=/'
  })

  it('loads the isolated workspace and order endpoints as reads', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ cart: null, drafts: [] }))
      .mockResolvedValueOnce(jsonResponse({ order: { id: 91 } }))

    await expect(getPurchaseWorkspace()).resolves.toEqual({ cart: null, drafts: [] })
    await expect(getCustomerOrder(91)).resolves.toEqual({ order: { id: 91 } })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/customer-portal/workspace',
      '/customer-portal/orders/91',
    ])
  })

  it('uses CSRF protection and preserves purchase item source data on draft writes', async () => {
    const item = {
      product_name: 'Manual product',
      product_link: 'https://item.taobao.com/item.htm?id=123456',
      variant: 'SKU red / L',
      quantity: 2,
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ draft: { id: 5, items: [item] } }, 201))

    await createPurchaseDraft({ title: 'Draft', items: [item] })

    expect(fetchMock.mock.calls[0][0]).toBe('/sanctum/csrf-cookie')
    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toBe('/customer-portal/drafts')
    expect(options).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(options.body)).toEqual({ title: 'Draft', items: [item] })
    expect(options.headers['X-XSRF-TOKEN']).toBe('portal-token')
  })

  it('encodes filters and exposes API failures instead of returning fake orders', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ message: 'Service unavailable.' }, 503))

    await expect(getCustomerOrders({ search: 'ORD 1', status: 'pending', empty: '' })).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'Service unavailable.',
    })
    expect(fetchMock.mock.calls[0][0]).toBe('/customer-portal/orders?search=ORD+1&status=pending')
  })
})
