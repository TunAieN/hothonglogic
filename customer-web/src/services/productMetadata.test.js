import { describe, expect, it, vi } from 'vitest'
import { detectProductSource, getProductMetadata, validateProductUrl } from './productMetadata.js'

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('product metadata', () => {
  it.each([
    ['https://item.taobao.com/item.htm?id=123', 'Taobao'],
    ['https://detail.tmall.com/item.htm?id=456', 'Tmall'],
    ['https://detail.1688.com/offer/789.html', '1688'],
  ])('recognizes supported marketplace URLs', (url, source) => {
    expect(detectProductSource(url)).toBe(source)
    expect(validateProductUrl(url)).toMatchObject({ valid: true, source })
  })

  it('rejects lookalike, credential-bearing, and unsupported links', () => {
    expect(validateProductUrl('https://taobao.com.evil.test/item?id=1').valid).toBe(false)
    expect(validateProductUrl('https://user:secret@taobao.com/item?id=1').valid).toBe(false)
    expect(validateProductUrl('file:///etc/passwd').valid).toBe(false)
  })

  it('preserves product identifiers in the normalized marketplace URL and returned SKU payload', async () => {
    const product = {
      status: 'success',
      normalized_url: 'https://item.taobao.com/item.htm?id=123456&skuId=9988',
      source: 'Taobao',
      title: 'Verified title',
      skus: [{ label: 'Red / L', sku: '9988' }],
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ product }))

    await expect(getProductMetadata(product.normalized_url)).resolves.toEqual(product)
    expect(fetchMock.mock.calls[0][0]).toContain('id%3D123456%26skuId%3D9988')
  })

  it('returns an explicit fallback error without inventing product fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    const result = await getProductMetadata('https://item.taobao.com/item.htm?id=123')

    expect(result).toEqual({ status: 'error', message: 'Không thể kết nối dịch vụ lấy thông tin sản phẩm.' })
    expect(result).not.toHaveProperty('title')
    expect(result).not.toHaveProperty('image')
    expect(result).not.toHaveProperty('price_cny')
  })
})
