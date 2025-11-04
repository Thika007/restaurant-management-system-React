// =========================
// internal-transfer.js - Internal Transfer functionality
// =========================

let currentTransferItemType = 'Normal Item';
let transferData = [];

// Initialize the transfer page
function initTransferPage() {
    loadBranchesForTransfer();
    loadCategoriesForTransfer();
    toggleTransferItemType('Normal Item');
}

// Load branches for transfer dropdowns
function loadBranchesForTransfer() {
    const allBranches = JSON.parse(localStorage.getItem('branches')) || [];
    const role = localStorage.getItem('role');
    const assigned = JSON.parse(localStorage.getItem('currentBranches') || '[]');
    const branches = (role === 'admin' || assigned.length === 0) ? allBranches : allBranches.filter(b => assigned.includes(b.name));
    
    const senderSelect = document.getElementById('senderBranch');
    const receiverSelect = document.getElementById('receiverBranch');
    
    if (senderSelect) {
        let options = '<option value="">Select Sender Branch</option>';
        branches.forEach(branch => options += `<option value="${branch.name}">${branch.name}</option>`);
        senderSelect.innerHTML = options;
    }
    
    if (receiverSelect) {
        let options = '<option value="">Select Receiver Branch</option>';
        branches.forEach(branch => options += `<option value="${branch.name}">${branch.name}</option>`);
        receiverSelect.innerHTML = options;
    }
}

// Load categories for transfer filter
function loadCategoriesForTransfer() {
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const categories = [...new Set(items.map(item => item.category).filter(cat => cat))];
    
    const categorySelect = document.getElementById('transferCategory');
    if (categorySelect) {
        let options = '<option value="">All Categories</option>';
        categories.forEach(category => options += `<option value="${category}">${category}</option>`);
        categorySelect.innerHTML = options;
    }
}

// Toggle transfer item type
function toggleTransferItemType(itemType) {
    currentTransferItemType = itemType;
    
    // Update navbar active state
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.textContent.includes(itemType === 'Normal Item' ? 'Normal Items' : 'Grocery Items')) {
            link.classList.add('active');
        }
    });
    
    // Load items for the selected type
    loadTransferItems();
}

// Load transfer items based on filters
function loadTransferItems() {
    const senderBranch = document.getElementById('senderBranch')?.value;
    const receiverBranch = document.getElementById('receiverBranch')?.value;
    
    if (!senderBranch || !receiverBranch) {
        showTransferMessage('Please select both sender and receiver branches.');
        return;
    }
    
    if (senderBranch === receiverBranch) {
        showTransferMessage('Sender and receiver branches must be different.');
        return;
    }
    
    // Check if batch is finished for normal item transfers
    if (currentTransferItemType === 'Normal Item') {
        const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
        const today = getCurrentDate();
        const senderKey = `${today}_${senderBranch}`;
        const receiverKey = `${today}_${receiverBranch}`;
        
        if (finishedBatches[senderKey]) {
            showBatchFinishedModal(`Cannot transfer: ${senderBranch} has finished batch for today (${today}). There are no items available for transfer when batch is finished.`);
            return;
        }
        
        if (finishedBatches[receiverKey]) {
            showBatchFinishedModal(`Cannot transfer: ${receiverBranch} has finished batch for today (${today}). There are no items available for transfer when batch is finished.`);
            return;
        }
    }
    
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const filteredItems = items.filter(item => item.itemType === currentTransferItemType);
    
    if (filteredItems.length === 0) {
        showTransferMessage(`No ${currentTransferItemType.toLowerCase()} items available.`);
        return;
    }
    
    renderTransferTable(filteredItems, senderBranch, receiverBranch);
}

// Show transfer message
function showTransferMessage(message) {
    const container = document.getElementById('transferTableContainer');
    container.innerHTML = `
        <div class="text-center text-muted py-4">
            <i class="fas fa-info-circle fa-2x mb-3"></i>
            <p>${message}</p>
        </div>
    `;
}

// Show batch finished modal
function showBatchFinishedModal(message) {
    const messageElement = document.getElementById('batchFinishedMessage');
    if (messageElement) {
        messageElement.textContent = message;
    }
    const modal = new bootstrap.Modal(document.getElementById('batchFinishedModal'));
    modal.show();
}

// Render transfer table
function renderTransferTable(items, senderBranch, receiverBranch) {
    const container = document.getElementById('transferTableContainer');
    
    if (currentTransferItemType === 'Normal Item') {
        renderNormalItemTransferTable(items, senderBranch, receiverBranch);
    } else {
        renderGroceryItemTransferTable(items, senderBranch, receiverBranch);
    }
}

