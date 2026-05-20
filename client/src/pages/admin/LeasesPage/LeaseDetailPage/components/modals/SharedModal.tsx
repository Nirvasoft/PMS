import { X } from 'lucide-react';
import React from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3><button onClick={onClose}><X size={18}/></button></div>
        {children}
      </div>
    </div>
  );
}
