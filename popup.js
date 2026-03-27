// Popup script for managing UI and interactions
let currentProduct = null;
let cart = [];
let settings = {};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadCart();
    await loadCustomers();
    setupTabs();
    setupEventListeners();
    loadCurrentProduct();
    updateCartBadge();
});

// Load customers from API or use demo data
// async function loadCustomers() {
//     const customerSelect = document.getElementById('customerSelect');

//     // API endpoints to try (in order)
//     const apiEndpoints = [
//         `${settings.apiEndpoint}/customers`,           // Laravel API
//         'http://extention.test/api/customers.php',     // Laragon virtual host
//         'http://localhost/extention/api/customers.php' // Direct localhost
//     ];

//     for (const endpoint of apiEndpoints) {
//         try {
//             console.log('Trying API endpoint:', endpoint);
//             const response = await fetch(endpoint);

//             if (response.ok) {
//                 const result = await response.json();
//                 const customers = result.data || result;

//                 if (Array.isArray(customers) && customers.length > 0) {
//                     customerSelect.innerHTML = '<option value="">-- Chọn khách hàng --</option>';
//                     customers.forEach(customer => {
//                         const option = document.createElement('option');
//                         option.value = customer.id;
//                         option.textContent = `${customer.code} - ${customer.name} (${customer.phone})`;
//                         customerSelect.appendChild(option);
//                     });
//                     console.log('Loaded customers from API:', customers.length);
//                     return; // Success, stop trying
//                 }
//             }
//         } catch (error) {
//             console.log('API endpoint failed:', endpoint, error.message);
//         }
//     }

//     // Use demo data if all APIs failed
//     console.log('All APIs failed, loading demo customers');
//     loadDemoCustomers();
// }

async function loadCustomers() {
    const customerSelect = document.getElementById('customerSelect');

    const endpoint = settings.apiEndpoint; // ví dụ: http://localhost:8000/graphql

    const query = `
        query {
            customers {
                id
                code
                name
                phone
            }
        }
    `;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query
            })
        });

        const result = await response.json();
        console.log('GraphQL response:', result);
        console.log('GraphQL data:', result.data);
        console.log('GraphQL customer:', result.data.customers);
        if (result.data && result.data.customers) {
            const customers = result.data.customers;

            customerSelect.innerHTML = '<option value="">-- Chọn khách hàng --</option>';

            customers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer.id;
                option.textContent = `${customer.code} - ${customer.name} (${customer.phone})`;
                customerSelect.appendChild(option);
            });

            console.log('Loaded customers:', customers.length);
        } else {
            throw new Error('No data');
        }

    } catch (error) {
        console.error('GraphQL error:', error);
        loadDemoCustomers(); // fallback
    }
}
// login
const menu = document.getElementById("dropdownMenu");

document.getElementById("authBtn").addEventListener("click", () => {
    chrome.storage.local.get("token", (res) => {
        if (res.token) {
            // toggle menu
            menu.style.display = menu.style.display === "block" ? "none" : "block";
        } else {
            chrome.runtime.sendMessage({ action: "openLogin" });
        }
    });
});
function updateAuthUI() {
    chrome.storage.local.get(["token", "user"], (res) => {
        const btn = document.getElementById("authBtn");

        if (!btn) return;

        if (res.token) {
            btn.textContent = "👤 " + res.user.name;
        } else {
            btn.textContent = "🔐 Đăng nhập";
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    updateAuthUI();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.token) {
        updateAuthUI();
    }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất?")) {
        chrome.storage.local.remove(["token", "user"], () => {
            updateAuthUI();
            menu.style.display = "none";
        });
    }
});

