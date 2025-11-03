// inventory.js - Inventory Management

// Toggle item fields based on selection
function toggleItemFields() {
    const itemType = document.getElementById('itemType')?.value;
    const normalItemFields = document.getElementById('normalItemFields');
    const groceryItemFields = document.getElementById('groceryItemFields');
    const machineFields = document.getElementById('machineFields');
    const addItemButton = document.getElementById('addItemButton');
    const createMachineButton = document.getElementById('createMachineButton');

    // Hide all fields first
    if (normalItemFields) normalItemFields.style.display = 'none';
    if (groceryItemFields) groceryItemFields.style.display = 'none';
    if (machineFields) machineFields.style.display = 'none';
    if (addItemButton) addItemButton.style.display = 'none';
    if (createMachineButton) createMachineButton.style.display = 'none';

    // Show appropriate fields based on selection
    if (itemType === 'Normal Item') {
        if (normalItemFields) normalItemFields.style.display = 'block';
        if (addItemButton) {
            addItemButton.style.display = 'block';
            addItemButton.disabled = false;
        }
    } else if (itemType === 'Grocery Item') {
        if (groceryItemFields) groceryItemFields.style.display = 'block';
        if (addItemButton) {
            addItemButton.style.display = 'block';
            addItemButton.disabled = false;
        }
        // Sold-by-weight is now user-controlled regardless of category
        setTimeout(() => {
            const weightCheckbox = document.getElementById('grocerySoldByWeight');
            if (weightCheckbox) weightCheckbox.disabled = false;
        }, 0);
    } else if (itemType === 'Machine') {
        if (machineFields) machineFields.style.display = 'block';
        if (createMachineButton) {
            createMachineButton.style.display = 'block';
            createMachineButton.disabled = false;
        }
    }
}

// Clear add item modal form
function clearAddItemModal() {
    // Reset item type dropdown
    const itemType = document.getElementById('itemType');
    if (itemType) itemType.value = '';
    
    // Clear Normal Item fields
    document.getElementById('itemName').value = '';
    document.getElementById('category').value = 'Food';
    document.getElementById('subcategory').value = '';
    document.getElementById('price').value = '';
    document.getElementById('description').value = '';
    
    // Clear Grocery Item fields
    document.getElementById('groceryItemName').value = '';
    document.getElementById('groceryCategory').value = '';
    document.getElementById('grocerySubcategory').value = '';
    document.getElementById('groceryPrice').value = '';
    document.getElementById('grocerySoldByWeight').checked = false;
    document.getElementById('groceryNotifyExpiry').checked = false;
    
    // Clear Machine fields
    document.getElementById('machineName').value = '';
    document.getElementById('machinePrice').value = '';
    
    // Hide all field groups
    const normalItemFields = document.getElementById('normalItemFields');
    const groceryItemFields = document.getElementById('groceryItemFields');
    const machineFields = document.getElementById('machineFields');
    const addItemButton = document.getElementById('addItemButton');
    const createMachineButton = document.getElementById('createMachineButton');
    
    if (normalItemFields) normalItemFields.style.display = 'none';
    if (groceryItemFields) groceryItemFields.style.display = 'none';
    if (machineFields) machineFields.style.display = 'none';
    if (addItemButton) addItemButton.style.display = 'none';
    if (createMachineButton) createMachineButton.style.display = 'none';
}

// Add item to inventory
function addItem() {
    const itemType = document.getElementById('itemType')?.value;
    let items = JSON.parse(localStorage.getItem('items')) || [];

    if (itemType === 'Normal Item') {
        const name = document.getElementById('itemName')?.value?.trim();
        const category = document.getElementById('category')?.value?.trim();
        const subcategory = document.getElementById('subcategory')?.value?.trim();
        const price = parseFloat(document.getElementById('price')?.value);
        const description = document.getElementById('description')?.value?.trim();

        if (!name || !category || isNaN(price) || price <= 0) {
            alert('Please fill all required fields for Normal Item.');
            return;
        }

        const item = {
            code: generateItemCode(),
            itemType: 'Normal Item',
            name,
            category,
            subcategory: subcategory || '',
            price,
            description: description || ''
        };

        items.push(item);
    } else if (itemType === 'Grocery Item') {
        const name = document.getElementById('groceryItemName')?.value?.trim();
        const category = document.getElementById('groceryCategory')?.value?.trim();
        const subcategory = document.getElementById('grocerySubcategory')?.value?.trim();
        const price = parseFloat(document.getElementById('groceryPrice')?.value);
        const soldByWeight = !!document.getElementById('grocerySoldByWeight')?.checked;
        const notifyExpiry = !!document.getElementById('groceryNotifyExpiry')?.checked;

        if (!name || !category || isNaN(price) || price <= 0) {
            alert('Please fill all required fields for Grocery Item.');
            return;
        }

        const item = {
            code: generateItemCode(),
            itemType: 'Grocery Item',
            name,
            category,
            subcategory: subcategory || '',
            price,
            soldByWeight: soldByWeight === true,
            notifyExpiry: notifyExpiry === true
        };

        items.push(item);
    } else {
        alert('Please select an item type.');
        return;
    }

    localStorage.setItem('items', JSON.stringify(items));
    clearAddItemModal();
    bootstrap.Modal.getInstance(document.getElementById('addItemModal')).hide();
    filterItems();
    alert('Item added successfully!');
}

