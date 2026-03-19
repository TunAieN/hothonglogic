# Chrome Extension Testing Guide - Taobao Product

## Test URL
```
https://item.taobao.com/item.htm?id=988769064897
```

## Manual Testing Steps

### 1. Install the Extension

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top right)
4. Click **"Load unpacked"**
5. Select folder: `c:\laragon\www\extention`
6. The extension icon should appear in your toolbar

### 2. Test Product Extraction

1. **Open the Test URL** in Chrome:
   ```
   https://item.taobao.com/item.htm?id=988769064897
   ```

2. **Wait for page to fully load** (3-5 seconds)

3. **Click the extension icon** in Chrome toolbar

4. **Verify Product Data Extraction:**
   
   The extension should automatically extract and display:
   - ✅ Product title
   - ✅ Price (in CNY ¥)
   - ✅ Product image
   - ✅ Shop/Seller name
   - ✅ Product URL

### 3. Test Cart Functionality

1. **Adjust quantity** (default is 1)
2. **Add notes** if needed (optional)
3. **Click "➕ Thêm vào giỏ"** (Add to Cart)
4. **Verify success message** appears
5. **Check cart badge** - number should update

### 4. Test Cart Management

1. **Switch to "Giỏ hàng" tab**
2. **Verify product appears** with:
   - Product image
   - Product title
   - Price × quantity
   - Notes (if added)
3. **Test remove item** - click ✖ button
4. **Test clear cart** - click "🗑️ Xóa giỏ hàng"

### 5. Test Settings

1. **Switch to "Cài đặt" tab**
2. **Verify API endpoint**: `http://localhost:8000/api`
3. **Test auto-extract toggle**
4. **Save settings** and verify success message

## Expected Results

### ✅ Success Indicators

- Product information appears in "Sản phẩm" tab
- All fields populated correctly
- Cart count updates when adding items
- Items persist in cart across page reloads
- Settings save correctly

### ❌ Potential Issues

If extraction fails, you may see:
- "⚠️ Không phát hiện sản phẩm trên trang này"
- Empty product fields
- "N/A" values

**Common Causes:**
- Page still loading (wait longer and click refresh)
- Taobao updated their HTML structure (selectors need updating)
- JavaScript blocked or disabled

## Troubleshooting

### Issue: No Product Data Extracted

**Solution:** 
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for the message: "Tmall Product Scraper - Content script loaded"
4. If not present, the content script didn't inject properly
5. Reload the extension and try again

### Issue: Extension Icon Not Showing

**Solution:**
1. Check if extension is enabled in `chrome://extensions/`
2. Look for errors in the extension details
3. Click "Reload" button on the extension card

### Issue: Create Order Fails

**Expected:** This is normal - the backend API is not yet running. You'll see an error when clicking "📦 Tạo đơn hàng" because the Laravel backend needs to be configured and started.

## Next Steps After Testing

Once you verify the extension works:

1. **Import Database Schema**
   ```sql
   -- In HeidiSQL or MySQL command line
   SOURCE c:/laragon/www/extention/database_schema.sql;
   ```

2. **Fix Laravel Backend**
   - Use Laragon's Quick App feature to create Laravel project
   - Or resolve Composer dependency issues
   - Configure `.env` file
   - Run `php artisan serve`

3. **Test Full Integration**
   - With backend running, test actual order creation
   - Customer dropdown should populate from database
   - Orders should save to database

## Developer Console Commands

Open DevTools Console (F12 → Console) and test:

```javascript
// Check if content script is loaded
console.log("Content script status");

// Manually trigger extraction
chrome.runtime.sendMessage({action: 'extractProduct'}, response => {
  console.log('Product data:', response);
});

// Check stored cart
chrome.storage.local.get(['cart'], result => {
  console.log('Current cart:', result.cart);
});
```

## Screenshot Checklist

When testing, verify these visual elements:

- [ ] Extension popup opens with purple gradient header
- [ ] Product image displays correctly
- [ ] Price shows with ¥ symbol
- [ ] All three tabs are visible and clickable
- [ ] Cart badge shows count (when items in cart)
- [ ] Status messages appear and auto-dismiss
- [ ] Form inputs are styled correctly

---

**Testing Date:** 2026-02-02  
**Extension Version:** 1.0.0  
**Test Status:** Manual testing required due to browser automation limitations