// Render normal item transfer table
function renderNormalItemTransferTable(items, senderBranch, receiverBranch) {
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const today = getCurrentDate();
    const senderKey = `${today}_${senderBranch}`;
    const receiverKey = `${today}_${receiverBranch}`;
    
    const container = document.getElementById('transferTableContainer');
    
    let tableHTML = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead class="table-dark">
                    <tr>
                        <th>Item Name</th>
                        <th>Category</th>
                        <th>Price (Rs.)</th>
                        <th>Available Stock (${senderBranch})</th>
                        <th>Transfer Quantity</th>
                        <th>Available Stock (${receiverBranch})</th>
                        <th>Updated Stock (${receiverBranch})</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    const normalRows = items.map(item => {
        const senderStockData = stocks[senderKey]?.[item.code];
        const receiverStockData = stocks[receiverKey]?.[item.code];
        
        // Extract actual stock values from the stock data structure
        const senderStock = senderStockData ? (Number(senderStockData.added) || 0) - (Number(senderStockData.returned) || 0) - (Number(senderStockData.transferred) || 0) : 0;
        if (senderStock <= 0) return '';
        const receiverStock = receiverStockData ? (Number(receiverStockData.added) || 0) - (Number(receiverStockData.returned) || 0) - (Number(receiverStockData.transferred) || 0) : 0;
        
        return `
            <tr>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>Rs ${Number(item.price || 0).toFixed(2)}</td>
                <td><span class="badge bg-primary">${senderStock}</span></td>
                <td>
                    <input type="number" 
                           class="form-control transfer-qty" 
                           data-item-code="${item.code}"
                           data-item-name="${item.name}"
                           data-sender-stock="${senderStock}"
                           data-receiver-stock="${receiverStock}"
                           min="0" 
                           max="${senderStock}"
                           value="0"
                           onchange="updateTransferPreview()">
                </td>
                <td><span class="badge bg-secondary">${receiverStock}</span></td>
                <td><span class="badge bg-success" id="updated-${item.code}">${receiverStock}</span></td>
            </tr>
        `;
    }).filter(Boolean);

    if (normalRows.length === 0) {
        tableHTML += `
            <tr>
                <td colspan="7" class="text-center text-warning">No items with available stock for transfer.</td>
            </tr>
        `;
    } else {
        tableHTML += normalRows.join('');
    }
    
    tableHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = tableHTML;
}

// Render grocery item transfer table
function renderGroceryItemTransferTable(items, senderBranch, receiverBranch) {
    const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
    
    const container = document.getElementById('transferTableContainer');
    
    let tableHTML = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead class="table-dark">
                    <tr>
                        <th>Item Name</th>
                        <th>Category</th>
                        <th>Price (Rs.)</th>
                        <th>Available Stock (${senderBranch})</th>
                        <th>Transfer Quantity</th>
                        <th>Available Stock (${receiverBranch})</th>
                        <th>Updated Stock (${receiverBranch})</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    const groceryRows = items.map(item => {
        const senderStockData = groceryStocks.filter(s => s.itemCode === item.code && s.branch === senderBranch);
        const receiverStockData = groceryStocks.filter(s => s.itemCode === item.code && s.branch === receiverBranch);
        
        // Use remaining field (current available stock after sales/returns), not quantity (original added stock)
        const senderStock = senderStockData.reduce((sum, s) => sum + parseFloat(s.remaining || 0), 0);
        if (senderStock <= 0) return '';
        const receiverStock = receiverStockData.reduce((sum, s) => sum + parseFloat(s.remaining || 0), 0);
        
        return `
            <tr>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>Rs ${Number(item.price || 0).toFixed(2)}</td>
                <td><span class="badge bg-primary">${item.soldByWeight ? Number(senderStock).toFixed(3) : Math.trunc(senderStock)}</span></td>
                <td>
                    <input type="number" 
                           class="form-control transfer-qty" 
                           data-item-code="${item.code}"
                           data-item-name="${item.name}"
                           data-sender-stock="${senderStock}"
                           data-receiver-stock="${receiverStock}"
                           data-sold-by-weight="${item.soldByWeight}"
                           min="0" 
                           max="${senderStock}"
                           step="${item.soldByWeight ? '0.001' : '1'}"
                           value="0"
                           onchange="updateTransferPreview()">
                </td>
                <td><span class="badge bg-secondary">${item.soldByWeight ? Number(receiverStock).toFixed(3) : Math.trunc(receiverStock)}</span></td>
                <td><span class="badge bg-success" id="updated-${item.code}">${item.soldByWeight ? Number(receiverStock).toFixed(3) : Math.trunc(receiverStock)}</span></td>
            </tr>
        `;
    }).filter(Boolean);

    if (groceryRows.length === 0) {
        tableHTML += `
            <tr>
                <td colspan="7" class="text-center text-warning">No grocery items with available stock for transfer.</td>
            </tr>
        `;
    } else {
        tableHTML += groceryRows.join('');
    }
    
    tableHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = tableHTML;
}

