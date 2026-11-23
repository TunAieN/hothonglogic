// Isolated visual harness: every customer API request is intercepted before the page loads.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const port = Number(process.env.CDP_PORT || 9334)
const appUrl = 'http://127.0.0.1:5173/tai-khoan/don-mua-ho/chi-tiet?id=91'
const outputDirectory = resolve('artifacts')
const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
let sequence = 0

await new Promise((resolveOpen, reject) => {
  socket.addEventListener('open', resolveOpen, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const handlers = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) handlers.reject(new Error(message.error.message))
  else handlers.resolve(message.result)
})
const send = (method, params = {}) => new Promise((resolveSend, reject) => {
  const id = ++sequence
  pending.set(id, { resolve: resolveSend, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result.value
}
const waitFor = async (expression, label) => {
  const started = Date.now()
  while (Date.now() - started < 10000) {
    if (await evaluate(expression)) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 80))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

const mockOrder = {
  id: 91, order_code: 'REQ-6CFAE6E28AC2E7737BA0', status: 'pending', creation_source: 'customer_portal',
  created_at: '2026-11-19T01:11:00Z', updated_at: '2026-11-19T01:11:00Z', submitted_at: '2026-11-19T01:11:00Z',
  item_count: 2, quantity: 2, product_total_cny: '18.10', product_total_vnd: 651600, exchange_rate: '36000.0000', note: null,
  account_manager: null, payment: null, customer_contact: { name: 'Nguyễn Hải Yến', phone: '0987 654 321', email: 'haiyen@example.com' }, submitted_by: { email: 'haiyen@example.com' },
  items: [
    { id: 1, product_name: '湿纸巾婴儿手口专用加大加厚湿巾 宝宝儿童擦脸屁屁80抽大包装家用', product_link: 'https://item.taobao.com/item.htm?id=1', product_image: null, price_cny: '5.20', reference_subtotal_cny: '5.20', quantity: 1, selected_attributes: {}, note: null },
    { id: 2, product_name: '【2只装】婴儿墨镜配饰链娃娃动漫萌款', product_link: 'https://detail.tmall.com/item.htm?id=2', product_image: null, price_cny: '12.90', reference_subtotal_cny: '12.90', quantity: 1, variant_label: 'Màu đen', selected_attributes: { Màu: 'Đen' }, source_sku_id: 'sku-black', note: 'Kiểm tra trước khi mua' },
  ],
  history: [{ type: 'created', status: 'pending', occurred_at: '2026-11-19T01:11:00Z' }], package_count: 0, invoice_count: 0, tracking_count: 0,
}
const mockSource = `(() => {
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const order = ${JSON.stringify(mockOrder)};
  window.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/customer-auth/me')) return json({ account: { customer_id: 12, name: 'Nguyễn Hải Yến', customer_code: 'KH-001', email: 'haiyen@example.com', phone: '0987654321' } });
    if (url.includes('/customer-portal/orders/91')) return json({ order });
    throw new Error('Blocked non-mocked request: ' + url);
  };
})();`

try {
  await mkdir(outputDirectory, { recursive: true })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: mockSource })
  for (const viewport of [{ name: 'desktop', width: 1672, height: 941 }, { name: 'mobile', width: 390, height: 844 }]) {
    await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 500 })
    await send('Page.navigate', { url: appUrl })
    await waitFor(`document.body.innerText.includes('Chi tiết đơn mua hộ') && document.body.innerText.includes('REQ-6CFAE6E28AC2E7737BA0')`, `${viewport.name} order detail`)
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const output = resolve(outputDirectory, `order-detail-${viewport.name}.png`)
    await writeFile(output, Buffer.from(screenshot.data, 'base64'))
    const metrics = await evaluate(`({ scrollWidth: document.documentElement.scrollWidth, innerWidth, scrollHeight: document.documentElement.scrollHeight, heading: document.querySelector('h1')?.textContent })`)
    console.log(JSON.stringify({ viewport, output, metrics }))
  }
} finally {
  await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
  socket.close()
}
