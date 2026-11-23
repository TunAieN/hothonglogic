// Browser regression harness. Run only against a local Vite server and an
// isolated Chrome CDP profile; every auth/submit request is intercepted below.
const port = Number(process.env.CDP_PORT || 9333)
const appUrl = process.env.CART_URL || 'http://127.0.0.1:5173/tai-khoan/gio-hang'

const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((response) => response.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
let sequence = 0

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data || {})}`))
  else resolve(message.result)
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime evaluation failed')
  return result.result.value
}

const waitFor = async (expression, label, timeout = 8000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

const mockSource = `(() => {
  const originalFetch = window.fetch.bind(window);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.__purchaseRequests = [];
  window.__submitMode = 'reject';
  window.__mockOrder = 900;
  window.fetch = async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/customer-auth/me')) return json({ account: { customer_id: 12, name: 'Browser Test', customer_code: 'TEST-12', email: 'test@example.invalid', phone: '' } });
    if (url.includes('/sanctum/csrf-cookie')) return json({});
    if (url.includes('/customer-portal/purchase-requests')) {
      const payload = JSON.parse(init.body || '{}');
      window.__purchaseRequests.push(payload);
      if (window.__submitMode === 'success') {
        const id = ++window.__mockOrder;
        return json({ order: { id, order_code: 'MOCK-' + id, status: 'pending' }, idempotent_replay: false }, 201);
      }
      return json({ message: 'Mock submit rejected: no production request was sent.' }, 503);
    }
    if (url.includes('/customer-portal/orders/')) return json({ order: { id: window.__mockOrder, order_code: 'MOCK-' + window.__mockOrder, status: 'pending', items: [], history: [], product_total_cny: 0, product_total_vnd: 0, package_count: 0, invoice_count: 0, created_at: new Date().toISOString() } });
    return originalFetch(input, init);
  };
})();`

const cartDocument = (prefix, count = 2) => ({
  version: 1,
  request_note: '',
  updated_at: new Date().toISOString(),
  items: Array.from({ length: count }, (_, index) => ({
    local_item_id: `${prefix}-${index + 1}`,
    product_url: `https://item.taobao.com/item.htm?id=${prefix}${index + 1}`,
    platform: 'Taobao',
    title: `${prefix} product ${index + 1}`,
    main_image: null,
    sku_id: `sku-${prefix}-${index + 1}`,
    selected_attributes: { Size: index ? 'L' : 'M' },
    variant_label: null,
    color: null,
    size: index ? 'L' : 'M',
    quantity: 1,
    reference_price_cny: 17,
    product_note: null,
    seller: null,
    shop_name: null,
    sku_required: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })),
})

const installCart = async (prefix, count = 2) => {
  const document = JSON.stringify(cartDocument(prefix, count))
  await evaluate(`localStorage.setItem('viettrung:customer-cart:v1:12', ${JSON.stringify(document)}); localStorage.removeItem('viettrung:customer-cart-submit:v1:12'); true`)
  await send('Page.reload', { ignoreCache: true })
  await new Promise((resolve) => setTimeout(resolve, 300))
  await waitFor(`Boolean([...document.querySelectorAll('button')].find((node) => node.textContent.includes('Gửi ${count} sản phẩm mua hộ')))`, `cart button with ${count} items`)
}

