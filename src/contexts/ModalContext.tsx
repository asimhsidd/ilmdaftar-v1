import React, { createContext, useContext, useState, ReactNode } from 'react';

export type ModalType = 'alert' | 'confirm' | 'custom';

export interface ModalOptions {
  type: ModalType;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  customContent?: ReactNode;
}

interface ModalContextType {
  showModal: (options: ModalOptions) => Promise<'confirm' | 'cancel'>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

function normalizeModalMessage(message?: string): string | undefined {
  if (!message) return message;
  const trimmed = message.trim();
  if (trimmed === 'Failed to fetch' || trimmed.includes('ERR_CONNECTION_REFUSED')) {
    return 'Cannot reach the server right now. Please make sure the app server is running, then try again.';
  }
  return message;
}

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    options: ModalOptions;
    resolve: (value: 'confirm' | 'cancel') => void;
  } | null>(null);

  const showModal = (options: ModalOptions): Promise<'confirm' | 'cancel'> => {
    return new Promise((resolve) => {
      setModalState({ options, resolve });
    });
  };

  const handleClose = (result: 'confirm' | 'cancel') => {
    if (modalState) {
      modalState.resolve(result);
      setModalState(null);
    }
  };

  return (
    <ModalContext.Provider value={{ showModal }}>
      {children}
      {modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]">
            <h2 className="text-xl font-bold mb-4 dark:text-zinc-100">{modalState.options.title}</h2>
            
            <div className="overflow-y-auto flex-1 min-h-0 custom-scrollbar">
              {modalState.options.message && (
                <p className="mb-6 text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                  {normalizeModalMessage(modalState.options.message)}
                </p>
              )}
              
              {modalState.options.customContent && (
                <div className="mb-6">
                  {modalState.options.customContent}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              {(modalState.options.type === 'confirm' || modalState.options.type === 'custom') && (
                <button
                  onClick={() => handleClose('cancel')}
                  className="px-4 py-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors font-medium"
                >
                  {modalState.options.cancelText || 'Cancel'}
                </button>
              )}
              <button
                onClick={() => handleClose('confirm')}
                className="px-4 py-2 bg-[#6197EC] dark:bg-zinc-700 text-white rounded-lg hover:bg-[#4C81D9] dark:hover:bg-zinc-600 transition-colors font-medium shadow-md shadow-[#6197EC]/20 dark:shadow-none"
              >
                {modalState.options.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