// Update transfer preview
function updateTransferPreview() {
    const transferInputs = document.querySelectorAll('.transfer-qty');
    
    transferInputs.forEach(input => {
        const itemCode = input.dataset.itemCode;
        const transferQty = parseFloat(input.value) || 0;
        const receiverStock = parseFloat(input.dataset.receiverStock) || 0;
        const soldByWeight = input.dataset.soldByWeight === 'true';
        
        const updatedStock = receiverStock + transferQty;
        const updatedElement = document.getElementById(`updated-${itemCode}`);
        
        if (updatedElement) {
            updatedElement.textContent = soldByWeight ? Number(updatedStock).toFixed(3) : Math.trunc(updatedStock);
        }
    });
}

// Filter transfer items
function filterTransferItems() {
    const category = document.getElementById('transferCategory')?.value;
    const search = document.getElementById('transferSearch')?.value.toLowerCase();
    
    const senderBranch = document.getElementById('senderBranch')?.value;
    const receiverBranch = document.getElementById('receiverBranch')?.value;
    
    if (!senderBranch || !receiverBranch) {
        return;
    }
    
    const items = JSON.parse(localStorage.getItem('items')) || [];
    let filteredItems = items.filter(item => item.itemType === currentTransferItemType);
    
    if (category) {
        filteredItems = filteredItems.filter(item => item.category === category);
    }
    
    if (search) {
        filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(search));
    }
    
    renderTransferTable(filteredItems, senderBranch, receiverBranch);
}

// Process transfer
function processTransfer() {
    const senderBranch = document.getElementById('senderBranch')?.value;
    const receiverBranch = document.getElementById('receiverBranch')?.value;
    
    if (!senderBranch || !receiverBranch) {
        showNotification('Please select both sender and receiver branches.', 'error');
        return;
    }
    
    if (senderBranch === receiverBranch) {
        showNotification('Sender and receiver branches must be different.', 'error');
        return;
    }
    
    // Check if batch is finished for normal item transfers
    if (currentTransferItemType === 'Normal Item') {
        const finishedBatches = JSON.parse(localStorage.getItem('finishedBatches')) || {};
        const today = getCurrentDate();
        const senderKey = `${today}_${senderBranch}`;
        const receiverKey = `${today}_${receiverBranch}`;
        
        if (finishedBatches[senderKey]) {
            showBatchFinishedModal(`Cannot transfer: ${senderBranch} has finished batch for today (${today}). There are no items available for transfer when batch is finished.`);
            return;
        }
        
        if (finishedBatches[receiverKey]) {
            showBatchFinishedModal(`Cannot transfer: ${receiverBranch} has finished batch for today (${today}). There are no items available for transfer when batch is finished.`);
            return;
        }
    }
    
    const transferInputs = document.querySelectorAll('.transfer-qty');
    const transferItems = [];
    
    transferInputs.forEach(input => {
        const transferQty = parseFloat(input.value) || 0;
        if (transferQty > 0) {
            transferItems.push({
                itemCode: input.dataset.itemCode,
                itemName: input.dataset.itemName,
                quantity: transferQty,
                senderStock: parseFloat(input.dataset.senderStock),
                receiverStock: parseFloat(input.dataset.receiverStock),
                soldByWeight: input.dataset.soldByWeight === 'true'
            });
        }
    });
    
    if (transferItems.length === 0) {
        showNotification('Please enter quantities to transfer.', 'warning');
        return;
    }
    
    // Validate transfer quantities
    for (const item of transferItems) {
        if (item.quantity > item.senderStock) {
            showNotification(`Cannot transfer ${item.quantity} of ${item.itemName}. Only ${item.senderStock} available.`, 'error');
            return;
        }
    }
    
    showTransferConfirmation(transferItems, senderBranch, receiverBranch);
}

