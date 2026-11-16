import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CustomerAuthError,
  getCustomerSession,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  resetCustomerPassword,
} from './customerAuth.js'

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('customer authentication API', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=csrf%20value; path=/'
  })

  it.each([
    ['login', loginCustomer, { email: 'customer@example.test', password: 'Password1234' }, '/customer-auth/login'],
    ['register', registerCustomer, { name: 'Customer', email: 'customer@example.test' }, '/customer-auth/register'],
    ['logout', logoutCustomer, undefined, '/customer-auth/logout'],
    ['reset password', resetCustomerPassword, { token: 'reset-token', password: 'Password1234' }, '/customer-auth/reset-password'],
  ])('gets a CSRF cookie before %s writes', async (_name, action, input, endpoint) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ message: 'ok' }))

    await action(input)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/sanctum/csrf-cookie')
    expect(fetchMock.mock.calls[1][0]).toBe(endpoint)
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'X-XSRF-TOKEN': 'csrf value' }),
    })
  })

  it('restores a customer session without issuing a write request', async () => {
    const account = { id: 7, customer_id: 12, email: 'customer@example.test' }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ account }))

    await expect(getCustomerSession()).resolves.toEqual({ account })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/customer-auth/me', expect.objectContaining({ method: 'GET', credentials: 'include' }))
  })

  it('keeps the explicit email-verification-disabled response', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ email_verification_required: false, verification_email_sent: false }, 201))

    await expect(registerCustomer({ email: 'customer@example.test' })).resolves.toMatchObject({
      email_verification_required: false,
      verification_email_sent: false,
    })
  })

  it('surfaces stable backend authentication errors', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' }, 422))

    await expect(loginCustomer({ email: 'customer@example.test', password: 'wrong' })).rejects.toMatchObject({
      name: 'CustomerAuthError',
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials.',
    })
    await expect(Promise.reject(new CustomerAuthError('TEST', 'test'))).rejects.toBeInstanceOf(CustomerAuthError)
  })
})
