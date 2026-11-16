import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RealCreateOrderPage, RealOrdersPage } from './RealPurchasePages.jsx'
import * as portalApi from '../../api/customerPortal.js'
import * as metadataApi from '../../services/productMetadata.js'

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

const routes = {
  createOrder: '/tai-khoan/tao-don',
  orderDetail: '/tai-khoan/don-mua-ho/chi-tiet',
  orders: '/tai-khoan/don-mua-ho',
}

describe('real customer purchase pages', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/tai-khoan/tao-don')
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
