import { useEffect } from 'react';
import '../styles/popup-modal.css';

const PopupModal = ({ isOpen, onClose, title, message, type = 'info', onConfirm, onCancel, showCancel = false }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (showCancel && onCancel) {
          onCancel();
        } else if (!showCancel) {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, showCancel, onCancel, onClose]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  const getTypeClass = () => {
    switch (type) {
      case 'success':
        return 'popup-modal-success';
      case 'error':
        return 'popup-modal-error';
      case 'warning':
        return 'popup-modal-warning';
      case 'info':
      default:
        return 'popup-modal-info';
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      if (showCancel && onCancel) {
        onCancel();
      } else if (!showCancel) {
        onClose();
      }
    }
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  return (
    <div className="popup-modal-overlay" onClick={handleBackdropClick}>
      <div className={`popup-modal ${getTypeClass()}`}>
        <div className="popup-modal-header">
          <div className="popup-modal-icon">{getIcon()}</div>
          <h3 className="popup-modal-title">{title}</h3>
          {!showCancel && (
            <button 
              className="popup-modal-close" 
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
        <div className="popup-modal-body">
          <div className="popup-modal-message">
            {message.split('\n').map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        </div>
        <div className="popup-modal-footer">
          {showCancel ? (
            <>
              <button 
                className="popup-modal-btn popup-modal-btn-cancel" 
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button 
                className="popup-modal-btn popup-modal-btn-confirm" 
                onClick={handleConfirm}
                autoFocus
              >
                Confirm
              </button>
            </>
          ) : (
            <button 
              className="popup-modal-btn popup-modal-btn-ok" 
              onClick={onClose}
              autoFocus
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PopupModal;

