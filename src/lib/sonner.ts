import { toast } from 'sonner';
import { dialog } from './dialog';

export const sonner = {
  // Success toast (Using Sonner)
  success: (message: string) => {
    return toast.success(message, {
      duration: 3000,
    });
  },

  // Error toast (Using Sonner)
  error: (message: string) => {
    return toast.error(message, {
      duration: 5000,
    });
  },

  // Warning toast (Using Sonner)
  warning: (message: string) => {
    return toast.warning(message, {
      duration: 4000,
    });
  },

  // Info toast (Using Sonner)
  info: (message: string) => {
    return toast.info(message, {
      duration: 3000,
    });
  },

  // Confirmation dialog (Using custom Dialog system)
  confirm: (title: string, text: string, confirmText: string = 'Yes, Proceed!', cancelButtonText: string = 'Cancel') => {
    return dialog.confirm(title, text, confirmText, cancelButtonText);
  },

  // Delete confirmation
  deleteConfirm: (itemName: string) => {
    return dialog.deleteConfirm(itemName);
  },

  // Loading modal
  loading: (title: string = 'Processing...') => {
    return dialog.loading(title);
  },

  // Update active dialog
  update: (title: string, text?: string) => {
    return dialog.update({ title, text });
  },

  // Close loading
  close: () => {
    return dialog.close();
  },

  // Input dialog
  input: (title: string, placeholder: string, inputType: 'text' | 'email' | 'password' | 'number' = 'text') => {
    return dialog.input(title, placeholder, inputType);
  },

  // Alert dialog
  alert: (title: string, text: string, confirmText: string = 'OK') => {
    return dialog.alert(title, text, confirmText);
  },

  // Legacy toast fallback
  toast: (message: string, icon: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    return toast[icon](message);
  },

  // Dismiss all notifications (Sonner + Dialog)
  dismissAll: () => {
    toast.dismiss();
    dialog.close();
  }
};

export default sonner;
