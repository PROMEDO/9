/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface AjaxDialogState {
  isOpen: boolean;
  type: 'warn' | 'danger' | 'info' | 'success';
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  isCompleted: boolean;
  successMessage: string;
}

export const INITIAL_AJAX_DIALOG: AjaxDialogState = {
  isOpen: false,
  type: 'info',
  title: '',
  message: '',
  confirmLabel: 'تأكيد',
  onConfirm: () => {},
  isCompleted: false,
  successMessage: '',
};

interface AjaxConfirmModalProps {
  dialog: AjaxDialogState;
  onClose: () => void;
}

export const AjaxConfirmModal: React.FC<AjaxConfirmModalProps> = ({ dialog, onClose }) => {
  if (!dialog.isOpen) return null;

  const confirmText = dialog.confirmLabel || 'تأكيد';

  return (
    <div className="ajax-backdrop" onClick={() => { if (!dialog.isCompleted) onClose(); }}>
      <div className="ajax-box" onClick={(e) => e.stopPropagation()}>
        {dialog.isCompleted ? (
          <div>
            <div className="ajax-icon success">✓</div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px', color: '#10B981' }}>
              تم الإجراء بنجاح!
            </h3>
            <p className="muted" style={{ fontSize: '14px', margin: 0 }}>
              {dialog.successMessage || 'تم تنفيذ العملية وتحديث البيانات بنجاح.'}
            </p>
          </div>
        ) : (
          <div>
            <div className={`ajax-icon ${dialog.type}`}>
              {dialog.type === 'danger' ? '⚠️' : dialog.type === 'warn' ? '❓' : 'ℹ️'}
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 10px' }}>
              {dialog.title}
            </h3>
            <p className="muted" style={{ fontSize: '14px', lineHeight: 1.6, margin: '0 0 22px' }}>
              {dialog.message}
            </p>
            <div className="rw" style={{ justifyContent: 'center', gap: '10px' }}>
              <button
                type="button"
                className={`btn p${dialog.type === 'danger' ? ' d' : ''}`}
                onClick={() => dialog.onConfirm()}
                style={{
                  minWidth: '126px',
                  fontWeight: 800,
                  ...(dialog.type === 'danger'
                    ? {
                        background: '#dc2626',
                        borderColor: '#b91c1c',
                        color: '#ffffff',
                        boxShadow: '0 6px 18px rgba(220, 38, 38, 0.35)',
                      }
                    : {}),
                }}
              >
                {confirmText}
              </button>
              <button
                type="button"
                className="btn"
                onClick={onClose}
                style={{
                  minWidth: '94px',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  border: '1px solid var(--line)',
                  fontWeight: 700,
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
