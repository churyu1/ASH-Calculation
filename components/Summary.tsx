
import React from 'react';
import { Equipment, UnitSystem } from '../types';
import { useLanguage } from '../i18n';
import DisplayValueWithUnit from './DisplayValueWithUnit';

interface SummaryProps {
    equipmentList: Equipment[];
    totalPressureLoss: number;
    unitSystem: UnitSystem;
}

const Summary: React.FC<SummaryProps> = ({ equipmentList, totalPressureLoss, unitSystem }) => {
    const { t } = useLanguage();

    return (
        <div id="summary-section" className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">{t('app.summary')}</h2>
            <div className="p-4 bg-slate-100 rounded-lg mb-4">
                <h3 className="font-semibold mb-2">{t('app.configuration')}</h3>
                {equipmentList.length > 0 ? (
                    <ol className="list-decimal list-inside">
                        {equipmentList.map(eq => <li key={eq.id} className="text-sm py-1">{eq.name}</li>)}
                    </ol>
                ) : (
                    <p className="text-slate-500">{t('app.noEquipmentAdded')}</p>
                )}
            </div>
            <div className="p-4 bg-slate-100 rounded-lg">
                <h3 className="font-semibold mb-2">{t('app.pressureLoss')}</h3>
                {equipmentList.length > 0 ? (
                    <>
                        <ul className="list-none mb-2">
                            {equipmentList.map(eq => (
                                <li key={eq.id} className="flex justify-between text-sm py-1">
                                    <span>{eq.name}:</span>
                                    <DisplayValueWithUnit value={eq.pressureLoss} unitType="pressure" unitSystem={unitSystem} valueClassName="font-bold" />
                                </li>
                            ))}
                        </ul>
                        <div className="flex justify-between font-bold text-md border-t pt-2 mt-2">
                            <span>{t('app.totalPressureLoss')}</span>
                            <DisplayValueWithUnit value={totalPressureLoss} unitType="pressure" unitSystem={unitSystem} valueClassName="font-bold" />
                        </div>
                    </>
                ) : (
                    <p className="text-slate-500">{t('app.noEquipmentAdded')}</p>
                )}
            </div>
        </div>
    );
};

export default Summary;