// Show transfer confirmation modal
function showTransferConfirmation(transferItems, senderBranch, receiverBranch) {
    const modal = new bootstrap.Modal(document.getElementById('transferConfirmModal'));
    const summaryDiv = document.getElementById('transferSummary');
    
    let summaryHTML = `
        <div class="row mb-3">
            <div class="col-md-6">
                <strong>From:</strong> ${senderBranch}
            </div>
            <div class="col-md-6">
                <strong>To:</strong> ${receiverBranch}
            </div>
        </div>
        <div class="row mb-3">
            <div class="col-md-6">
                <strong>Item Type:</strong> ${currentTransferItemType}
            </div>
            <div class="col-md-6">
                <strong>Total Items:</strong> ${transferItems.length}
            </div>
        </div>
        <hr>
        <h6>Transfer Details:</h6>
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Item Name</th>
                        <th>Transfer Quantity</th>
                        <th>Sender Stock</th>
                        <th>Receiver Stock</th>
                        <th>Updated Receiver Stock</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    transferItems.forEach(item => {
        const updatedStock = item.receiverStock + item.quantity;
        summaryHTML += `
            <tr>
                <td>${item.itemName}</td>
                <td><span class="badge bg-primary">${item.soldByWeight ? Number(item.quantity).toFixed(3) : Math.trunc(item.quantity)}</span></td>
                <td><span class="badge bg-secondary">${item.soldByWeight ? Number(item.senderStock).toFixed(3) : Math.trunc(item.senderStock)}</span></td>
                <td><span class="badge bg-info">${item.soldByWeight ? Number(item.receiverStock).toFixed(3) : Math.trunc(item.receiverStock)}</span></td>
                <td><span class="badge bg-success">${item.soldByWeight ? Number(updatedStock).toFixed(3) : Math.trunc(updatedStock)}</span></td>
            </tr>
        `;
    });
    
    summaryHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    summaryDiv.innerHTML = summaryHTML;
    
    // Store transfer data for confirmation
    transferData = {
        items: transferItems,
        senderBranch: senderBranch,
        receiverBranch: receiverBranch,
        itemType: currentTransferItemType,
        date: getCurrentDate()
    };
    
    modal.show();
}

// Confirm transfer
function confirmTransfer() {
    if (transferData.items.length === 0) {
        showNotification('No transfer data available.', 'error');
        return;
    }
    
    try {
        if (transferData.itemType === 'Normal Item') {
            processNormalItemTransfer();
        } else {
            processGroceryItemTransfer();
        }
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('transferConfirmModal'));
        modal.hide();
        
        // Create notification for other users (before clearing form)
        createTransferNotification();
        
        // Clear form
        clearTransferForm();
        
        showNotification('Transfer completed successfully!', 'success');
        
    } catch (error) {
        console.error('Transfer error:', error);
        showNotification('Error processing transfer. Please try again.', 'error');
    }
}

// Process normal item transfer
function processNormalItemTransfer() {
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const today = transferData.date;
    const senderKey = `${today}_${transferData.senderBranch}`;
    const receiverKey = `${today}_${transferData.receiverBranch}`;
    
    // Initialize stock entries if they don't exist
    if (!stocks[senderKey]) stocks[senderKey] = {};
    if (!stocks[receiverKey]) stocks[receiverKey] = {};
    
    transferData.items.forEach(item => {
        // Initialize stock entries for the item if they don't exist
        if (!stocks[senderKey][item.itemCode]) {
            stocks[senderKey][item.itemCode] = { added: 0, returned: 0, sold: 0 };
        }
        if (!stocks[receiverKey][item.itemCode]) {
            stocks[receiverKey][item.itemCode] = { added: 0, returned: 0, sold: 0 };
        }
        
        // Reduce sender stock by adding to transferred field (not returned - transfers are not returns)
        stocks[senderKey][item.itemCode].transferred = (stocks[senderKey][item.itemCode].transferred || 0) + item.quantity;
        
        // Increase receiver stock by adding to added stock
        stocks[receiverKey][item.itemCode].added = (stocks[receiverKey][item.itemCode].added || 0) + item.quantity;
    });
    
    localStorage.setItem('stocks', JSON.stringify(stocks));
    
    // Trigger storage event to notify other pages
    window.dispatchEvent(new StorageEvent('storage', {
        key: 'stocks',
        newValue: JSON.stringify(stocks),
        oldValue: localStorage.getItem('stocks')
    }));
    
    // Record transfer history
    recordTransferHistory();
}

// Process grocery item transfer
function processGroceryItemTransfer() {
    const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
    const today = transferData.date;
    
    transferData.items.forEach(item => {
        // Find sender stock entries
        const senderStocks = groceryStocks
            .filter(s => 
                s.itemCode === item.itemCode && 
                s.branch === transferData.senderBranch && 
                s.remaining > 0
            )
            // FIFO by earliest expiry, then by addedDate if available
            .sort((a, b) => {
                const aExp = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
                const bExp = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
                if (aExp !== bExp) return aExp - bExp;
                const aAdd = a.addedDate ? new Date(a.addedDate).getTime() : 0;
                const bAdd = b.addedDate ? new Date(b.addedDate).getTime() : 0;
                return aAdd - bAdd;
            });
        
        let remainingToTransfer = item.quantity;
        
        // Helper to generate a new batch id (keep consistent with expire tracking)
        const generateBatchId = () => 'B' + Date.now() + Math.random().toString(36).substr(2, 9);

        // Process sender stocks (FIFO) and create corresponding receiver batches preserving expiry
        for (const stock of senderStocks) {
            if (remainingToTransfer <= 0) break;

            const transferFromThisStock = Math.min(remainingToTransfer, stock.remaining);
            if (transferFromThisStock <= 0) continue;

            // Reduce from sender
            stock.remaining -= transferFromThisStock;
            remainingToTransfer -= transferFromThisStock;

            // Create a new batch at receiver with SAME expiry as source and NEW batch id
            groceryStocks.push({
                id: 'GROCERY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                batchId: generateBatchId(),
                itemCode: item.itemCode,
                branch: transferData.receiverBranch,
                quantity: transferFromThisStock,
                remaining: transferFromThisStock,
                expiryDate: stock.expiryDate || null,
                addedDate: today,
                addedBy: localStorage.getItem('currentUserId') || 'system'
            });
        }
    });
    
    localStorage.setItem('groceryStocks', JSON.stringify(groceryStocks));
    
    // Trigger storage event to notify other pages
    window.dispatchEvent(new StorageEvent('storage', {
        key: 'groceryStocks',
        newValue: JSON.stringify(groceryStocks),
        oldValue: localStorage.getItem('groceryStocks')
    }));
    
    // Record transfer history
    recordTransferHistory();
}

// Record transfer history
function recordTransferHistory() {
    const transferHistory = JSON.parse(localStorage.getItem('transferHistory')) || [];
    
    const transferRecord = {
        id: 'TRANSFER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        date: transferData.date,
        senderBranch: transferData.senderBranch,
        receiverBranch: transferData.receiverBranch,
        itemType: transferData.itemType,
        items: transferData.items.map(item => ({
            itemCode: item.itemCode,
            itemName: item.itemName,
            quantity: item.quantity,
            soldByWeight: item.soldByWeight
        })),
        processedBy: localStorage.getItem('currentUserId') || 'system',
        processedAt: new Date().toISOString()
    };
    
    transferHistory.push(transferRecord);
    localStorage.setItem('transferHistory', JSON.stringify(transferHistory));
    
    // Trigger storage event to notify other pages
    window.dispatchEvent(new StorageEvent('storage', {
        key: 'transferHistory',
        newValue: JSON.stringify(transferHistory),
        oldValue: localStorage.getItem('transferHistory')
    }));
}

// Create transfer notification
function createTransferNotification() {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    
    // Check if transferData exists and has the required properties
    if (!transferData || !transferData.items || !Array.isArray(transferData.items)) {
        console.warn('Transfer data is incomplete, skipping notification creation');
        return;
    }
    
    const notification = {
        id: 'NOTIF_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: 'transfer',
        message: `Internal transfer completed: ${transferData.items.length} ${transferData.itemType.toLowerCase()} items from ${transferData.senderBranch} to ${transferData.receiverBranch}`,
        branch: transferData.senderBranch,
        createdAt: new Date().toISOString(),
        readBy: []
    };
    
    notifications.push(notification);
    localStorage.setItem('notifications', JSON.stringify(notifications));
}

// Clear transfer form
function clearTransferForm() {
    // Clear branch selections
    document.getElementById('senderBranch').value = '';
    document.getElementById('receiverBranch').value = '';
    
    // Clear filters
    document.getElementById('transferCategory').value = '';
    document.getElementById('transferSearch').value = '';
    
    // Clear transfer data
    transferData = [];
    
    // Show initial message
    showTransferMessage('Please select sender and receiver branches to view available items for transfer.');
}

// Show notification
function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    const alertClass = type === 'error' ? 'alert-danger' : 
                     type === 'warning' ? 'alert-warning' : 
                     type === 'success' ? 'alert-success' : 'alert-info';
    
    const notification = document.createElement('div');
    notification.className = `alert ${alertClass} alert-dismissible fade show`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    container.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initTransferPage();
});
