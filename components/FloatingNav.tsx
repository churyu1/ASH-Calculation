import React from 'react';
import { useLanguage } from '../i18n';

interface FloatingNavProps {
    isTwoColumnLayout: boolean;
    onToggleLayout: () => void;
}

const FloatingNav: React.FC<FloatingNavProps> = ({ isTwoColumnLayout, onToggleLayout }) => {
    const { t } = useLanguage();

    const label = isTwoColumnLayout ? t('fab.toggleToSingleView') : t('fab.toggleToSplitView');

    const icon = isTwoColumnLayout ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9.75 9.75M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L14.25 9.75M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9.75 14.25m10.5 6v-4.5m0 4.5h-4.5m4.5 0L14.25 14.25" />
        </svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h5a2 2 0 002-2V7a2 2 0 00-2-2h-5a2 2 0 00-2 2" />
        </svg>
    );

    return (
        <div className="fixed bottom-6 right-6 z-50">
            <button
                onClick={onToggleLayout}
                className="w-16 h-16 bg-blue-600 rounded-full text-white flex items-center justify-center shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-transform transform hover:scale-110"
                aria-label={label}
            >
                {icon}
            </button>
        </div>
    );
};

export default FloatingNav;