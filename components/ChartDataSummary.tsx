
import React from 'react';
import { Equipment, UnitSystem, AirProperties } from '../types';
import { useLanguage } from '../i18n/index.ts';
import { convertValue, getPrecisionForUnitType } from '../utils/conversions.ts';
import { EQUIPMENT_HEX_COLORS } from '../constants.ts';

interface ChartDataSummaryProps {
    equipmentList: Equipment[];
    globalInletAir: AirProperties;
    globalOutletAir: AirProperties;
    unitSystem: UnitSystem;
}

const ChartDataSummary: React.FC<ChartDataSummaryProps> = ({ equipmentList, globalInletAir, globalOutletAir, unitSystem }) => {
    const { t } = useLanguage();

    const formatTemp = (temp: number | null) => {
        if (temp === null) return '-';
        const converted = convertValue(temp, 'temperature', UnitSystem.SI, unitSystem);
        if (converted === null) return '-';
        return converted.toFixed(getPrecisionForUnitType('temperature', unitSystem));
    };
    
    const formatRh = (rh: number | null) => {
         if (rh === null) return '-';
         return rh.toFixed(getPrecisionForUnitType('rh', unitSystem));
    };

    const temperatureUnit = t(`units.${unitSystem}.temperature`);
    const rhUnit = t(`units.${unitSystem}.rh`);

    return (
        <div className="w-full mb-4 bg-white p-2 rounded-lg shadow-lg border border-slate-200 max-h-[300px] overflow-y-auto">
            <div className="w-full overflow-x-auto" style={{ fontSize: '9px', lineHeight: '1.4' }}>
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th rowSpan={2} className="pb-1 pr-2 text-left font-semibold text-slate-700 align-bottom"></th>
                            <th colSpan={2} className="pb-1 px-1 text-center font-semibold text-slate-700 border-b border-slate-300">{t('chart.inlet')}</th>
                            <th colSpan={2} className="pb-1 px-1 text-center font-semibold text-slate-700 border-b border-slate-300 border-l border-slate-300">{t('chart.outlet')}</th>
                        </tr>
                        <tr className="border-b border-slate-300">
                            <th className="py-1 px-1 text-right font-normal text-slate-600 whitespace-nowrap">T ({temperatureUnit})</th>
                            <th className="py-1 px-1 text-right font-normal text-slate-600 whitespace-nowrap">RH ({rhUnit})</th>
                            <th className="py-1 px-1 text-right font-normal text-slate-600 border-l border-slate-300 whitespace-nowrap">T ({temperatureUnit})</th>
                            <th className="py-1 pl-1 text-right font-normal text-slate-600 whitespace-nowrap">RH ({rhUnit})</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-slate-200 bg-green-50 font-bold">
                            <td className="py-1.5 pr-2 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full inline-block flex-shrink-0 bg-green-500"></span>
                                <span className="truncate" title={t('chart.acInlet')}>{t('chart.acInlet')}</span>
                            </td>
                            <td className="py-1.5 px-1 text-right font-mono">{formatTemp(globalInletAir.temp)}</td>
                            <td className="py-1.5 px-1 text-right font-mono">{formatRh(globalInletAir.rh)}</td>
                            <td className="py-1.5 px-1 text-right font-mono border-l border-slate-300">-</td>
                            <td className="py-1.5 pl-1 text-right font-mono">-</td>
                        </tr>
                        {equipmentList.map(eq => (
                            <tr key={eq.id} className="border-b border-slate-200 last:border-b-0">
                                <td className="py-1.5 pr-2 flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: EQUIPMENT_HEX_COLORS[eq.type] }}></span>
                                    <span className="truncate" title={eq.name}>{eq.name}</span>
                                </td>
                                <td className="py-1.5 px-1 text-right font-mono">{formatTemp(eq.inletAir.temp)}</td>
                                <td className="py-1.5 px-1 text-right font-mono">{formatRh(eq.inletAir.rh)}</td>
                                <td className="py-1.5 px-1 text-right font-mono border-l border-slate-300">{formatTemp(eq.outletAir.temp)}</td>
                                <td className="py-1.5 pl-1 text-right font-mono">{formatRh(eq.outletAir.rh)}</td>
                            </tr>
                        ))}
                         <tr className="border-t border-slate-200 bg-red-50 font-bold">
                            <td className="py-1.5 pr-2 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full inline-block flex-shrink-0 bg-red-600"></span>
                                <span className="truncate" title={t('chart.acOutlet')}>{t('chart.acOutlet')}</span>
                            </td>
                            <td className="py-1.5 px-1 text-right font-mono">-</td>
                            <td className="py-1.5 px-1 text-right font-mono">-</td>
                            <td className="py-1.5 px-1 text-right font-mono border-l border-slate-300">{formatTemp(globalOutletAir.temp)}</td>
                            <td className="py-1.5 pl-1 text-right font-mono">{formatRh(globalOutletAir.rh)}</td>
                        </tr>
                    </tbody>
                </table>
                {equipmentList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-500 py-2">{t('app.noEquipmentAdded')}</td>
                  </tr>
                )}
            </div>
        </div>
    );
};

export default ChartDataSummary;