// Load demo customers when API is not available
function loadDemoCustomers() {
    const customerSelect = document.getElementById('customerSelect');

    const demoCustomers = [
        { id: 1, code: 'KH001', name: 'Nguyễn Văn A', phone: '0901234567' },
        { id: 2, code: 'KH002', name: 'Trần Thị B', phone: '0912345678' },
        { id: 3, code: 'KH003', name: 'Lê Văn C', phone: '0923456789' },
        { id: 4, code: 'KH004', name: 'Phạm Thị D', phone: '0934567890' },
        { id: 5, code: 'KH005', name: 'Hoàng Văn E', phone: '0945678901' }
    ];

    customerSelect.innerHTML = '<option value="">-- Chọn khách hàng --</option>';
    demoCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.id;
        option.textContent = `${customer.code} - ${customer.name} (${customer.phone})`;
        customerSelect.appendChild(option);
    });

    console.log('Loaded demo customers:', demoCustomers.length);
}

// Load settings from storage
async function loadSettings() {
    const result = await chrome.storage.local.get(['apiEndpoint', 'autoExtract']);
    settings = {
        apiEndpoint: result.apiEndpoint || 'http://localhost:8000/api',
        autoExtract: result.autoExtract !== false
    };

    document.getElementById('apiEndpoint').value = settings.apiEndpoint;
    document.getElementById('autoExtract').checked = settings.autoExtract;
}

// Load cart from storage
async function loadCart() {
    const result = await chrome.storage.local.get(['cart']);
    cart = result.cart || [];
    renderCart();
    updateCartBadge();
}

// Setup tab switching
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Show corresponding content
            const tabName = tab.dataset.tab;
            const content = document.getElementById(`${tabName}Tab`);
            if (content) {
                content.classList.add('active');
            }
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('addToCartBtn')?.addEventListener('click', addToCart);
    document.getElementById('refreshBtn')?.addEventListener('click', loadCurrentProduct);
    document.getElementById('createOrderBtn')?.addEventListener('click', createOrder);
    document.getElementById('clearCartBtn')?.addEventListener('click', clearCart);
    document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);

    // Thêm event listener cho checkbox chọn tất cả
    document.getElementById('selectAllProducts')?.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        cart.forEach(item => item.selected = isChecked);
        await chrome.storage.local.set({ cart });
        renderCart();
    });
}

