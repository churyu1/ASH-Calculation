
import React, { useState, ReactNode } from 'react';
import Modal from './Modal.tsx';
import { useLanguage } from '../i18n/index.ts';

interface FormulaModalTriggerProps {
  content: ReactNode;
  children: ReactNode;
  title?: string;
}

const FormulaModalTrigger: React.FC<FormulaModalTriggerProps> = ({ content, children, title }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();

  const modalTitle = title || t('app.calculationDetails') || "Calculation Details";

  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className="cursor-pointer"
      >
        {children}
      </div>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={modalTitle}>
        <div className="text-white">
          {content}
        </div>
      </Modal>
    </>
  );
};

export default FormulaModalTrigger;
