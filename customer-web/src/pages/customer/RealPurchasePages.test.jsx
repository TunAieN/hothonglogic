import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RealCreateOrderPage, RealOrdersPage } from './RealPurchasePages.jsx'
import * as portalApi from '../../api/customerPortal.js'
import * as metadataApi from '../../services/productMetadata.js'
import * as extensionApi from '../../services/customerExtension.js'

vi.mock('../../api/customerPortal.js', async () => {
  const actual = await vi.importActual('../../api/customerPortal.js')
  return {
    ...actual,
    getCustomerOrders: vi.fn(),
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
  return { ...actual, extractProductWithExtension: vi.fn() }
})

const routes = {
  createOrder: '/tai-khoan/tao-don',
  orderDetail: '/tai-khoan/don-mua-ho/chi-tiet',
  orders: '/tai-khoan/don-mua-ho',
}

describe('real customer purchase pages', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/tai-khoan/tao-don')
    extensionApi.extractProductWithExtension.mockResolvedValue({ status: 'extension_unavailable' })
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
    render(<RealCreateOrderPage routes={routes} />)
    await user.type(screen.getByLabelText('Link sản phẩm'), 'https://detail.tmall.com/item.htm?id=456')
    await user.click(screen.getByRole('button', { name: 'Lấy thông tin sản phẩm' }))
    await screen.findByRole('group', { name: '颜色分类' })
    await user.click(screen.getByRole('button', { name: '红色' }))
    await user.click(screen.getByRole('button', { name: 'S' }))
    expect(screen.getByLabelText('Giá tham khảo (CNY)')).toHaveValue(12.5)
    expect(screen.getByLabelText('Phân loại')).toHaveValue('颜色分类: 红色 / 尺码: S')
  })

  it('ignores a late extension response from the previous pasted URL', async () => {
    const deferred = []
    extensionApi.extractProductWithExtension.mockImplementation(() => new Promise((resolve) => deferred.push(resolve)))
    render(<RealCreateOrderPage routes={routes} />)
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

  it('keeps manually entered product data when metadata lookup fails', async () => {
    metadataApi.getProductMetadata.mockResolvedValue({ status: 'error', message: 'Nguồn hàng không phản hồi.' })
    const user = userEvent.setup()
    render(<RealCreateOrderPage routes={routes} />)

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
})
