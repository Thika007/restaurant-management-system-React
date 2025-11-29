import { createContext, useContext, useState, useCallback, useRef } from 'react';
import PopupModal from '../components/PopupModal';

const PopupContext = createContext(null);

export const PopupProvider = ({ children }) => {
  const [popup, setPopup] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    showCancel: false
  });
  
  const resolveRef = useRef(null);

  const closePopup = useCallback(() => {
    setPopup({
      isOpen: false,
      title: '',
      message: '',
      type: 'info',
      showCancel: false
    });
    resolveRef.current = null;
  }, []);

  const showPopup = useCallback((title, message, type = 'info') => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPopup({
        isOpen: true,
        title,
        message,
        type,
        showCancel: false
      });
    });
  }, []);

  const showConfirm = useCallback((title, message, type = 'warning') => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPopup({
        isOpen: true,
        title,
        message,
        type,
        showCancel: true
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
    closePopup();
  }, [closePopup]);

  const handleCancel = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    closePopup();
  }, [closePopup]);

  const handleClose = useCallback(() => {
    // For simple popups (not confirm), resolve as true when closed
    if (!popup.showCancel && resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
    closePopup();
  }, [popup.showCancel, closePopup]);

  return (
    <PopupContext.Provider value={{ showPopup, showConfirm }}>
      {children}
      <PopupModal
        isOpen={popup.isOpen}
        onClose={handleClose}
        title={popup.title}
        message={popup.message}
        type={popup.type}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        showCancel={popup.showCancel}
      />
    </PopupContext.Provider>
  );
};

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return context;
};

