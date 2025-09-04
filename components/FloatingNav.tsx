import React, { useState } from 'react';
import { Equipment } from '../types';
import { useLanguage } from '../i18n';

interface FloatingNavProps {
    equipmentList: Equipment[];
}

const FloatingNav: React.FC<FloatingNavProps> = ({ equipmentList }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { t } = useLanguage();

    const toggleMenu = () => setIsOpen(!isOpen);
    const closeMenu = () => setIsOpen(false);

    return (
        <div className="fixed bottom-6 right-6 z-50">
            <div 
                className={`absolute bottom-full right-0 mb-3 transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-4'}`}
                style={{ maxHeight: 'calc(100vh - 10rem)', overflowY: 'auto' }}
            >
                <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-56">
                    <ul className="py-1">
                        <li>
                           <a href="#ac-inlet-conditions" onClick={closeMenu} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 font-semibold">
                                {t('fab.acInlet')}
                            </a>
                        </li>
                        <li>
                           <a href="#psychrometric-chart" onClick={closeMenu} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 font-semibold">
                                {t('fab.chart')}
                            </a>
                        </li>
                        <li>
                           <a href="#summary-section" onClick={closeMenu} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 font-semibold">
                                {t('fab.summary')}
                            </a>
                        </li>
                        
                        {equipmentList.length > 0 && (
                            <>
                                <hr className="my-1"/>
                                {equipmentList.map(eq => (
                                    <li key={eq.id}>
                                        <a href={`#equipment-${eq.id}`} onClick={closeMenu} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 truncate">
                                            {eq.name}
                                        </a>
                                    </li>
                                ))}
                            </>
                        )}
                    </ul>
                </div>
            </div>
            <button
                onClick={toggleMenu}
                className="w-16 h-16 bg-blue-600 rounded-full text-white flex items-center justify-center shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-transform transform hover:scale-110"
                aria-label={t('fab.title')}
                aria-expanded={isOpen}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   {isOpen ? (
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                   ) : (
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                   )}
                </svg>
            </button>
        </div>
    );
};

export default FloatingNav;