// Load current product from page
async function loadCurrentProduct() {
    showLoading(true);

    try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Check if it's a Tmall/Taobao page
        if (!tab.url.includes('tmall.com') && !tab.url.includes('taobao.com')) {
            showNoProduct();
            return;
        }

        // Helper function to send message
        const sendMessage = async () => {
            return await chrome.tabs.sendMessage(tab.id, { action: 'extractProduct' });
        };

        let response;
        try {
            response = await sendMessage();
        } catch (error) {
            // If connection fails, try injecting the content script dynamically
            if (error.message.includes('Receiving end does not exist')) {
                console.log('Content script not active, injecting dynamically...');
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Retry after injection
                response = await sendMessage();
            } else {
                throw error;
            }
        }

        if (response && response.success && response.data.title) {
            currentProduct = response.data;
            displayProduct(currentProduct);
        } else {
            showNoProduct();
        }
    } catch (error) {
        console.error('Error loading product:', error);
        showNoProduct();
    } finally {
        showLoading(false);
    }
}
async function translateChineseToVietnamese(text) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q=${encodeURIComponent(text)}`;

        const response = await fetch(url);
        const data = await response.json();

        let translatedText = '';
        data[0].forEach(item => {
            translatedText += item[0];
        });

        return translatedText;
    } catch (error) {
        console.error("Lỗi dịch:", error);
        return text; // nếu lỗi thì trả lại text gốc
    }
}

async function renderProductTitle(x, id) {

    const title = x;
    if (/[\u4e00-\u9fa5]/.test(title)) {
        const translated = await translateChineseToVietnamese(title);
        document.getElementById(id).textContent = translated || title;
    }
    else {
        document.getElementById(id).textContent = title;
    }
}

// Display product information
async function displayProduct(product) {


    document.getElementById('loading').style.display = 'none';
    document.getElementById('noProduct').style.display = 'none';
    document.getElementById('productDetails').style.display = 'block';
    // await renderProductTitle(product.title, 'productTitle');
    document.getElementById('productTitle').textContent = product.title || 'N/A';
    document.getElementById('productPrice').textContent = product.price || '0';
    document.getElementById('quantity').value = product.quantity || '1';

    document.getElementById('productSeller').textContent = product.seller || 'N/A';
    // await renderProductTitle(product.seller, 'productSeller');
    // document.getElementById('productSizeValue').textContent = product.size || 'N/A';
    await renderProductTitle(product.size, 'productSizeValue');
    document.getElementById('productColorValue').textContent = product.color || 'N/A';
    await renderProductTitle(product.color, 'productColorValue');
    document.getElementById('productLink').value = product.url || '';
    const productImage = document.getElementById('productImage');

    if (product.img) {
        productImage.src = product.img;
        productImage.style.display = 'block';
    } else {
        productImage.style.display = 'none';
    }

    // Handle Original Price Display
    const originalPriceInfo = document.getElementById('original-price-info');
    const productOriginalPrice = document.getElementById('productOriginalPrice');

    if (product.originalPrice && product.originalPrice !== product.price) {
        productOriginalPrice.textContent = product.originalPrice;
        originalPriceInfo.style.display = 'block'; // Or 'flex' depending on your CSS, 'block' is safe for div
    } else {
        originalPriceInfo.style.display = 'none';
        productOriginalPrice.textContent = '';
    }
    //handle size display
    const sizeInfo = document.getElementById('productSize');
    if (product.size && product.size !== 'N/A') {
        sizeInfo.style.display = 'block';
    } else {
        sizeInfo.style.display = 'none';
    }

    //handle color display 
    const colorInfo = document.getElementById('productColor');
    if (product.color && product.color !== 'N/A') {
        colorInfo.style.display = 'block';
    } else {
        colorInfo.style.display = 'none';
    }

}




// Show/hide loading state
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.getElementById('productDetails').style.display = show ? 'none' : 'block';
}

// Show no product message
function showNoProduct() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('productDetails').style.display = 'none';
    document.getElementById('noProduct').style.display = 'block';
}

// Add product to cart
async function addToCart() {
    if (!currentProduct || !currentProduct.title) {
        showStatus('⚠️ Không có sản phẩm để thêm vào giỏ', 'error');
        return;
    }

    const quantity = parseInt(document.getElementById('quantity').value) || 1;
    const note = document.getElementById('note').value.trim();

    const cartItem = {
        ...currentProduct,
        quantity,
        note,
        id: Date.now(),
        addedAt: new Date().toISOString()
    };

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'addToCart',
            data: cartItem
        });

        if (response.success) {
            showStatus('✅ Đã thêm vào giỏ hàng', 'success');
            await loadCart();

            // Reset form
            document.getElementById('quantity').value = 1;
            document.getElementById('note').value = '';
        }
    } catch (error) {
        showStatus('❌ Lỗi khi thêm vào giỏ', 'error');
        console.error(error);
    }
}

// Render cart items
function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartSummary = document.getElementById('cartSummary');
    const emptyCart = document.getElementById('emptyCart');

    if (cart.length === 0) {
        cartItems.innerHTML = '';
        cartSummary.style.display = 'none';
        emptyCart.style.display = 'block';
        return;
    }

    emptyCart.style.display = 'none';
    cartSummary.style.display = 'block';

    let totalAmount = 0;
    let totalItems = 0;

    cartItems.innerHTML = cart.map((item, index) => {
        const isSelected = item.selected !== false; // Mặc định là true nếu chưa set
        if (isSelected) {
            const itemTotal = (parseFloat(item.price) || 0) * (item.quantity || 1);
            totalAmount += itemTotal;
            totalItems += item.quantity || 1;
        }

        //     return `
        //   <div class="cart-item">
        //     <div class="cart-item-image">
        //       ${item.img ? `<img src="${item.img}" alt="${item.title}">` : '📦'}
        //     </div>


        //     <div class="cart-item-info">
        //       <div class="cart-item-title">${item.title || 'N/A'}</div>
        //       <div class="cart-item-price">¥${item.price || '0'} × ${item.quantity}</div>
        //       ${item.note ? `<div class="cart-item-note">📝 ${item.note}</div>` : ''}
        //     </div>
        //     <button class="btn-remove" data-index="${index}">✖</button>
        //   </div>
        // `;
        // }).join('');
        return `
<div class="cart-item">

  <div class="cart-item-checkbox" style="display: flex; align-items: center; justify-content: center; align-self: center;">
    <input type="checkbox" class="item-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
  </div>
  
  <div class="cart-item-image-wrapper" style="display: flex; flex-direction: column; gap: 8px;">
    <div class="cart-item-image" style="margin-right: 0;">
      ${item.img ? `<img src="${item.img}" alt="${item.title}">` : '📦'} 
    </div>
    <div style="display: flex; gap: 4px;">
      <button class="btn btn-secondary btn-upload" data-index="${index}" style="flex: 1; padding: 4px; font-size: 11px; margin-bottom: 0;">Upload</button>
      <button class="btn btn-secondary btn-link" data-index="${index}" style="flex: 1; padding: 4px; font-size: 11px; margin-bottom: 0;" data-url="${item.url || ''}">Link</button>
    </div>
  </div>

  <div class="cart-item-form">

      <div class="form-row">
          <div class="form-field">
              <label>Kích cỡ*</label>
              <input type="text" class="item-field" data-field="size" data-index="${index}" value="${item.size || 'N/A'}">
          </div>
          <div class="form-field">
              <label>Màu*</label>
              <input type="text" class="item-field" data-field="color" data-index="${index}" value="${item.color || 'N/A'}">
          </div>
          <div class="form-field">
              <label>Đơn vị*</label>
              <input type="text" class="item-field" data-field="seller" data-index="${index}" value="${item.seller || ''}">
          </div>
          <div class="form-field small">
              <label>Số lượng*</label>
              <input type="number" class="item-field" data-field="quantity" data-index="${index}" value="${item.quantity}" min="1">
          </div>
          <div class="form-field small">
              <label>Giá web*</label>
              <input type="text" class="item-field" data-field="price" data-index="${index}" value="${item.price}">
          </div>
      </div>

      <div class="form-row">
          <div class="form-field full">
              <label>Tên sản phẩm*</label>
              <input type="text" class="item-field" data-field="title" data-index="${index}" value="${item.title}">
          </div>
      </div>
      <div class="form-row">
          <div class="form-field full">
              <label>Link sản phẩm*</label>
              <input type="text" class="item-field" data-field="url" data-index="${index}" value="${item.url || ''}">
          </div>
      </div>
      <div class="form-row">
          <div class="form-field full">
              <label>Ghi chú*</label>
              <textarea class="item-field" data-field="note" data-index="${index}">${item.note || ''}</textarea>
          </div>
      </div>

  </div>

  <button class="btn-remove" data-index="${index}">✖</button>

</div>
`;
    }).join('');
    // Update summary
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalAmount').textContent = totalAmount.toFixed(2);

    // Cập nhật trạng thái "Chọn tất cả"
    const selectAllCheckbox = document.getElementById('selectAllProducts');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = cart.length > 0 && cart.every(item => item.selected !== false);
    }

    // Lắng nghe sự kiện click trên từng checkbox
    document.querySelectorAll('.item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const idx = parseInt(e.target.dataset.index);
            cart[idx].selected = e.target.checked;
            await chrome.storage.local.set({ cart });
            renderCart();
        });
    });

    // Lắng nghe thay đổi dữ liệu trên các ô input của cart-item (số lượng, màu, giá...)
    document.querySelectorAll('.item-field').forEach(field => {
        field.addEventListener('change', async (e) => {
            const idx = parseInt(e.target.dataset.index);
            const fieldName = e.target.dataset.field;
            let value = e.target.value;

            if (fieldName === 'quantity') {
                value = parseInt(value) || 1;
                if (value < 1) value = 1;
            }

            cart[idx][fieldName] = value;
            cart[idx].selected = true;
            await chrome.storage.local.set({ cart });
            renderCart(); // Cập nhật lại UI số tiền
        });
    });

    // Nút Upload & Link
    document.querySelectorAll('.btn-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const url = e.currentTarget.dataset.url;
            if (url) window.open(url, '_blank');
        });
    });

    document.querySelectorAll('.btn-upload').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // TODO: Chức năng Upload
            alert('Chức năng Upload đang được xây dựng!');
        });
    });

    // Add remove listeners
    document.querySAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.index)));
    });
}

