import { useEffect, useState } from 'react';
import '../styles/toast.css';

const Toast = ({ message, type = 'info', onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Trigger fade out animation
    const timer = setTimeout(() => {
      setIsVisible(false);
      // Remove from DOM after animation
      setTimeout(() => {
        onClose();
      }, 300); // Match CSS animation duration
    }, 2700); // Show for 2.7 seconds, then fade out

    return () => clearTimeout(timer);
  }, [onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
      default:
        return 'ℹ';
    }
  };

  return (
    <div 
      className={`toast toast-${type} ${isVisible ? 'toast-visible' : 'toast-hidden'}`} 
      onClick={onClose}
    >
      <div className="toast-icon">{getIcon()}</div>
      <div className="toast-message">{message}</div>
      <button className="toast-close" onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}>×</button>
    </div>
  );
};

export default Toast;