const hitTest = () => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent.includes('sản phẩm mua hộ'));
  document.documentElement.style.scrollBehavior = 'auto';
  button.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
  const rect = button.getBoundingClientRect();
  const iconRect = button.querySelector('svg').getBoundingClientRect();
  const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
  let textNode = null;
  while (walker.nextNode()) if (walker.currentNode.textContent.trim()) { textNode = walker.currentNode; break; }
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const textRect = range.getBoundingClientRect();
  const points = {
    left: [rect.left + 3, rect.top + rect.height / 2],
    center: [rect.left + rect.width / 2, rect.top + rect.height / 2],
    right: [rect.right - 3, rect.top + rect.height / 2],
    icon: [iconRect.left + iconRect.width / 2, iconRect.top + iconRect.height / 2],
    text: [textRect.left + textRect.width / 2, textRect.top + textRect.height / 2],
  };
  const describe = ([x, y]) => {
    const hit = document.elementFromPoint(x, y);
    return { x, y, tag: hit?.tagName || null, className: typeof hit?.className === 'string' ? hit.className : hit?.className?.baseVal || '', insideButton: Boolean(hit && button.contains(hit)), pointerEvents: hit ? getComputedStyle(hit).pointerEvents : null };
  };
  const before = getComputedStyle(button, '::before');
  const after = getComputedStyle(button, '::after');
  return {
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    disabled: button.disabled,
    buttonPointerEvents: getComputedStyle(button).pointerEvents,
    before: { content: before.content, pointerEvents: before.pointerEvents, position: before.position },
    after: { content: after.content, pointerEvents: after.pointerEvents, position: after.position },
    points,
    hits: Object.fromEntries(Object.entries(points).map(([name, point]) => [name, describe(point)])),
  };
})()`)

const mouseClick = async ([x, y]) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
}

const assertOneSubmit = async (action, label) => {
  await evaluate(`window.__purchaseRequests.length = 0; window.__submitMode = 'reject'; true`)
  await action()
  await waitFor('window.__purchaseRequests.length === 1', `${label} submit call`)
  await waitFor(`Boolean([...document.querySelectorAll('button')].find((node) => node.textContent.includes('sản phẩm mua hộ') && !node.disabled))`, `${label} button release`)
  const calls = await evaluate('window.__purchaseRequests.length')
  if (calls !== 1) throw new Error(`${label} produced ${calls} submit calls`)
}

const runViewport = async (name, width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 })
  await send('Page.navigate', { url: appUrl })
  await waitFor("location.pathname === '/tai-khoan/gio-hang'", `${name} cart navigation`)
  await installCart(`${name}-A`, 2)
  const initial = await hitTest()
  console.log(JSON.stringify({ phase: 'initial-hit-test', viewport: name, result: initial }))
  for (const pointName of Object.keys(initial.points)) {
    await installCart(`${name}-${pointName}`, 2)
    const current = await hitTest()
    console.log(JSON.stringify({ phase: 'point-hit-test', viewport: name, point: pointName, hit: current.hits[pointName], rect: current.rect }))
    await assertOneSubmit(() => mouseClick(current.points[pointName]), `${name}:${pointName}`)
  }

  const buttonExpression = `([...document.querySelectorAll('button')].find((node) => node.textContent.includes('sản phẩm mua hộ')))`
  await installCart(`${name}-keyboard-enter`, 2)
  await assertOneSubmit(async () => {
    await evaluate(`${buttonExpression}.focus(); true`)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  }, `${name}:keyboard-enter`)
  await installCart(`${name}-keyboard-space`, 2)
  await assertOneSubmit(async () => {
    await evaluate(`${buttonExpression}.focus(); true`)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', unmodifiedText: ' ', windowsVirtualKeyCode: 32 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  }, `${name}:keyboard-space`)
  return initial
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: mockSource })
  const desktop = await runViewport('desktop', 1440, 1000)
  const mobile = await runViewport('mobile', 390, 844)

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: appUrl })
  await waitFor("location.pathname === '/tai-khoan/gio-hang'", 'success lifecycle cart')
  await installCart('success-A', 1)
  await evaluate(`window.__submitMode = 'success'; window.__purchaseRequests.length = 0; true`)
  const successA = await hitTest()
  await mouseClick(successA.points.center)
  await waitFor("location.pathname.includes('/tai-khoan/don-mua-ho/chi-tiet')", 'first mocked success navigation')
  await send('Page.navigate', { url: appUrl })
  await waitFor("location.pathname === '/tai-khoan/gio-hang'", 'return to cart')
  await installCart('success-B', 1)
  await evaluate(`window.__submitMode = 'reject'; window.__purchaseRequests.length = 0; true`)
  const successB = await hitTest()
  await mouseClick(successB.points.center)
  await waitFor('window.__purchaseRequests.length === 1', 'submit after mocked success')

  console.log(JSON.stringify({ desktop, mobile, sequentialSubmitAfterSuccess: true }, null, 2))
} finally {
  await send('Target.closeTarget', { targetId: target.id }).catch(() => {})
  socket.close()
}