// Remove item from cart
async function removeFromCart(index) {
    try {
        await chrome.runtime.sendMessage({
            action: 'removeFromCart',
            index
        });
        await loadCart();
        showStatus('✅ Đã xóa khỏi giỏ hàng', 'success');
    } catch (error) {
        showStatus('❌ Lỗi khi xóa', 'error');
    }
}

// Clear entire cart
async function clearCart() {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ giỏ hàng?')) {
        return;
    }

    try {
        await chrome.runtime.sendMessage({ action: 'clearCart' });
        await loadCart();
        showStatus('✅ Đã xóa giỏ hàng', 'success');
    } catch (error) {
        showStatus('❌ Lỗi khi xóa giỏ hàng', 'error');
    }
}

// Create order from cart
async function createOrder() {
    const token = await chrome.storage.local.get("token");
    console.log(token);
    if (!token.token) {
        chrome.windows.create({
            url: chrome.runtime.getURL("login.html"),
            type: "popup",
            width: 400,
            height: 600
        });

        return;
    }

    // Lọc ra các sản phẩm đã chọn
    const selectedItems = cart.filter(item => item.selected !== false);

    if (cart.length === 0) {
        showStatus('⚠️ Giỏ hàng trống', 'error');
        return;
    }

    if (selectedItems.length === 0) {
        showStatus('⚠️ Vui lòng chọn ít nhất 1 sản phẩm để đặt hàng', 'error');
        return;
    }

    const customerSelect = document.getElementById('customerSelect');
    const customerId = customerSelect.value;

    if (!customerId) {
        showStatus('⚠️ Vui lòng chọn khách hàng', 'error');
        return;
    }

    const orderData = {
        customer_id: customerId,
        items: selectedItems.map(item => ({
            product_name: item.title,
            product_link: item.url,
            price_cny: parseFloat(item.price) || 0,
            quantity: item.quantity || 1,
            note: item.note || '',
            product_image: item.img || '' // Lấy từ img thay vì image nếu image undef
        }))
    };

    try {
        showStatus('⏳ Đang tạo đơn hàng...', 'info');

        const response = await chrome.runtime.sendMessage({
            action: 'submitOrder',
            data: orderData
        });

        if (response.success) {
            showStatus('✅ Đã tạo đơn hàng thành công!', 'success');

            // Xóa dần các item đã order khỏi giỏ (xóa từ cuối để không bị lệch index)
            for (let i = cart.length - 1; i >= 0; i--) {
                if (cart[i].selected !== false) {
                    await chrome.runtime.sendMessage({ action: 'removeFromCart', index: i });
                }
            }

            await loadCart();
        } else {
            showStatus(`❌ Lỗi: ${response.error}`, 'error');
        }
    } catch (error) {
        showStatus('❌ Không thể kết nối với server', 'error');
        console.error(error);
    }
}

// Save settings
async function saveSettings() {
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
    const autoExtract = document.getElementById('autoExtract').checked;

    try {
        await chrome.storage.local.set({
            apiEndpoint,
            autoExtract
        });

        settings = { apiEndpoint, autoExtract };
        showStatus('✅ Đã lưu cài đặt', 'success');
    } catch (error) {
        showStatus('❌ Lỗi khi lưu cài đặt', 'error');
    }
}

// Update cart badge
function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    badge.textContent = cart.length;
    badge.style.display = cart.length > 0 ? 'block' : 'none';
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';

    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

// Fix typo in querySelector
document.querySAll = document.querySelectorAll;
