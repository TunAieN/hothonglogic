import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressSelectionModal } from './CustomerAddressBook.jsx'
import * as api from '../../api/customerPortal.js'

vi.mock('../../api/customerPortal.js', async () => {
  const actual = await vi.importActual('../../api/customerPortal.js')
  return { ...actual, getCustomerAddresses: vi.fn(), getAddressProvinces: vi.fn() }
})

describe('AddressSelectionModal', () => {
  beforeEach(() => { vi.clearAllMocks(); api.getAddressProvinces.mockResolvedValue({ provinces: [] }) })

  it('shows the inline address form without submitting an order when the book is empty', async () => {
    api.getCustomerAddresses.mockResolvedValue({ addresses: [] })
    const user = userEvent.setup(); const confirm = vi.fn()
    render(<AddressSelectionModal open onClose={vi.fn()} onConfirm={confirm} busy={false} />)
    expect(await screen.findByText('Bạn chưa có địa chỉ nhận hàng')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Thêm địa chỉ nhận hàng' }))
    expect(screen.getByText('Họ tên người nhận *')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('preselects the default but allows another owned address for this order', async () => {
    api.getCustomerAddresses.mockResolvedValue({ addresses: [
      { id: 1, label: 'Nhà riêng', receiver_name: 'A', receiver_phone: '0900000001', full_address: 'Địa chỉ A', is_default: true },
      { id: 2, label: 'Văn phòng', receiver_name: 'B', receiver_phone: '0900000002', full_address: 'Địa chỉ B', is_default: false },
    ] })
    const user = userEvent.setup(); const confirm = vi.fn()
    render(<AddressSelectionModal open onClose={vi.fn()} onConfirm={confirm} busy={false} />)
    expect(await screen.findByRole('button', { name: 'Chọn địa chỉ Nhà riêng' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Chọn địa chỉ Văn phòng' }))
    await user.click(screen.getByRole('button', { name: /Xác nhận địa chỉ và gửi yêu cầu/ }))
    expect(confirm).toHaveBeenCalledWith(2)
  })

  it('closes without confirming or mutating the selected address', async () => {
    api.getCustomerAddresses.mockResolvedValue({ addresses: [{ id: 1, label: 'Nhà riêng', receiver_name: 'A', receiver_phone: '0900000001', full_address: 'Địa chỉ A', is_default: true }] })
    const user = userEvent.setup(); const close = vi.fn(); const confirm = vi.fn()
    render(<AddressSelectionModal open onClose={close} onConfirm={confirm} busy={false} />)
    await screen.findByText('Địa chỉ A')
    await user.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(close).toHaveBeenCalledOnce(); expect(confirm).not.toHaveBeenCalled()
  })
})