// Add machine item
function addMachineItem() {
    const name = document.getElementById('machineName')?.value?.trim();
    const price = parseFloat(document.getElementById('machinePrice')?.value);

    if (!name || isNaN(price) || price <= 0) {
        alert('Please fill all required fields for Machine.');
        return;
    }

    let items = JSON.parse(localStorage.getItem('items')) || [];
    
    // Check if machine with same name already exists
    const existingMachine = items.find(item => 
        item.itemType === 'Machine' && item.name.toLowerCase() === name.toLowerCase()
    );
    
    if (existingMachine) {
        alert('A machine with this name already exists. Please use a different name.');
        return;
    }

    const item = {
        code: generateItemCode(),
        itemType: 'Machine',
        name,
        price,
        category: 'Machine',
        subcategory: 'Coffee Machine'
    };

    items.push(item);
    localStorage.setItem('items', JSON.stringify(items));
    
    // Reset form and close modal
    clearAddItemModal();
    bootstrap.Modal.getInstance(document.getElementById('addItemModal')).hide();
    
    // Refresh the items list
    filterItems();
    
    // Show success message with machine details
    alert(`Machine "${name}" created successfully!\nPrice per unit: Rs ${price.toFixed(2)}`);
}

// Filter items based on criteria
function filterItems() {
    const typeFilter = document.getElementById('filterType')?.value || '';
    const categoryFilter = document.getElementById('filterCategory')?.value || '';
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const tableBody = document.getElementById('inventoryTableBody');

    let filteredItems = items;
    if (typeFilter) {
        filteredItems = filteredItems.filter(item => item.itemType === typeFilter);
    }
    if (categoryFilter) {
        filteredItems = filteredItems.filter(item => item.category === categoryFilter);
    }
    if (searchTerm) {
        filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(searchTerm));
    }

    if (!tableBody) return;
    
    tableBody.innerHTML = filteredItems.length === 0
        ? '<tr><td colspan="6" class="text-center">No items found.</td></tr>'
        : filteredItems.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.itemType}</td>
                <td>${item.category}</td>
                <td>${item.subcategory || '-'}</td>
                <td>Rs ${item.price.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-primary me-1" onclick="editItem('${item.code}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteItem('${item.code}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `).join('');

    // Populate category filter
    const categories = [...new Set(items.map(i => i.category))];
    const catSelect = document.getElementById('filterCategory');
    if (catSelect) {
        catSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
        if (categoryFilter) {
            catSelect.value = categoryFilter;
        }
    }
}

// Edit item
function editItem(code) {
    const items = JSON.parse(localStorage.getItem('items')) || [];
    const item = items.find(i => i.code === code);

    if (!item) {
        alert('Item not found.');
        return;
    }

    if (item.itemType === 'Normal Item') {
        document.getElementById('editCode').value = item.code;
        document.getElementById('editName').value = item.name;
        document.getElementById('editCategory').value = item.category;
        document.getElementById('editSubcategory').value = item.subcategory || '';
        document.getElementById('editPrice').value = item.price;
        document.getElementById('editDescription').value = item.description || '';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('editItemModal')).show();
    } else if (item.itemType === 'Grocery Item') {
        document.getElementById('editGroceryCode').value = item.code;
        document.getElementById('editGroceryName').value = item.name;
        document.getElementById('editGroceryCategory').value = item.category;
        document.getElementById('editGrocerySubcategory').value = item.subcategory || '';
        document.getElementById('editGroceryPrice').value = item.price;
        // Build sold-by-weight toggle dynamically if not present
        let container = document.getElementById('editGroceryModal').querySelector('.modal-body');
        if (container && !document.getElementById('editGrocerySoldByWeight')) {
            const div = document.createElement('div');
            div.className = 'form-check mb-2';
            div.innerHTML = `
              <input class="form-check-input" type="checkbox" id="editGrocerySoldByWeight" />
              <label class="form-check-label" for="editGrocerySoldByWeight">Sold by weight</label>
              <div class="form-text">If checked, quantities will accept decimals (e.g., kg).</div>
            `;
            container.appendChild(div);
        }
        
        // Build notify expiry toggle dynamically if not present
        if (container && !document.getElementById('editGroceryNotifyExpiry')) {
            const div = document.createElement('div');
            div.className = 'form-check mb-2';
            div.innerHTML = `
              <input class="form-check-input" type="checkbox" id="editGroceryNotifyExpiry" />
              <label class="form-check-label" for="editGroceryNotifyExpiry">Notify on expiry</label>
              <div class="form-text">If checked, you will receive notifications 2 days before the expiry date.</div>
            `;
            container.appendChild(div);
        }
        
        const editWeightCheckbox = document.getElementById('editGrocerySoldByWeight');
        if (editWeightCheckbox) {
            editWeightCheckbox.checked = !!item.soldByWeight;
            editWeightCheckbox.disabled = false;
        }
        
        const editNotifyCheckbox = document.getElementById('editGroceryNotifyExpiry');
        if (editNotifyCheckbox) {
            editNotifyCheckbox.checked = !!item.notifyExpiry;
            editNotifyCheckbox.disabled = false;
        }
        bootstrap.Modal.getOrCreateInstance(document.getElementById('editGroceryModal')).show();
    }
}

// Update item
function updateItem() {
    const code = document.getElementById('editCode')?.value;
    const name = document.getElementById('editName')?.value?.trim();
    const category = document.getElementById('editCategory')?.value?.trim();
    const subcategory = document.getElementById('editSubcategory')?.value?.trim();
    const price = parseFloat(document.getElementById('editPrice')?.value);
    const description = document.getElementById('editDescription')?.value?.trim();

    if (!name || !category || isNaN(price) || price <= 0) {
        alert('Please fill all required fields.');
        return;
    }

    let items = JSON.parse(localStorage.getItem('items')) || [];
    const index = items.findIndex(i => i.code === code);
    if (index !== -1) {
        items[index] = {
            ...items[index],
            name,
            category,
            subcategory: subcategory || '',
            price,
            description: description || ''
        };
        localStorage.setItem('items', JSON.stringify(items));
        bootstrap.Modal.getInstance(document.getElementById('editItemModal')).hide();
        filterItems();
        alert('Normal Item updated successfully!');
    }
}

// Update grocery item
function updateGroceryItem() {
    const code = document.getElementById('editGroceryCode')?.value;
    const name = document.getElementById('editGroceryName')?.value?.trim();
    const category = document.getElementById('editGroceryCategory')?.value?.trim();
    const subcategory = document.getElementById('editGrocerySubcategory')?.value?.trim();
    const price = parseFloat(document.getElementById('editGroceryPrice')?.value);
    const soldByWeight = !!document.getElementById('editGrocerySoldByWeight')?.checked;
    const notifyExpiry = !!document.getElementById('editGroceryNotifyExpiry')?.checked;

    if (!name || !category || isNaN(price) || price <= 0) {
        alert('Please fill all required fields.');
        return;
    }

    let items = JSON.parse(localStorage.getItem('items')) || [];
    const index = items.findIndex(i => i.code === code);
    if (index !== -1) {
        items[index] = {
            ...items[index],
            name,
            category,
            subcategory: subcategory || '',
            price,
            soldByWeight: soldByWeight === true,
            notifyExpiry: notifyExpiry === true
        };
        localStorage.setItem('items', JSON.stringify(items));
        bootstrap.Modal.getInstance(document.getElementById('editGroceryModal')).hide();
        filterItems();
        alert('Grocery Item updated successfully!');
    }
}

// Delete item
function deleteItem(code) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    let items = JSON.parse(localStorage.getItem('items')) || [];
    const item = items.find(i => i.code === code);
    if (!item) {
        alert('Item not found.');
        return;
    }

    // Check if item has stock
    const stocks = JSON.parse(localStorage.getItem('stocks')) || {};
    const groceryStocks = JSON.parse(localStorage.getItem('groceryStocks')) || [];
    let hasStock = false;
    
    if (item.itemType === 'Normal Item') {
        Object.values(stocks).forEach(branchStocks => {
            if (branchStocks[code] && (branchStocks[code].added - branchStocks[code].returned - branchStocks[code].sold) > 0) {
                hasStock = true;
            }
        });
    } else if (item.itemType === 'Grocery Item') {
        if (groceryStocks.some(s => s.itemCode === code && s.quantity > 0)) {
            hasStock = true;
        }
    }

    if (hasStock) {
        alert('Cannot delete item with existing stock.');
        return;
    }

    items = items.filter(i => i.code !== code);
    localStorage.setItem('items', JSON.stringify(items));
    filterItems();
    alert('Item deleted successfully!');
}

// Initialize inventory page
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('inventory.html')) {
        filterItems();
        
        // Add event listeners for filters
        const filterType = document.getElementById('filterType');
        const filterCategory = document.getElementById('filterCategory');
        const searchInput = document.getElementById('searchInput');
        
        if (filterType) filterType.addEventListener('change', filterItems);
        if (filterCategory) filterCategory.addEventListener('change', filterItems);
        if (searchInput) searchInput.addEventListener('input', filterItems);
        
        // Clear form when modal is opened
        const addItemModal = document.getElementById('addItemModal');
        if (addItemModal) {
            addItemModal.addEventListener('show.bs.modal', clearAddItemModal);
        }
    }
});