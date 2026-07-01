/**
 * Global Dialog Controller
 * Replacement for SweetAlert2 to fix double-click focus bugs
 */

type DialogType = 'confirm' | 'delete' | 'input' | 'loading';

interface DialogOptions {
  id: string;
  type: DialogType;
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
  inputType?: 'text' | 'email' | 'password' | 'number';
  resolve: (value: any) => void;
}

// Global state for singleton guard
let activeDialogId: string | null = null;

// Event emitter for cross-component communication
export const dialogEvents = new EventTarget();

export const dialog = {
  confirm: (
    title: string, 
    text: string, 
    confirmText: string = 'YES, PROCEED', 
    cancelText: string = 'CANCEL'
  ): Promise<{ isConfirmed: boolean }> => {
    if (activeDialogId) return Promise.resolve({ isConfirmed: false });

    return new Promise((resolve) => {
      const id = Math.random().toString(36).substring(7);
      activeDialogId = id;

      const event = new CustomEvent('show-dialog', {
        detail: {
          id,
          type: 'confirm',
          title,
          text,
          confirmText,
          cancelText,
          resolve: (isConfirmed: boolean) => {
            activeDialogId = null;
            resolve({ isConfirmed });
          }
        }
      });
      dialogEvents.dispatchEvent(event);
    });
  },

  alert: (
    title: string, 
    text: string, 
    confirmText: string = 'OK'
  ): Promise<void> => {
    if (activeDialogId) return Promise.resolve();

    return new Promise((resolve) => {
      const id = Math.random().toString(36).substring(7);
      activeDialogId = id;

      const event = new CustomEvent('show-dialog', {
        detail: {
          id,
          type: 'confirm',
          title,
          text,
          confirmText,
          cancelText: '', // Empty cancel text to hide it
          resolve: () => {
            activeDialogId = null;
            resolve();
          }
        }
      });
      dialogEvents.dispatchEvent(event);
    });
  },

  deleteConfirm: (itemName: string): Promise<{ isConfirmed: boolean }> => {
    if (activeDialogId) return Promise.resolve({ isConfirmed: false });

    return new Promise((resolve) => {
      const id = Math.random().toString(36).substring(7);
      activeDialogId = id;

      const event = new CustomEvent('show-dialog', {
        detail: {
          id,
          type: 'delete',
          title: 'ARE YOU SURE?',
          text: `You won't be able to revert this! The <span class="text-rose-500">${itemName}</span> will be permanently deleted.`,
          confirmText: 'YES, DELETE IT',
          cancelText: 'CANCEL',
          resolve: (isConfirmed: boolean) => {
            activeDialogId = null;
            resolve({ isConfirmed });
          }
        }
      });
      dialogEvents.dispatchEvent(event);
    });
  },

  // Added input support to match current sonner.ts features
  input: (
    title: string, 
    placeholder: string, 
    inputType: 'text' | 'email' | 'password' | 'number' = 'text'
  ): Promise<{ value: string | null; isConfirmed: boolean }> => {
    if (activeDialogId) return Promise.resolve({ value: null, isConfirmed: false });

    return new Promise((resolve) => {
      const id = Math.random().toString(36).substring(7);
      activeDialogId = id;

      const event = new CustomEvent('show-dialog', {
        detail: {
          id,
          type: 'input',
          title,
          placeholder,
          inputType,
          confirmText: 'SUBMIT',
          cancelText: 'CANCEL',
          resolve: (value: string | null) => {
            activeDialogId = null;
            resolve({ value, isConfirmed: value !== null });
          }
        }
      });
      dialogEvents.dispatchEvent(event);
    });
  },

  loading: (title: string = 'PROCESSING...') => {
    const id = 'loading-dialog';
    const event = new CustomEvent('show-dialog', {
      detail: {
        id,
        type: 'loading',
        title,
        resolve: () => {}
      }
    });
    dialogEvents.dispatchEvent(event);
  },

  update: (options: Partial<DialogOptions>) => {
    const event = new CustomEvent('update-dialog', { detail: options });
    dialogEvents.dispatchEvent(event);
  },

  close: () => {
    const event = new CustomEvent('close-dialog');
    dialogEvents.dispatchEvent(event);
    activeDialogId = null;
  }
};
