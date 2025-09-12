import React from 'react';
import { Project, UnitSystem } from '../types';
import Summary from './Summary.tsx';
import { useLanguage } from '../i18n/index.ts';

interface AllProjectsSummaryProps {
    projects: Project[];
    unitSystem: UnitSystem;
}

const AllProjectsSummary: React.FC<AllProjectsSummaryProps> = ({ projects, unitSystem }) => {
    const { t } = useLanguage();

    if (projects.length === 0) {
        return (
            <div className="p-6 bg-white rounded-lg shadow-md mt-[-1.5rem] border-t-0 rounded-t-none">
                <div className="text-center py-10">
                    <h3 className="text-lg font-semibold text-slate-700">{t('app.allProjectsSummaryTitle')}</h3>
                    <p className="mt-2 text-slate-500">{t('app.noProjects')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-white rounded-lg shadow-md mt-[-1.5rem] border-t-0 rounded-t-none space-y-8">
            <h2 className="text-2xl font-bold text-slate-800 text-center">{t('app.allProjectsSummaryTitle')}</h2>
            {projects.map(project => (
                <div key={project.id}>
                    <h3 className="text-xl font-semibold mb-4 text-slate-700">{project.name}</h3>
                    <Summary
                        equipmentList={project.equipmentList}
                        totalPressureLoss={project.equipmentList.reduce((sum, eq) => sum + (eq.pressureLoss || 0), 0)}
                        unitSystem={unitSystem}
                        acInletAir={project.acInletAir}
                        acOutletAir={project.acOutletAir}
                    />
                </div>
            ))}
        </div>
    );
};

export default AllProjectsSummary;