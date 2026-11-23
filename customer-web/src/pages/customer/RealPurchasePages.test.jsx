import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RealCartAndDraftsPage, RealCreateOrderPage, RealOrderDetailPage, RealOrdersPage } from './RealPurchasePages.jsx'
import { addItem } from '../../services/customerLocalCart.js'
import * as portalApi from '../../api/customerPortal.js'
import * as metadataApi from '../../services/productMetadata.js'
import * as extensionApi from '../../services/customerExtension.js'

vi.mock('../../api/customerPortal.js', async () => {
  const actual = await vi.importActual('../../api/customerPortal.js')
  return {
    ...actual,
    getCustomerOrder: vi.fn(),
    getCustomerOrders: vi.fn(),
    submitCustomerPurchaseRequest: vi.fn(),
  }
})

vi.mock('../../services/productMetadata.js', async () => {
  const actual = await vi.importActual('../../services/productMetadata.js')
  return {
    ...actual,
    getProductMetadata: vi.fn(),
  }
})

vi.mock('../../services/customerExtension.js', async () => {
  const actual = await vi.importActual('../../services/customerExtension.js')
  return { ...actual, detectCustomerExtension: vi.fn(), extractProductWithExtension: vi.fn() }
})

const routes = {
  createOrder: '/tai-khoan/tao-don',
  orderDetail: '/tai-khoan/don-mua-ho/chi-tiet',
  orders: '/tai-khoan/don-mua-ho',
  cart: '/tai-khoan/gio-hang',
  support: '/tai-khoan/ho-tro',
}

const detailOrder = {
  id: 91, order_code: 'REQ-6CFAE6E28AC2E7737BA0', status: 'pending', creation_source: 'customer_portal',
  created_at: '2026-11-19T01:11:00Z', updated_at: '2026-11-19T01:11:00Z', submitted_at: '2026-11-19T01:11:00Z',
  item_count: 2, quantity: 2, product_total_cny: '18.10', product_total_vnd: 651600, exchange_rate: '36000.0000', note: null,
  account_manager: null, payment: null, customer_contact: { name: 'Nguyễn Hải Yến', phone: '0987654321', email: 'haiyen@example.com' },
  submitted_by: { id: 7, email: 'haiyen@example.com', phone: '+84987654321' },
  items: [
    { id: 1, product_name: '湿纸巾婴儿手口专用加大加厚湿巾', product_link: 'https://item.taobao.com/item.htm?id=1', product_image: 'https://img.test/one.jpg', price_cny: '5.20', reference_subtotal_cny: '5.20', quantity: 1, variant_label: null, selected_attributes: {}, source_sku_id: null, note: null },
    { id: 2, product_name: '【2只装】婴儿墨镜配饰链', product_link: 'https://detail.tmall.com/item.htm?id=2', product_image: 'https://img.test/two.jpg', price_cny: '12.90', reference_subtotal_cny: '12.90', quantity: 1, variant_label: 'Màu đen', selected_attributes: { Màu: 'Đen' }, source_sku_id: 'sku-black', note: 'Kiểm tra trước khi mua' },
  ],
  history: [{ type: 'created', status: 'pending', occurred_at: '2026-11-19T01:11:00Z' }], package_count: 0, invoice_count: 0, tracking_count: 0,
}

