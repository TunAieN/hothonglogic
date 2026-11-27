import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCustomerDashboardAnalytics,
  getCustomerOrderShipments,
  getCustomerOrder,
  getCustomerOrders,
  getCustomerWarehousePackage,
  getCustomerWarehousePackages,
  searchCustomerTracking,
  submitCustomerPurchaseRequest,
  createCustomerTopupIntent,
  createVoucherSepayIntent,
  getCustomerFinanceSummary,
  getCustomerPaymentIntent,
  getCustomerPaymentIntents,
  payVoucherFromWallet,
  payVouchersFromWallet,
} from './customerPortal.js'

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('customer purchase API', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=portal-token; path=/'
  })

  it('loads the customer-owned order endpoint as a read', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ order: { id: 91 } }))

    await expect(getCustomerOrder(91)).resolves.toEqual({ order: { id: 91 } })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/customer-portal/orders/91'])
  })

  it('uses CSRF protection and sends the browser-cart snapshot only on submission', async () => {
    const input = { idempotency_key: 'b6bbde46-0aed-42df-9872-49f78c129f99', items: [{ local_item_id: 'local-1', product_url: 'https://item.taobao.com/item.htm?id=123456', platform: 'Taobao', title: 'Manual product', quantity: 2 }] }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ order: { id: 5 } }, 201))

    await submitCustomerPurchaseRequest(input)

    expect(fetchMock.mock.calls[0][0]).toBe('/sanctum/csrf-cookie')
    const [url, options] = fetchMock.mock.calls[1]
    expect(url).toBe('/customer-portal/purchase-requests')
    expect(options).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(options.body)).toEqual(input)
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

  it('requests dashboard analytics for the selected period', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ monthly: [] }))

    await getCustomerDashboardAnalytics(12)

    expect(fetchMock.mock.calls[0][0]).toBe('/customer-portal/dashboard-analytics?months=12')
  })

  it('uses read-only customer logistics endpoints', async () => {
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ packages: [] }))
      .mockResolvedValueOnce(jsonResponse({ package: { id: 21 } }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))

    await getCustomerWarehousePackages({ page: 2, status: 'in_transit', empty: '' })
    await getCustomerWarehousePackage(21)
    await searchCustomerTracking('YT 123', { signal: controller.signal })
    await getCustomerOrderShipments(91)

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/customer-portal/warehouse-packages?page=2&status=in_transit',
      '/customer-portal/warehouse-packages/21',
      '/customer-portal/tracking?code=YT+123',
      '/customer-portal/orders/91/shipments',
    ])
    expect(fetchMock.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true)
    expect(fetchMock.mock.calls[2][1].signal).toBe(controller.signal)
  })

  it('uses customer-scoped finance endpoints and CSRF for every financial write', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ balance_vnd: 0 }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ intent: { reference: 'VT1' } }, 201))
      .mockResolvedValueOnce(jsonResponse({ intent: { status: 'pending' } }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ intent: { reference: 'VT2' } }, 201))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ intent: { status: 'completed' } }))

    await getCustomerFinanceSummary()
    await getCustomerPaymentIntents({ status: 'pending', search: 'VT 1', empty: '' })
    await createCustomerTopupIntent({ amount_vnd: 100000, idempotency_key: 'topup-1' })
    await getCustomerPaymentIntent('VT1')
    await createVoucherSepayIntent(9, { idempotency_key: 'voucher-1' })
    await payVoucherFromWallet(9, { idempotency_key: 'wallet-1' })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/customer-portal/finance/summary',
      '/customer-portal/finance/payment-intents?status=pending&search=VT+1',
      '/sanctum/csrf-cookie', '/customer-portal/finance/top-up-intents',
      '/customer-portal/finance/payment-intents/VT1',
      '/sanctum/csrf-cookie', '/customer-portal/finance/payment-vouchers/9/sepay-intents',
      '/sanctum/csrf-cookie', '/customer-portal/finance/payment-vouchers/9/wallet-payments',
    ])
  })

  it('surfaces Retry-After on HTTP 429 without retrying a financial POST', async () => {
    const limited = new Response(JSON.stringify({ message: 'Too Many Attempts.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '17' },
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(limited)

    await expect(createCustomerTopupIntent({ amount_vnd: 100000, idempotency_key: 'topup-limited' }))
      .rejects.toMatchObject({ status: 429, retryAfter: 17, message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau 17 giây.' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('posts one customer-scoped atomic wallet checkout request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ intents: [{ payment_voucher_id: 1, status: 'completed' }] }))

    const payload = { voucher_ids: [1, 2], idempotency_key: 'checkout-1' }
    await payVouchersFromWallet(payload)

    expect(fetchMock.mock.calls[1][0]).toBe('/customer-portal/finance/payment-vouchers/wallet-checkout')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(payload)
  })

})
