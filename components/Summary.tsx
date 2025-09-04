import React from 'react';
import { Equipment, UnitSystem, EquipmentType, BurnerResults, CoolingCoilResults, HeatingCoilResults, SteamHumidifierResults } from '../types';
import { useLanguage } from '../i18n';
import DisplayValueWithUnit from './DisplayValueWithUnit';
import { convertValue, getPrecisionForUnitType } from '../utils/conversions';
import { EQUIPMENT_HEX_COLORS } from '../constants';

interface SummaryProps {
    equipmentList: Equipment[];
    totalPressureLoss: number;
    unitSystem: UnitSystem;
}

const Summary: React.FC<SummaryProps> = ({ equipmentList, totalPressureLoss, unitSystem }) => {
    const { t } = useLanguage();

    const formatValue = (value: number | null, unitType: 'temperature' | 'rh') => {
        if (value === null || isNaN(value)) return '-';
        const converted = unitType === 'temperature' ? convertValue(value, 'temperature', UnitSystem.SI, unitSystem) : value;
        if (converted === null) return '-';
        return converted.toFixed(getPrecisionForUnitType(unitType, unitSystem));
    };

    const tempUnit = t(`units.${unitSystem}.temperature`);
    const rhUnit = t(`units.${unitSystem}.rh`);

    return (
        <div id="summary-section" className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">{t('app.summary')}</h2>
            <div className="p-4 bg-slate-100 rounded-lg mb-4">
                <h3 className="font-semibold mb-2">{t('app.configuration')}</h3>
                {equipmentList.length > 0 ? (
                     <div className="overflow-x-auto relative shadow-md sm:rounded-lg">
                        <table className="w-full text-sm text-left text-slate-500">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-200">
                                <tr>
                                    <th rowSpan={2} className="px-6 py-3 align-bottom">
                                        {t('summary.table.equipment')}
                                    </th>
                                    <th colSpan={2} className="px-6 py-3 text-center border-b border-slate-300">
                                        {t('summary.table.inlet')}
                                    </th>
                                    <th colSpan={2} className="px-6 py-3 text-center border-b border-l border-slate-300">
                                        {t('summary.table.outlet')}
                                    </th>
                                    <th rowSpan={2} className="px-6 py-3 align-bottom text-left border-l border-slate-300">
                                        {t('summary.table.keyResults')}
                                    </th>
                                    <th rowSpan={2} className="px-6 py-3 align-bottom text-right border-l border-slate-300">
                                        {t('summary.table.pressureLoss')}
                                    </th>
                                </tr>
                                <tr>
                                    <th className="px-4 py-2 text-right font-medium">{t('summary.table.temp')} ({tempUnit})</th>
                                    <th className="px-4 py-2 text-right font-medium">{t('summary.table.rh')} ({rhUnit})</th>
                                    <th className="px-4 py-2 text-right font-medium border-l border-slate-300">{t('summary.table.temp')} ({tempUnit})</th>
                                    <th className="px-4 py-2 text-right font-medium">{t('summary.table.rh')} ({rhUnit})</th>
                                </tr>
                            </thead>
                            <tbody>
                                {equipmentList.map((eq) => {
                                    const results = eq.results;
                                    const resultsParts: React.ReactNode[] = [];
                                    
                                    switch (eq.type) {
                                        case EquipmentType.BURNER:
                                            const burnerLoad = (results as BurnerResults).heatLoad_kcal;
                                            if (burnerLoad !== null && burnerLoad !== undefined) {
                                                resultsParts.push(
                                                    <div key="load" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                        <span className="text-slate-600">{t('summary.table.burnerLoad')}:</span>
                                                        <DisplayValueWithUnit compact value={burnerLoad} unitType="heat_load" unitSystem={unitSystem} />
                                                    </div>
                                                );
                                            }
                                            break;
                                        case EquipmentType.COOLING_COIL:
                                            const coolingLoad = (results as CoolingCoilResults).coldWaterSideHeatLoad_kcal;
                                            if (coolingLoad !== null && coolingLoad !== undefined) {
                                                resultsParts.push(
                                                    <div key="load" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                        <span className="text-slate-600">{t('summary.table.coolingLoad')}:</span>
                                                        <DisplayValueWithUnit compact value={coolingLoad} unitType="heat_load" unitSystem={unitSystem} />
                                                    </div>
                                                );
                                            }
                                            const coolingFlow = (results as CoolingCoilResults).chilledWaterFlow_L_min;
                                            if (coolingFlow !== null && coolingFlow !== undefined) {
                                                resultsParts.push(
                                                    <div key="flow" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                        <span className="text-slate-600">{t('summary.table.coolingFlow')}:</span>
                                                        <DisplayValueWithUnit compact value={coolingFlow} unitType="water_flow" unitSystem={unitSystem} />
                                                    </div>
                                                );
                                            }
                                            break;
                                        case EquipmentType.HEATING_COIL:
                                            const heatingLoad = (results as HeatingCoilResults).hotWaterSideHeatLoad_kcal;
                                            if (heatingLoad !== null && heatingLoad !== undefined) {
                                                resultsParts.push(
                                                    <div key="load" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                        <span className="text-slate-600">{t('summary.table.heatingLoad')}:</span>
                                                        <DisplayValueWithUnit compact value={heatingLoad} unitType="heat_load" unitSystem={unitSystem} />
                                                    </div>
                                                );
                                            }
                                            const heatingFlow = (results as HeatingCoilResults).hotWaterFlow_L_min;
                                            if (heatingFlow !== null && heatingFlow !== undefined) {
                                                 resultsParts.push(
                                                    <div key="flow" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                        <span className="text-slate-600">{t('summary.table.heatingFlow')}:</span>
                                                        <DisplayValueWithUnit compact value={heatingFlow} unitType="water_flow" unitSystem={unitSystem} />
                                                    </div>
                                                );
                                            }
                                            break;
                                        case EquipmentType.STEAM_HUMIDIFIER:
                                            const steamFlow = (results as SteamHumidifierResults).requiredSteamAmount;
                                            if (steamFlow !== null && steamFlow !== undefined) {
                                                resultsParts.push(
                                                    <div key="flow" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                        <span className="text-slate-600">{t('summary.table.steamFlow')}:</span>
                                                        <DisplayValueWithUnit compact value={steamFlow} unitType="steam_flow" unitSystem={unitSystem} />
                                                    </div>
                                                );
                                            }
                                            break;
                                    }

                                    return (
                                        <tr key={eq.id} className="bg-white border-b last:border-b-0 hover:bg-slate-50">
                                            <th scope="row" className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                                                        style={{ backgroundColor: EQUIPMENT_HEX_COLORS[eq.type] }}
                                                    ></span>
                                                    <span className="truncate">{eq.name}</span>
                                                </div>
                                            </th>
                                            <td className="px-4 py-4 text-right">{formatValue(eq.inletAir.temp, 'temperature')}</td>
                                            <td className="px-4 py-4 text-right">{formatValue(eq.inletAir.rh, 'rh')}</td>
                                            <td className="px-4 py-4 text-right border-l border-slate-200">{formatValue(eq.outletAir.temp, 'temperature')}</td>
                                            <td className="px-4 py-4 text-right">{formatValue(eq.outletAir.rh, 'rh')}</td>
                                            <td className="px-6 py-4 text-left border-l border-slate-200">
                                                {resultsParts.length > 0 ? (
                                                    <div className="flex flex-col gap-0.5 items-start">{resultsParts}</div>
                                                ) : (
                                                    '-'
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right border-l border-slate-200">
                                                 <DisplayValueWithUnit compact value={eq.pressureLoss} unitType="pressure" unitSystem={unitSystem} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-200 font-bold">
                                <tr className="border-t-2 border-slate-300">
                                    <th colSpan={6} scope="row" className="px-6 py-3 text-right text-slate-800 uppercase">
                                        {t('summary.table.totalPressureLoss')}
                                    </th>
                                    <td className="px-6 py-3 text-right">
                                        <DisplayValueWithUnit compact value={totalPressureLoss} unitType="pressure" unitSystem={unitSystem} />
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                ) : (
                    <p className="text-slate-500">{t('app.noEquipmentAdded')}</p>
                )}
            </div>
        </div>
    );
};

export default Summary;