describe('real customer purchase pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/tai-khoan/tao-don')
    localStorage.clear()
    extensionApi.detectCustomerExtension.mockResolvedValue({ connected: false, reason: 'not_connected' })
    extensionApi.extractProductWithExtension.mockResolvedValue({ status: 'extension_unavailable' })
  })

  it('shows the exact supported Customer Web origin when running on the wrong local port', async () => {
    extensionApi.detectCustomerExtension.mockResolvedValue({
      connected: false,
      reason: 'unsupported_origin',
      origin: 'http://localhost:5174',
      expectedOrigin: 'http://localhost:5173',
    })

    render(<RealCreateOrderPage routes={routes} customerId={12} />)

    expect(await screen.findByText('Website đang ở origin không được hỗ trợ')).toBeInTheDocument()
    expect(screen.getByText(/Website đang chạy tại http:\/\/localhost:5174.*http:\/\/localhost:5173/)).toBeInTheDocument()
  })

  it('keeps the extension connection failure visible while metadata fallback succeeds', async () => {
    extensionApi.extractProductWithExtension.mockImplementation(async (_url, options) => {
      options.onConnection({ connected: false, reason: 'not_connected' })
      return { status: 'extension_unavailable', connection: { connected: false, reason: 'not_connected' } }
    })
    metadataApi.getProductMetadata.mockResolvedValue({
      status: 'partial', source: 'Taobao', normalized_url: 'https://item.taobao.com/item.htm?id=321', title: 'Metadata công khai',
      image: null, images: [], price_cny: null, has_variants: false, sku_extraction_complete: false, attribute_groups: [], skus: [],
      message: 'Metadata dự phòng chưa đầy đủ.',
    })
    const user = userEvent.setup()
    render(<RealCreateOrderPage routes={routes} customerId={12} />)

    await user.type(screen.getByLabelText('Link sản phẩm'), 'https://item.taobao.com/item.htm?id=321')
    await user.click(screen.getByRole('button', { name: 'Lấy thông tin sản phẩm' }))

    expect(await screen.findByText('Không kết nối được Customer Extension')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Metadata công khai')).toBeInTheDocument()
    expect(screen.getAllByText(/Metadata dự phòng — chưa đầy đủ/).length).toBeGreaterThan(0)
  })

  it('reports a scraper timeout separately after the extension handshake succeeds', async () => {
    extensionApi.extractProductWithExtension.mockImplementation(async (_url, options) => {
      options.onConnection({ connected: true, extensionId: 'extension-qa-id' })
      throw new Error('EXTENSION_TIMEOUT')
    })
    metadataApi.getProductMetadata.mockResolvedValue({ status: 'error', message: 'Metadata công khai không có dữ liệu.' })
    const user = userEvent.setup()
    render(<RealCreateOrderPage routes={routes} customerId={12} />)

    await user.type(screen.getByLabelText('Link sản phẩm'), 'https://item.taobao.com/item.htm?id=654')
    await user.click(screen.getByRole('button', { name: 'Lấy thông tin sản phẩm' }))

    expect(await screen.findByText('Customer Extension đã kết nối nhưng hết thời gian chờ')).toBeInTheDocument()
    expect(await screen.findByText('Metadata công khai không có dữ liệu.')).toBeInTheDocument()
  })

  it('renders verified attribute groups and updates price for the selected SKU', async () => {
    metadataApi.getProductMetadata.mockResolvedValue({
      status: 'success', source: 'Tmall', normalized_url: 'https://detail.tmall.com/item.htm?id=456', title: 'Áo Tmall', image: 'https://img.test/main.jpg', images: ['https://img.test/main.jpg'], price_cny: 9,
      has_variants: true, sku_extraction_complete: true,
      attribute_groups: [
        { group_id: 'color', name: '颜色分类', semantic: 'color', values: [{ value_id: 'red', label: '红色' }, { value_id: 'blue', label: '蓝色' }] },
        { group_id: 'size', name: '尺码', semantic: 'size', values: [{ value_id: 's', label: 'S' }, { value_id: 'l', label: 'L' }] },
      ],
      skus: [
        { sku_id: 'red-s', label: '红色 / S', attributes: [{ group_id: 'color', value_id: 'red', name: '颜色分类', value: '红色' }, { group_id: 'size', value_id: 's', name: '尺码', value: 'S' }], color: '红色', size: 'S', price_cny: 12.5, image: 'https://img.test/red.jpg', availability: true },
        { sku_id: 'blue-l', label: '蓝色 / L', attributes: [{ group_id: 'color', value_id: 'blue', name: '颜色分类', value: '蓝色' }, { group_id: 'size', value_id: 'l', name: '尺码', value: 'L' }], color: '蓝色', size: 'L', price_cny: 14, availability: true },
      ],
    })
    const user = userEvent.setup()
    render(<RealCreateOrderPage routes={routes} customerId={12} />)
    await user.type(screen.getByLabelText('Link sản phẩm'), 'https://detail.tmall.com/item.htm?id=456')
    await user.click(screen.getByRole('button', { name: 'Lấy thông tin sản phẩm' }))
    await screen.findByRole('group', { name: '颜色分类' })
    const redOption = screen.getByRole('button', { name: '红色' })
    await user.click(redOption)
    await waitFor(() => expect(redOption).toHaveAttribute('aria-pressed', 'true'))
    await user.click(screen.getByRole('button', { name: 'S' }))
    await waitFor(() => expect(screen.getByLabelText('Giá tham khảo (CNY)')).toHaveValue(12.5))
    expect(screen.getByLabelText('Phân loại')).toHaveValue('颜色分类: 红色 / 尺码: S')
    const summary = screen.getByRole('complementary')
    await waitFor(() => expect(within(summary).getByText('SKU: red-s')).toBeInTheDocument())
    expect(within(summary).getAllByText('12,5 CNY').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Tăng số lượng sản phẩm' }))
    expect(within(summary).getByText('25 CNY')).toBeInTheDocument()
    expect(within(summary).getAllByText('0', { selector: 'dd' })).toHaveLength(2)
  })

  it('ignores a late extension response from the previous pasted URL', async () => {
    const deferred = []
    extensionApi.extractProductWithExtension.mockImplementation(() => new Promise((resolve) => deferred.push(resolve)))
    render(<RealCreateOrderPage routes={routes} customerId={12} />)
    const link = screen.getByLabelText('Link sản phẩm')
    fireEvent.change(link, { target: { value: 'https://detail.tmall.com/item.htm?id=111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lấy thông tin sản phẩm' }))
    fireEvent.change(link, { target: { value: 'https://detail.tmall.com/item.htm?id=222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lấy thông tin sản phẩm' }))
    deferred[1]({ status: 'success', product: { extraction_status: 'success', platform: 'Tmall', normalized_url: 'https://detail.tmall.com/item.htm?id=222', title: 'Sản phẩm mới', main_image: 'https://img.test/new.jpg', images: ['https://img.test/new.jpg'], price_cny: 22, skus: [], attribute_groups: [], has_variants: false, sku_extraction_complete: true } })
    await screen.findByDisplayValue('Sản phẩm mới')
    deferred[0]({ status: 'success', product: { extraction_status: 'success', platform: 'Tmall', normalized_url: 'https://detail.tmall.com/item.htm?id=111', title: 'Sản phẩm cũ', main_image: 'https://img.test/old.jpg', images: ['https://img.test/old.jpg'], price_cny: 11, skus: [], attribute_groups: [], has_variants: false, sku_extraction_complete: true } })
    await waitFor(() => expect(screen.getByLabelText('Tên sản phẩm *')).toHaveValue('Sản phẩm mới'))
  })

  it('clears the extracted product when the URL no longer matches the active preview', async () => {
    metadataApi.getProductMetadata.mockResolvedValue({
      status: 'success', source: 'Taobao', normalized_url: 'https://item.taobao.com/item.htm?id=123', title: 'Sản phẩm cũ', image: 'https://img.test/old.jpg', images: ['https://img.test/old.jpg'], price_cny: 5.99,
      has_variants: false, sku_extraction_complete: true, attribute_groups: [], skus: [],
    })
    const user = userEvent.setup()
    render(<RealCreateOrderPage routes={routes} customerId={12} />)
    const link = screen.getByLabelText('Link sản phẩm')
    await user.type(link, 'https://item.taobao.com/item.htm?id=123')
    await user.click(screen.getByRole('button', { name: 'Lấy thông tin sản phẩm' }))
    await screen.findByDisplayValue('Sản phẩm cũ')

    fireEvent.change(link, { target: { value: 'https://item.taobao.com' } })

    expect(screen.getByLabelText('Tên sản phẩm *')).toHaveValue('')
    expect(screen.getByText('Dán link để xem sản phẩm tại đây trước khi thêm vào giỏ.')).toBeInTheDocument()
    expect(screen.queryByText('Sản phẩm cũ')).not.toBeInTheDocument()
  })

  it('keeps manually entered product data when metadata lookup fails', async () => {
    metadataApi.getProductMetadata.mockResolvedValue({ status: 'error', message: 'Nguồn hàng không phản hồi.' })
    const user = userEvent.setup()
    render(<RealCreateOrderPage routes={routes} customerId={12} />)

    const name = screen.getByLabelText('Tên sản phẩm *')
    const link = screen.getByLabelText('Link sản phẩm')
    const price = screen.getByLabelText('Giá tham khảo (CNY)')
    await user.type(name, 'Tên nhập thủ công')
    await user.type(link, 'https://item.taobao.com/item.htm?id=123456')
    await user.type(price, '88.5')
    await user.click(screen.getByRole('button', { name: 'Lấy thông tin sản phẩm' }))

    await screen.findByText('Nguồn hàng không phản hồi.')
    expect(name).toHaveValue('Tên nhập thủ công')
    expect(link).toHaveValue('https://item.taobao.com/item.htm?id=123456')
    expect(price).toHaveValue(88.5)
  })

  it('adds the current product to the customer-scoped browser cart', async () => {
    const cartUpdated = vi.fn()
    window.addEventListener('viettrung:cart-updated', cartUpdated, { once: true })
    const user = userEvent.setup()
    render(<RealCreateOrderPage routes={routes} customerId={12} />)

    await user.type(screen.getByLabelText('Tên sản phẩm *'), 'Áo khoác Taobao')
    await user.type(screen.getByLabelText('Link sản phẩm'), 'https://item.taobao.com/item.htm?id=123456')
    await user.type(screen.getByLabelText('Giá tham khảo (CNY)'), '88.5')
    await user.click(screen.getByRole('button', { name: 'THÊM VÀO GIỎ HÀNG' }))

    const stored = JSON.parse(localStorage.getItem('viettrung:customer-cart:v1:12'))
    expect(stored.items).toEqual([expect.objectContaining({ title: 'Áo khoác Taobao', product_url: 'https://item.taobao.com/item.htm?id=123456', reference_price_cny: 88.5, quantity: 1 })])
    expect(await screen.findByRole('status')).toHaveTextContent('Đã thêm sản phẩm vào giỏ hàng trên trình duyệt.')
    expect(screen.getByRole('link', { name: 'Mở giỏ hàng' })).toHaveAttribute('href', routes.cart)
    expect(screen.getByLabelText('Tên sản phẩm *')).toHaveValue('')
    expect(cartUpdated).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ customerId: '12', count: 1 }) }))
  })

  it('prevents a double-click from adding the same product twice', async () => {
    const user = userEvent.setup()
    render(<RealCreateOrderPage routes={routes} customerId={12} />)
    await user.type(screen.getByLabelText('Tên sản phẩm *'), 'Sản phẩm cần giữ lại')
    await user.type(screen.getByLabelText('Link sản phẩm'), 'https://item.taobao.com/item.htm?id=999')
    const addButton = screen.getByRole('button', { name: 'THÊM VÀO GIỎ HÀNG' })
    fireEvent.click(addButton)
    fireEvent.click(addButton)
    const stored = JSON.parse(localStorage.getItem('viettrung:customer-cart:v1:12'))
    expect(stored.items).toHaveLength(1)
    expect(stored.items[0].quantity).toBe(1)
  })

  it('keeps the local cart intact when Laravel rejects the final submission', async () => {
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=77', platform: 'Taobao', title: 'Sản phẩm chưa gửi', quantity: 1, selected_attributes: {}, sku_required: false })
    portalApi.submitCustomerPurchaseRequest.mockRejectedValueOnce(new Error('Không thể tạo yêu cầu.'))
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} />)

    await user.click(screen.getByRole('button', { name: /Gửi 1 sản phẩm mua hộ/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tạo yêu cầu.')
    expect(screen.getByText('Sản phẩm chưa gửi')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('viettrung:customer-cart:v1:12')).items).toHaveLength(1)
  })

  it('submits only checked items and leaves unchecked items in the browser cart on failure', async () => {
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=1', platform: 'Taobao', title: 'Sản phẩm chọn', quantity: 2, reference_price_cny: 5.99, selected_attributes: {}, sku_required: false })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=2', platform: 'Taobao', title: 'Sản phẩm bỏ chọn', quantity: 1, reference_price_cny: 11.9, selected_attributes: {}, sku_required: false })
    portalApi.submitCustomerPurchaseRequest.mockRejectedValueOnce(new Error('Mạng lỗi.'))
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} />)
    await user.click(screen.getByRole('checkbox', { name: 'Chọn Sản phẩm bỏ chọn' }))
    expect(screen.getByText('11,98 CNY')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Gửi 1 sản phẩm mua hộ/ }))
    await screen.findByText('Mạng lỗi.')
    expect(portalApi.submitCustomerPurchaseRequest).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ title: 'Sản phẩm chọn' })] }))
    expect(JSON.parse(localStorage.getItem('viettrung:customer-cart:v1:12')).items).toHaveLength(2)
  })

  it('renders an enabled interactive button and sends three selected products from a real user click', async () => {
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=1', platform: 'Taobao', title: 'Sản phẩm 1', sku_id: 'sku-1', quantity: 2, selected_attributes: { Màu: 'Đỏ' }, sku_required: true })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=2', platform: 'Taobao', title: 'Sản phẩm 2', sku_id: 'sku-2', quantity: 1, selected_attributes: { Size: 'L' }, sku_required: true })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=3', platform: 'Taobao', title: 'Sản phẩm 3', quantity: 1, selected_attributes: {}, sku_required: false })
    portalApi.submitCustomerPurchaseRequest.mockRejectedValueOnce(new Error('Dừng tại mock, không gửi production.'))
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} />)

    const button = screen.getByRole('button', { name: 'Gửi 3 sản phẩm mua hộ' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toBeEnabled()
    expect(window.getComputedStyle(button).pointerEvents).not.toBe('none')
    await user.click(button)

    await waitFor(() => expect(portalApi.submitCustomerPurchaseRequest).toHaveBeenCalledTimes(1))
    expect(portalApi.submitCustomerPurchaseRequest).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({ title: 'Sản phẩm 1', sku_id: 'sku-1', quantity: 2 }),
        expect.objectContaining({ title: 'Sản phẩm 2', sku_id: 'sku-2', quantity: 1 }),
        expect.objectContaining({ title: 'Sản phẩm 3', quantity: 1 }),
      ]),
    }))
  })

  it('shows a validation message instead of silently returning when no product is selected', async () => {
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=4', platform: 'Taobao', title: 'Sản phẩm bỏ chọn', quantity: 1, selected_attributes: {}, sku_required: false })
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} />)

    await user.click(screen.getByRole('checkbox', { name: 'Chọn Sản phẩm bỏ chọn' }))
    const button = screen.getByRole('button', { name: 'Gửi 0 sản phẩm mua hộ' })
    expect(button).toBeEnabled()
    await user.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng chọn ít nhất một sản phẩm')
    expect(portalApi.submitCustomerPurchaseRequest).not.toHaveBeenCalled()
  })

  it('locks the submit button while the request is pending and prevents a duplicate click', async () => {
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=5', platform: 'Taobao', title: 'Sản phẩm đang gửi', quantity: 1, selected_attributes: {}, sku_required: false })
    let rejectRequest
    portalApi.submitCustomerPurchaseRequest.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectRequest = reject }))
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} />)

    const button = screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' })
    await user.dblClick(button)

    expect(portalApi.submitCustomerPurchaseRequest).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Đang gửi yêu cầu...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Đang gửi yêu cầu...' })).toHaveAttribute('aria-busy', 'true')
    rejectRequest(new Error('Mạng lỗi.'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mạng lỗi.')
  })

  it('keeps the idempotency key after failure and reuses it for retry', async () => {
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=6', platform: 'Taobao', title: 'Sản phẩm thử lại', quantity: 1, selected_attributes: {}, sku_required: false })
    portalApi.submitCustomerPurchaseRequest.mockRejectedValue(new Error('Máy chủ tạm thời không phản hồi.'))
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} />)
    const button = screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' })

    await user.click(button)
    await screen.findByRole('alert')
    const firstKey = portalApi.submitCustomerPurchaseRequest.mock.calls[0][0].idempotency_key
    await user.click(button)
    await waitFor(() => expect(portalApi.submitCustomerPurchaseRequest).toHaveBeenCalledTimes(2))

    expect(portalApi.submitCustomerPurchaseRequest.mock.calls[1][0].idempotency_key).toBe(firstKey)
    expect(JSON.parse(localStorage.getItem('viettrung:customer-cart:v1:12')).items).toHaveLength(1)
  })

  it('removes only the submitted snapshot after backend success and then navigates', async () => {
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=7', platform: 'Taobao', title: 'Sản phẩm thành công', quantity: 1, selected_attributes: {}, sku_required: false })
    portalApi.submitCustomerPurchaseRequest.mockResolvedValueOnce({ order: { id: 701, order_code: 'REQ-701' } })
    const navigate = vi.fn()
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} navigate={navigate} />)

    await user.click(screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tai-khoan/don-mua-ho/chi-tiet?id=701'))
    expect(JSON.parse(localStorage.getItem('viettrung:customer-cart:v1:12')).items).toHaveLength(0)
  })

  it.each([1440, 390])('keeps the submit interaction available at %ipx viewport width', async (viewportWidth) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewportWidth })
    window.dispatchEvent(new Event('resize'))
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=8', platform: 'Taobao', title: `Sản phẩm ${viewportWidth}`, quantity: 1, selected_attributes: {}, sku_required: false })
    portalApi.submitCustomerPurchaseRequest.mockRejectedValueOnce(new Error('Dừng tại mock.'))
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} />)

    await user.click(screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' }))

    await waitFor(() => expect(portalApi.submitCustomerPurchaseRequest).toHaveBeenCalledTimes(1))
  })

  it('submits three independent orders A, B and C in one mounted cart session', async () => {
    const navigate = vi.fn()
    portalApi.submitCustomerPurchaseRequest
      .mockResolvedValueOnce({ order: { id: 801, order_code: 'REQ-A' } })
      .mockResolvedValueOnce({ order: { id: 802, order_code: 'REQ-B' } })
      .mockResolvedValueOnce({ order: { id: 803, order_code: 'REQ-C' } })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=a1', platform: 'Taobao', title: 'A1', quantity: 1, selected_attributes: {}, sku_required: false })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=a2', platform: 'Taobao', title: 'A2', quantity: 1, selected_attributes: {}, sku_required: false })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=a3', platform: 'Taobao', title: 'A3', quantity: 1, selected_attributes: {}, sku_required: false })
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} navigate={navigate} />)

    await user.click(screen.getByRole('button', { name: 'Gửi 3 sản phẩm mua hộ' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    addItem(12, { product_url: 'https://detail.tmall.com/item.htm?id=b1', platform: 'Tmall', title: 'B1', quantity: 1, selected_attributes: {}, sku_required: false })
    addItem(12, { product_url: 'https://detail.tmall.com/item.htm?id=b2', platform: 'Tmall', title: 'B2', quantity: 1, selected_attributes: {}, sku_required: false })
    await user.click(await screen.findByRole('button', { name: 'Gửi 2 sản phẩm mua hộ' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2))
    addItem(12, { product_url: 'https://detail.1688.com/offer/c1.html', platform: '1688', title: 'C1', quantity: 1, selected_attributes: {}, sku_required: false })
    await user.click(await screen.findByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(3))

    const keys = portalApi.submitCustomerPurchaseRequest.mock.calls.map(([payload]) => payload.idempotency_key)
    expect(new Set(keys).size).toBe(3)
    expect(portalApi.submitCustomerPurchaseRequest.mock.calls.map(([payload]) => payload.items.map((entry) => entry.title))).toEqual([
      ['A1', 'A2', 'A3'], ['B1', 'B2'], ['C1'],
    ])
    expect(JSON.parse(localStorage.getItem('viettrung:customer-cart:v1:12')).items).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Gửi 0 sản phẩm mua hộ' })).toHaveAttribute('data-submit-state', 'idle')
  })

  it('releases the submit lifecycle after navigation and a fresh cart mount', async () => {
    const navigate = vi.fn()
    portalApi.submitCustomerPurchaseRequest
      .mockResolvedValueOnce({ order: { id: 811, order_code: 'REQ-A' } })
      .mockResolvedValueOnce({ order: { id: 812, order_code: 'REQ-B' } })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=nav-a', platform: 'Taobao', title: 'Điều hướng A', quantity: 1, selected_attributes: {}, sku_required: false })
    const user = userEvent.setup()
    const firstPage = render(<RealCartAndDraftsPage routes={routes} customerId={12} navigate={navigate} />)
    await user.click(screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    firstPage.unmount()

    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=nav-b', platform: 'Taobao', title: 'Quay lại B', quantity: 1, selected_attributes: {}, sku_required: false })
    render(<RealCartAndDraftsPage routes={routes} customerId={12} navigate={navigate} />)
    const secondButton = screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' })
    expect(secondButton).toHaveAttribute('data-submit-state', 'idle')
    await user.click(secondButton)

    await waitFor(() => expect(portalApi.submitCustomerPurchaseRequest).toHaveBeenCalledTimes(2))
    expect(portalApi.submitCustomerPurchaseRequest.mock.calls[1][0].items[0].title).toBe('Quay lại B')
  })

  it('replays an uncertain request with the same key, then creates a new key for the next cart', async () => {
    const navigate = vi.fn()
    portalApi.submitCustomerPurchaseRequest
      .mockRejectedValueOnce(new Error('Mất phản hồi sau khi gửi.'))
      .mockResolvedValueOnce({ order: { id: 821, order_code: 'REQ-A' }, idempotent_replay: true })
      .mockResolvedValueOnce({ order: { id: 822, order_code: 'REQ-B' } })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=replay-a', platform: 'Taobao', title: 'Replay A', quantity: 1, selected_attributes: {}, sku_required: false })
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} navigate={navigate} />)
    const firstButton = screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' })

    await user.click(firstButton)
    await screen.findByText('Mất phản hồi sau khi gửi.')
    await user.click(firstButton)
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=replay-b', platform: 'Taobao', title: 'Đơn mới B', quantity: 1, selected_attributes: {}, sku_required: false })
    await user.click(await screen.findByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2))

    const [firstKey, replayKey, nextKey] = portalApi.submitCustomerPurchaseRequest.mock.calls.map(([payload]) => payload.idempotency_key)
    expect(replayKey).toBe(firstKey)
    expect(nextKey).not.toBe(firstKey)
  })

  it('preserves an unselected row and later submits it together with a newly added row', async () => {
    const navigate = vi.fn()
    portalApi.submitCustomerPurchaseRequest
      .mockResolvedValueOnce({ order: { id: 831, order_code: 'REQ-A' } })
      .mockResolvedValueOnce({ order: { id: 832, order_code: 'REQ-BC' } })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=selected-a', platform: 'Taobao', title: 'Selected A', quantity: 1, selected_attributes: {}, sku_required: false })
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=kept-b', platform: 'Taobao', title: 'Kept B', quantity: 1, selected_attributes: {}, sku_required: false })
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} navigate={navigate} />)
    await user.click(screen.getByRole('checkbox', { name: 'Chọn Kept B' }))
    await user.click(screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Kept B')).toBeInTheDocument()

    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=new-c', platform: 'Taobao', title: 'New C', quantity: 1, selected_attributes: {}, sku_required: false })
    await user.click(screen.getByRole('checkbox', { name: 'Chọn Kept B' }))
    await user.click(await screen.findByRole('button', { name: 'Gửi 2 sản phẩm mua hộ' }))
    await waitFor(() => expect(portalApi.submitCustomerPurchaseRequest).toHaveBeenCalledTimes(2))

    expect(portalApi.submitCustomerPurchaseRequest.mock.calls[1][0].items.map((entry) => entry.title)).toEqual(['Kept B', 'New C'])
  })

  it('emits development submit diagnostics without payload, token or idempotency key values', async () => {
    addItem(12, { product_url: 'https://item.taobao.com/item.htm?id=debug', platform: 'Taobao', title: 'Debug item', quantity: 1, selected_attributes: {}, sku_required: false })
    portalApi.submitCustomerPurchaseRequest.mockRejectedValueOnce(new Error('Dừng tại mock.'))
    const diagnostics = []
    const listener = (event) => diagnostics.push(event.detail)
    window.addEventListener('viettrung:cart-submit-debug', listener)
    const user = userEvent.setup()
    render(<RealCartAndDraftsPage routes={routes} customerId={12} />)

    await user.click(screen.getByRole('button', { name: 'Gửi 1 sản phẩm mua hộ' }))
    await screen.findByText('Dừng tại mock.')
    window.removeEventListener('viettrung:cart-submit-debug', listener)

    expect(diagnostics.map((entry) => entry.stage)).toEqual(expect.arrayContaining(['click_received', 'api_request_started', 'submit_failed', 'submit_released']))
    expect(JSON.stringify(diagnostics)).not.toContain('idempotency_key')
    expect(JSON.stringify(diagnostics)).not.toContain('https://')
    expect(diagnostics.at(-1)).toMatchObject({ stage: 'submit_released', locked: false })
  })

  it('renders a recoverable error instead of a blank or endless loading screen', async () => {
    portalApi.getCustomerOrders.mockRejectedValue(new Error('Không thể tải danh sách đơn.'))
    render(<RealOrdersPage routes={routes} />)

    expect(screen.getByText('Đang tải dữ liệu tài khoản...')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải danh sách đơn.'))
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeEnabled()

    portalApi.getCustomerOrders.mockResolvedValue({ orders: [], pagination: { total: 0 } })
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await screen.findByText('Bạn chưa có đơn hàng mua hộ')
  })

  it('renders long real order data without losing money/status fields and paginates through the API', async () => {
    const result = {
      orders: [{ id: 91, order_code: 'REQ-1234567890ABCDEFGHIJ', status: 'shipped', product_total_cny: '23.88', product_total_vnd: 859680, item_count: 2, quantity: 3, created_at: '2026-11-18T08:00:00Z', updated_at: '2026-11-18T09:00:00Z', items: [{ id: 1, product_name: '新华书店超长商品名称用于验证两行截断不会挤压其他表格列', product_image: 'https://img.test/one.jpg', color: '白色', size: 'L' }, { id: 2, product_name: '第二件商品', product_image: 'https://img.test/two.jpg' }] }],
      pagination: { current_page: 1, last_page: 3, total: 21 },
      statistics: { total: 21, by_status: { pending: 5, purchasing: 3, shipped: 4, completed: 9 } },
    }
    portalApi.getCustomerOrders.mockResolvedValue(result)
    const user = userEvent.setup()
    render(<RealOrdersPage routes={routes} />)

    expect((await screen.findAllByText('REQ-1234567890ABCDEFGHIJ')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('23,88 CNY').length).toBeGreaterThan(0)
    const shippingStatLabel = screen.getAllByText('Đang vận chuyển').find((node) => node.tagName === 'SMALL')
    expect(shippingStatLabel.closest('article')).toHaveTextContent('4')
    await user.click(screen.getByRole('button', { name: 'Trang 2' }))
    await waitFor(() => expect(portalApi.getCustomerOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, per_page: 10 })))
  })

  it('sends history search, status and date filters to the real paginated endpoint', async () => {
    portalApi.getCustomerOrders.mockResolvedValue({ orders: [], pagination: { current_page: 1, last_page: 1, total: 0 }, statistics: { total: 0, by_status: {} } })
    const user = userEvent.setup()
    render(<RealOrdersPage routes={routes} historyMode />)
    await screen.findByText('Không có đơn trong khoảng thời gian này')
    await user.type(screen.getByRole('textbox', { name: 'Tìm kiếm đơn hàng' }), 'REQ-88')
    await user.selectOptions(screen.getByLabelText('Lọc trạng thái'), 'completed')
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-11-18' } })
    await user.click(screen.getByRole('button', { name: 'Lọc' }))
    await waitFor(() => expect(portalApi.getCustomerOrders).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'REQ-88', status: 'completed', created_from: '2026-11-01', created_to: '2026-11-18', page: 1 })))
  })

  it('renders the customer order detail from real API fields without replacing missing data with zero or invented states', async () => {
    window.history.replaceState(null, '', '/tai-khoan/don-mua-ho/chi-tiet?id=91')
    portalApi.getCustomerOrder.mockResolvedValue({ order: detailOrder })
    render(<RealOrderDetailPage routes={routes} />)

    expect(await screen.findByRole('heading', { name: 'Chi tiết đơn mua hộ' })).toBeInTheDocument()
    expect(portalApi.getCustomerOrder).toHaveBeenCalledWith('91')
    expect(screen.getAllByText('18,1 CNY').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5,2 CNY').length).toBeGreaterThan(0)
    expect(screen.getAllByText('12,9 CNY').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Chưa có yêu cầu thanh toán').length).toBeGreaterThan(0)
    expect(screen.getByText('Chưa tiếp nhận')).toBeInTheDocument()
    expect(screen.getByText('Khách hàng tự gửi')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Hải Yến')).toBeInTheDocument()
    expect(screen.queryByText('0 CNY')).not.toBeInTheDocument()
  })

  it('copies the real order code and exposes the product link and recorded timeline', async () => {
    window.history.replaceState(null, '', '/tai-khoan/don-mua-ho/chi-tiet?id=91')
    portalApi.getCustomerOrder.mockResolvedValue({ order: detailOrder })
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(<RealOrderDetailPage routes={routes} />)

    await screen.findByRole('heading', { name: 'Chi tiết đơn mua hộ' })
    await user.click(screen.getByRole('button', { name: 'Sao chép mã đơn' }))
    expect(writeText).toHaveBeenCalledWith('REQ-6CFAE6E28AC2E7737BA0')
    expect(await screen.findByRole('status')).toHaveTextContent('Đã sao chép')
    expect(screen.getByText('Đã gửi yêu cầu')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Mở link/ })).toHaveLength(4)
  })

  it('keeps incomplete item, contact and payment data explicit on the detail page', async () => {
    window.history.replaceState(null, '', '/tai-khoan/don-mua-ho/chi-tiet?id=92')
    portalApi.getCustomerOrder.mockResolvedValue({ order: { ...detailOrder, id: 92, order_code: 'REQ-MISSING', product_total_cny: null, product_total_vnd: 0, exchange_rate: null, customer_contact: null, submitted_by: null, items: [{ id: 3, product_name: 'Sản phẩm thiếu dữ liệu', quantity: 1, price_cny: null, reference_subtotal_cny: null, selected_attributes: {} }], item_count: 1, quantity: 1 } })
    render(<RealOrderDetailPage routes={routes} />)

    await screen.findByText('REQ-MISSING')
    expect(screen.getAllByText('Chưa xác định').length).toBeGreaterThan(1)
    expect(screen.getByText('Chưa có thông tin liên hệ trong dữ liệu đơn.')).toBeInTheDocument()
    expect(screen.queryByText('0 ₫')).not.toBeInTheDocument()
  })
})
