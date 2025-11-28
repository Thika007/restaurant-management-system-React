import { useState, useEffect } from 'react';
import { itemsAPI } from '../services/api';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { formatCurrency } from '../utils/helpers';
import { useToast } from '../context/ToastContext';

const Inventory = () => {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter states
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditGroceryModal, setShowEditGroceryModal] = useState(false);
  const [showEditMachineModal, setShowEditMachineModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [itemToDelete, setItemToDelete] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  
  // Form states
  const [itemType, setItemType] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    subcategory: '',
    price: '',
    description: '',
    soldByWeight: false,
    notifyExpiry: false
  });

  // Categories for Normal Items
  const normalCategories = ['Food', 'Beverage', 'Dessert', 'Bread', 'Pastry', 'Cake'];

  // Fetch items from API
  useEffect(() => {
    loadItems();
  }, []);

  // Filter items when filters change
  useEffect(() => {
    filterItems();
  }, [items, filterType, filterCategory, searchTerm]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await itemsAPI.getAll();
      if (response.data.success) {
        setItems(response.data.items);
      }
    } catch (error) {
      setError('Failed to load items');
      console.error('Load items error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = [...items];
    
    if (filterType) {
      filtered = filtered.filter(item => item.itemType === filterType);
    }
    
    if (filterCategory) {
      filtered = filtered.filter(item => item.category === filterCategory);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredItems(filtered);
  };

  // Get unique categories from items
  const getCategories = () => {
    const categories = [...new Set(items.map(item => item.category))];
    return categories.sort();
  };

  const handleItemTypeChange = (type) => {
    setItemType(type);
    // Reset form when changing type
    setFormData({
      name: '',
      category: type === 'Normal Item' ? 'Food' : '',
      subcategory: '',
      price: '',
      description: '',
      soldByWeight: false,
      notifyExpiry: false
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAddItem = async () => {
    try {
      if (!itemType) {
        showWarning('Please select an item type.');
        return;
      }

      let itemData = {
        itemType,
        name: formData.name.trim(),
        category: formData.category.trim(),
        subcategory: formData.subcategory.trim() || null,
        price: parseFloat(formData.price)
      };

      if (itemType === 'Normal Item') {
        if (!itemData.name || !itemData.category || !itemData.price || itemData.price <= 0) {
          showWarning('Please fill all required fields for Normal Item.');
          return;
        }
        itemData.description = formData.description.trim() || null;
      } else if (itemType === 'Grocery Item') {
        if (!itemData.name || !itemData.category || !itemData.price || itemData.price <= 0) {
          showWarning('Please fill all required fields for Grocery Item.');
          return;
        }
        itemData.soldByWeight = formData.soldByWeight;
        itemData.notifyExpiry = formData.notifyExpiry;
      } else if (itemType === 'Machine') {
        if (!itemData.name || !itemData.price || itemData.price <= 0) {
          showWarning('Please fill all required fields for Machine.');
          return;
        }
        itemData.category = 'Machine';
        itemData.subcategory = 'Coffee Machine';
      }

      const response = await itemsAPI.create(itemData);
      if (response.data.success) {
        const message = itemType === 'Machine' 
          ? `Machine "${itemData.name}" created successfully! Price per unit: Rs ${itemData.price.toFixed(2)}`
          : `Item "${itemData.name}" created successfully!`;
        setSuccessMessage(message);
        setShowSuccessModal(true);
        clearForm();
        setShowAddModal(false);
        loadItems();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to add item';
      showError(message);
      console.error('Add item error:', error);
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    if (item.itemType === 'Normal Item') {
      setFormData({
        name: item.name,
        category: item.category,
        subcategory: item.subcategory || '',
        price: item.price.toString(),
        description: item.description || '',
        soldByWeight: false,
        notifyExpiry: false
      });
      setItemType('Normal Item');
      setShowEditModal(true);
    } else if (item.itemType === 'Grocery Item') {
      setFormData({
        name: item.name,
        category: item.category,
        subcategory: item.subcategory || '',
        price: item.price.toString(),
        description: '',
        soldByWeight: item.soldByWeight || false,
        notifyExpiry: item.notifyExpiry || false
      });
      setItemType('Grocery Item');
      setShowEditGroceryModal(true);
    } else if (item.itemType === 'Machine') {
      setFormData({
        name: item.name,
        category: 'Machine',
        subcategory: 'Coffee Machine',
        price: item.price.toString(),
        description: '',
        soldByWeight: false,
        notifyExpiry: false
      });
      setItemType('Machine');
      setShowEditMachineModal(true);
    }
  };

  const handleUpdateItem = async () => {
    try {
      if (!editingItem) return;

      const updateData = {
        name: formData.name.trim(),
        category: editingItem.itemType === 'Machine' ? 'Machine' : formData.category.trim(),
        subcategory: editingItem.itemType === 'Machine' ? 'Coffee Machine' : (formData.subcategory.trim() || null),
        price: parseFloat(formData.price)
      };

      if (editingItem.itemType === 'Normal Item') {
        if (!updateData.name || !updateData.category || !updateData.price || updateData.price <= 0) {
          showWarning('Please fill all required fields.');
          return;
        }
        updateData.description = formData.description.trim() || null;
      } else if (editingItem.itemType === 'Grocery Item') {
        if (!updateData.name || !updateData.category || !updateData.price || updateData.price <= 0) {
          showWarning('Please fill all required fields.');
          return;
        }
        updateData.soldByWeight = formData.soldByWeight;
        updateData.notifyExpiry = formData.notifyExpiry;
      } else if (editingItem.itemType === 'Machine') {
        if (!updateData.name || !updateData.price || updateData.price <= 0) {
          showWarning('Please fill all required fields.');
          return;
        }
      }

      const response = await itemsAPI.update(editingItem.code, updateData);
      if (response.data.success) {
        setSuccessMessage(`${editingItem.itemType} "${updateData.name}" updated successfully!`);
        setShowSuccessModal(true);
        clearForm();
        setShowEditModal(false);
        setShowEditGroceryModal(false);
        setShowEditMachineModal(false);
        setEditingItem(null);
        loadItems();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update item';
      showError(message);
      console.error('Update item error:', error);
    }
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setSuccessMessage('');
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      const response = await itemsAPI.delete(itemToDelete.code);
      if (response.data.success) {
        setSuccessMessage(`Item "${itemToDelete.name}" deleted successfully!`);
        setShowSuccessModal(true);
        closeDeleteModal();
        loadItems();
      }
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to delete item';
      showError(message);
      console.error('Delete item error:', error);
      closeDeleteModal();
    }
  };

  const clearForm = () => {
    setItemType('');
    setFormData({
      name: '',
      category: 'Food',
      subcategory: '',
      price: '',
      description: '',
      soldByWeight: false,
      notifyExpiry: false
    });
    setEditingItem(null);
  };

  // Prepare export data
  const getExportRows = () => {
    return filteredItems.map(item => [
      item.name,
      item.itemType,
      item.category,
      item.subcategory || '-',
      formatCurrency(item.price)
    ]);
  };

  // Handle export
  const handleExport = (format) => {
    if (filteredItems.length === 0) {
      showWarning('No items available to export.');
      return;
    }

    const headers = ['Item Name', 'Type', 'Category', 'Subcategory', 'Price (Rs.)'];
    const rows = getExportRows();
    
    // Build filename with filters
    const filenameParts = ['Inventory_Items'];
    if (filterType) filenameParts.push(filterType.replace(/\s+/g, '_'));
    if (filterCategory) filenameParts.push(filterCategory.replace(/\s+/g, '_'));
    if (searchTerm) filenameParts.push('Search_' + searchTerm.replace(/\s+/g, '_'));
    const filename = filenameParts.join('_');

    const title = `Inventory Items - Master Creation${filterType ? ` (${filterType})` : ''}${filterCategory ? ` - ${filterCategory}` : ''}${searchTerm ? ` - Search: ${searchTerm}` : ''}`;

    if (format === 'excel') {
      exportToExcel({ filename, sheetName: 'Inventory Items', headers, rows });
    } else {
      exportToPDF({ filename, title, headers, rows, orientation: 'landscape' });
    }
  };

  const showNormalFields = itemType === 'Normal Item';
  const showGroceryFields = itemType === 'Grocery Item';
  const showMachineFields = itemType === 'Machine';

  if (loading) {
    return <div className="text-center p-5">Loading...</div>;
  }

  return (
    <div className="p-4">
      <h2 className="mb-4">Master Creation</h2>

      {/* Filters Section */}
      <div className="card mb-3">
        <div className="card-body">
          <h4>Filter Items</h4>
          <div className="row g-3">
            <div className="col-md-3">
              <select 
                className="form-select" 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="Normal Item">Normal Item</option>
                <option value="Grocery Item">Grocery Item</option>
                <option value="Machine">Machine</option>
              </select>
            </div>
            <div className="col-md-3">
              <select 
                className="form-select"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {getCategories().map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <input
                type="text"
                className="form-control"
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <button 
                className="btn btn-primary w-100"
                onClick={filterItems}
              >
                Filter
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Item Button */}
      <button
        className="btn btn-success mb-3"
        onClick={() => {
          clearForm();
          setShowAddModal(true);
        }}
      >
        <i className="fas fa-plus"></i> Add New Item
      </button>

      {/* Items Table */}
      <div className="card">
        <div className="card-header">
          <div className="d-flex justify-content-between align-items-center">
            <span>Inventory Items</span>
            {filteredItems.length > 0 && (
              <div className="d-flex gap-2">
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleExport('excel')}
                  title="Export to Excel"
                >
                  <i className="fas fa-file-excel"></i> Export Excel
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleExport('pdf')}
                  title="Export to PDF"
                >
                  <i className="fas fa-file-pdf"></i> Export PDF
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="card-body">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Type</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th>Price (Rs.)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center">No items found.</td>
                </tr>
              ) : (
                filteredItems.map(item => (
                  <tr key={item.code}>
                    <td>{item.name}</td>
                    <td>{item.itemType}</td>
                    <td>{item.category}</td>
                    <td>{item.subcategory || '-'}</td>
                    <td>Rs {parseFloat(item.price).toFixed(2)}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary me-1"
                        onClick={() => handleEdit(item)}
                      >
                        <i className="fas fa-edit"></i> Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteClick(item)}
                      >
                        <i className="fas fa-trash"></i> Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add New Item</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowAddModal(false);
                    clearForm();
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Item Type</label>
                  <select
                    className="form-select"
                    value={itemType}
                    onChange={(e) => handleItemTypeChange(e.target.value)}
                  >
                    <option value="">Select Item Type</option>
                    <option value="Normal Item">Normal Item</option>
                    <option value="Grocery Item">Grocery Item</option>
                    <option value="Machine">Machine</option>
                  </select>
                </div>

                {/* Normal Item Fields */}
                {showNormalFields && (
                  <>
                    <div className="mb-3">
                      <label className="form-label">Item Name</label>
                      <input
                        type="text"
                        className="form-control"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="Enter item name"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Category</label>
                      <select
                        className="form-select"
                        name="category"
                        value={formData.category}
                        onChange={handleInputChange}
                      >
                        {normalCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Subcategory</label>
                      <input
                        type="text"
                        className="form-control"
                        name="subcategory"
                        value={formData.subcategory}
                        onChange={handleInputChange}
                        placeholder="Enter subcategory"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Price (Rs.)</label>
                      <input
                        type="number"
                        className="form-control"
                        name="price"
                        value={formData.price}
                        onChange={handleInputChange}
                        placeholder="Enter price"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Description</label>
                      <textarea
                        className="form-control"
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        placeholder="Enter description"
                      ></textarea>
                    </div>
                  </>
                )}

                {/* Grocery Item Fields */}
                {showGroceryFields && (
                  <>
                    <div className="mb-3">
                      <label className="form-label">Item Name</label>
                      <input
                        type="text"
                        className="form-control"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="Enter item name"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Category</label>
                      <input
                        type="text"
                        className="form-control"
                        name="category"
                        value={formData.category}
                        onChange={handleInputChange}
                        placeholder="Enter category (e.g., Beverage, Pastry)"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Subcategory</label>
                      <input
                        type="text"
                        className="form-control"
                        name="subcategory"
                        value={formData.subcategory}
                        onChange={handleInputChange}
                        placeholder="Enter subcategory (e.g., Soft Drink, Croissant)"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Price (Rs.)</label>
                      <input
                        type="number"
                        className="form-control"
                        name="price"
                        value={formData.price}
                        onChange={handleInputChange}
                        placeholder="Enter price"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                    <div className="form-check mb-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        name="soldByWeight"
                        checked={formData.soldByWeight}
                        onChange={handleInputChange}
                      />
                      <label className="form-check-label">Sold by weight</label>
                      <div className="form-text">If checked, quantities will accept decimals (e.g., kg).</div>
                    </div>
                    <div className="form-check mb-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        name="notifyExpiry"
                        checked={formData.notifyExpiry}
                        onChange={handleInputChange}
                      />
                      <label className="form-check-label">Notify on expiry</label>
                      <div className="form-text">If checked, you will receive notifications 2 days before the expiry date.</div>
                    </div>
                  </>
                )}

                {/* Machine Fields */}
                {showMachineFields && (
                  <>
                    <div className="alert alert-info">
                      <i className="fas fa-info-circle me-2"></i>
                      Create a new coffee machine for tracking sales
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Machine Name *</label>
                      <input
                        type="text"
                        className="form-control"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="Enter machine name (e.g., Coffee Machine, Nescafe Machine)"
                        required
                      />
                      <div className="form-text">Unique name for the machine</div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Price per Unit (Rs.) *</label>
                      <input
                        type="number"
                        className="form-control"
                        name="price"
                        value={formData.price}
                        onChange={handleInputChange}
                        placeholder="Enter price per coffee"
                        min="1"
                        step="1"
                        required
                      />
                      <div className="form-text">Price charged for each coffee served</div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    clearForm();
                  }}
                >
                  Close
                </button>
                {showMachineFields ? (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleAddItem}
                  >
                    <i className="fas fa-plus-circle"></i> Create Machine
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddItem}
                  >
                    Add Item
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Normal Item Modal */}
      {showEditModal && editingItem && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Normal Item</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowEditModal(false);
                    clearForm();
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Item Name</label>
                  <input
                    type="text"
                    className="form-control"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                  >
                    {normalCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Subcategory</label>
                  <input
                    type="text"
                    className="form-control"
                    name="subcategory"
                    value={formData.subcategory}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Price (Rs.)</label>
                  <input
                    type="number"
                    className="form-control"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowEditModal(false);
                    clearForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpdateItem}
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Grocery Item Modal */}
      {showEditGroceryModal && editingItem && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Grocery Item</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowEditGroceryModal(false);
                    clearForm();
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Item Name</label>
                  <input
                    type="text"
                    className="form-control"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Category</label>
                  <input
                    type="text"
                    className="form-control"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    placeholder="Enter category"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Subcategory</label>
                  <input
                    type="text"
                    className="form-control"
                    name="subcategory"
                    value={formData.subcategory}
                    onChange={handleInputChange}
                    placeholder="Enter subcategory"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Price (Rs.)</label>
                  <input
                    type="number"
                    className="form-control"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    name="soldByWeight"
                    checked={formData.soldByWeight}
                    onChange={handleInputChange}
                  />
                  <label className="form-check-label">Sold by weight</label>
                  <div className="form-text">If checked, quantities will accept decimals (e.g., kg).</div>
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    name="notifyExpiry"
                    checked={formData.notifyExpiry}
                    onChange={handleInputChange}
                  />
                  <label className="form-check-label">Notify on expiry</label>
                  <div className="form-text">If checked, you will receive notifications 2 days before the expiry date.</div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowEditGroceryModal(false);
                    clearForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpdateItem}
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Machine Modal */}
      {showEditMachineModal && editingItem && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Machine</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowEditMachineModal(false);
                    clearForm();
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info">
                  <i className="fas fa-info-circle me-2"></i>
                  Edit machine details. Category and subcategory are automatically set.
                </div>
                <div className="mb-3">
                  <label className="form-label">Machine Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter machine name (e.g., Coffee Machine, Nescafe Machine)"
                    required
                  />
                  <div className="form-text">Unique name for the machine</div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Price per Unit (Rs.) *</label>
                  <input
                    type="number"
                    className="form-control"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="Enter price per coffee"
                    min="1"
                    step="1"
                    required
                  />
                  <div className="form-text">Price charged for each coffee served</div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowEditMachineModal(false);
                    clearForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpdateItem}
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && itemToDelete && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  Confirm Deletion
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeDeleteModal}
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  Are you sure you want to delete <strong>"{itemToDelete.name}"</strong> ({itemToDelete.itemType})? This action cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeDeleteModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmDelete}
                >
                  <i className="fas fa-trash me-2"></i>Delete Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title">
                  <i className="fas fa-check-circle me-2"></i>
                  Success
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeSuccessModal}
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-0" style={{ fontSize: '1.1rem' }}>
                  {successMessage}
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={closeSuccessModal}
                >
                  <i className="fas fa-check me-2"></i>OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
