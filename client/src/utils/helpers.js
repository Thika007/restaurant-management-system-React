export const getCurrentDate = () => {
  return new Date().toISOString().split('T')[0];
};

export const formatCurrency = (amount) => {
  return `Rs ${parseFloat(amount || 0).toFixed(2)}`;
};

export const formatNumber = (num, decimals = 0) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const number = parseFloat(num);
  if (decimals === 0) {
    return number.toLocaleString();
  }
  return number.toFixed(decimals).replace(/\.?0+$/, '');
};

export const formatDate = (date) => {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const generateItemCode = () => {
  return 'ITEM' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

export const getDateRange = (startDate, endDate) => {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split('T')[0]);
  }
  
  return dates;
};

