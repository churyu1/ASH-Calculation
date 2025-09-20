
import React from 'react';
import { Equipment, UnitSystem, EquipmentType, BurnerResults, CoolingCoilResults, HeatingCoilResults, SteamHumidifierResults, FilterConditions, FilterResults, SprayWasherResults, FanConditions, FanResults, AirProperties } from '../types';
import { useLanguage } from '../i18n/index.ts';
import DisplayValueWithUnit from './DisplayValueWithUnit.tsx';
import { convertValue, getPrecisionForUnitType, formatNumber } from '../utils/conversions.ts';
import { EQUIPMENT_HEX_COLORS } from '../constants.ts';

interface SummaryProps {
    equipmentList: Equipment[];
    totalPressureLoss: number;
    unitSystem: UnitSystem;
    acInletAir?: AirProperties;
    acOutletAir?: AirProperties;
}

const Summary: React.FC<SummaryProps> = ({ equipmentList, totalPressureLoss, unitSystem, acInletAir, acOutletAir }) => {
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
            {(equipmentList.length > 0 || acInletAir || acOutletAir) ? (
                 <div className="overflow-x-auto relative shadow-md sm:rounded-lg">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-200">
                            <tr>
                                <th rowSpan={2} className="px-6 py-3 align-bottom">
                                    {t('summary.table.equipment')}
                                </th>
                                <th colSpan={2} className="px-6 py-3 text-center border-b border-l border-slate-300">
                                    {t('summary.table.inlet')}
                                </th>
                                <th colSpan={2} className="px-6 py-3 text-center border-b border-l border-slate-300">
                                    {t('summary.table.outlet')}
                                </th>
                                <th rowSpan={2} className="px-6 py-3 align-bottom text-center border-l border-slate-300">
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
                            {acInletAir && (
                                <tr className="bg-green-100 border-b font-semibold text-green-800">
                                    <th scope="row" className="px-6 py-4 whitespace-nowrap">
                                        {t('chart.acInlet')}
                                    </th>
                                    <td className="px-4 py-4 text-right border-l border-slate-200">{formatValue(acInletAir.temp, 'temperature')}</td>
                                    <td className="px-4 py-4 text-right">{formatValue(acInletAir.rh, 'rh')}</td>
                                    <td className="px-4 py-4 text-right border-l border-slate-200">-</td>
                                    <td className="px-4 py-4 text-right">-</td>
                                    <td className="px-6 py-4 border-l border-slate-200">-</td>
                                    <td className="px-6 py-4 border-l border-slate-200 text-right">-</td>
                                </tr>
                            )}
                            {equipmentList.map((eq) => {
                                const results = eq.results;
                                const conditions = eq.conditions;
                                const resultsParts: React.ReactNode[] = [];
                                
                                switch (eq.type) {
                                    case EquipmentType.FILTER: {
                                        const filterCond = conditions as FilterConditions;
                                        const filterRes = results as FilterResults;
                                        if (filterCond.sheets != null) {
                                            resultsParts.push(
                                                <div key="sheets" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('conditions.sheets')}:</span>
                                                    <DisplayValueWithUnit compact value={filterCond.sheets} unitType="sheets" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (filterRes.faceVelocity != null) {
                                            resultsParts.push(
                                                <div key="velocity" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.faceVelocity')}:</span>
                                                    <DisplayValueWithUnit compact value={filterRes.faceVelocity} unitType="velocity" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (filterRes.treatedAirflowPerSheet != null) {
                                            resultsParts.push(
                                                <div key="airflowPerSheet" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.treatedAirflowPerSheet')}:</span>
                                                    <DisplayValueWithUnit compact value={filterRes.treatedAirflowPerSheet} unitType="airflow_per_sheet" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        break;
                                    }
                                    case EquipmentType.BURNER: {
                                        const burnerRes = results as BurnerResults;
                                        if (burnerRes.heatLoad_kW != null) {
                                            resultsParts.push(
                                                <div key="load" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('summary.table.burnerLoad')}:</span>
                                                    <DisplayValueWithUnit compact value={burnerRes.heatLoad_kW} unitType="heat_load" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        break;
                                    }
                                    case EquipmentType.COOLING_COIL: {
                                        const coolRes = results as CoolingCoilResults;
                                        if (coolRes.airSideHeatLoad_kW != null) {
                                            resultsParts.push(
                                                <div key="airLoad" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.airSideHeatLoad')}:</span>
                                                     <DisplayValueWithUnit compact value={coolRes.airSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (coolRes.coldWaterSideHeatLoad_kW != null) {
                                            resultsParts.push(
                                                <div key="waterLoad" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('summary.table.coolingLoad')}:</span>
                                                    <DisplayValueWithUnit compact value={coolRes.coldWaterSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (coolRes.chilledWaterFlow_L_min != null) {
                                            resultsParts.push(
                                                <div key="flow" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('summary.table.coolingFlow')}:</span>
                                                    <DisplayValueWithUnit compact value={coolRes.chilledWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (coolRes.dehumidification_L_min != null) {
                                            resultsParts.push(
                                                <div key="dehumidification" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.dehumidification_L_min')}:</span>
                                                    <DisplayValueWithUnit compact value={coolRes.dehumidification_L_min} unitType="water_flow" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        break;
                                    }
                                    case EquipmentType.HEATING_COIL: {
                                        const heatRes = results as HeatingCoilResults;
                                        if (heatRes.airSideHeatLoad_kW != null) {
                                            resultsParts.push(
                                                <div key="airLoad" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.airSideHeatLoad')}:</span>
                                                    <DisplayValueWithUnit compact value={heatRes.airSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (heatRes.hotWaterSideHeatLoad_kW != null) {
                                             resultsParts.push(
                                                <div key="waterLoad" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('summary.table.heatingLoad')}:</span>
                                                    <DisplayValueWithUnit compact value={heatRes.hotWaterSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (heatRes.hotWaterFlow_L_min != null) {
                                             resultsParts.push(
                                                <div key="flow" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('summary.table.heatingFlow')}:</span>
                                                    <DisplayValueWithUnit compact value={heatRes.hotWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        break;
                                    }
                                    case EquipmentType.SPRAY_WASHER: {
                                        const sprayRes = results as SprayWasherResults;
                                        if (sprayRes.humidification_L_min != null) {
                                            resultsParts.push(
                                                <div key="humidification" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.humidification_L_min')}:</span>
                                                    <DisplayValueWithUnit compact value={sprayRes.humidification_L_min} unitType="water_flow" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (sprayRes.sprayAmount_L_min != null) {
                                            resultsParts.push(
                                                <div key="spray" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.sprayAmount_L_min')}:</span>
                                                    <DisplayValueWithUnit compact value={sprayRes.sprayAmount_L_min} unitType="water_flow" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (sprayRes.humidificationEfficiency != null) {
                                            resultsParts.push(
                                                <div key="efficiency" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('conditions.humidificationEfficiency')}:</span>
                                                    <DisplayValueWithUnit compact value={sprayRes.humidificationEfficiency} unitType="efficiency" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        break;
                                    }
                                    case EquipmentType.STEAM_HUMIDIFIER: {
                                        const steamRes = results as SteamHumidifierResults;
                                        if (steamRes.requiredSteamAmount != null) {
                                            resultsParts.push(
                                                <div key="flow" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('summary.table.steamFlow')}:</span>
                                                    <DisplayValueWithUnit compact value={steamRes.requiredSteamAmount} unitType="steam_flow" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (steamRes.steamAbsolutePressure != null) {
                                            resultsParts.push(
                                                <div key="pressure" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.steamAbsolutePressure')}:</span>
                                                    <DisplayValueWithUnit compact value={steamRes.steamAbsolutePressure} unitType="steam_pressure" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (steamRes.steamTemperature != null) {
                                            resultsParts.push(
                                                <div key="temp" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.steamTemperature')}:</span>
                                                    <DisplayValueWithUnit compact value={steamRes.steamTemperature} unitType="temperature" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (steamRes.steamEnthalpy != null) {
                                            resultsParts.push(
                                                <div key="enthalpy" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.steamEnthalpy')}:</span>
                                                    <DisplayValueWithUnit compact value={steamRes.steamEnthalpy} unitType="steam_enthalpy" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        break;
                                    }
                                    case EquipmentType.FAN: {
                                        const fanCond = conditions as FanConditions;
                                        const fanRes = results as FanResults;
                                        if (fanCond.motorOutput != null) {
                                            resultsParts.push(
                                                <div key="motor" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('conditions.motorOutput')}:</span>
                                                    <DisplayValueWithUnit compact value={fanCond.motorOutput} unitType="motor_power" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                         if (fanRes.heatGeneration_kW != null) {
                                            resultsParts.push(
                                                <div key="heat" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.heatGeneration')}:</span>
                                                     <DisplayValueWithUnit compact value={fanRes.heatGeneration_kW} unitType="heat_load" unitSystem={unitSystem} />
                                                </div>
                                            );
                                        }
                                        if (fanRes.tempRise_deltaT_celsius != null) {
                                            resultsParts.push(
                                                <div key="tempRise" className="flex justify-between items-center gap-2 whitespace-nowrap w-full">
                                                    <span className="text-slate-600">{t('results.tempRise_deltaT_celsius')}:</span>
                                                    <DisplayValueWithUnit compact value={fanRes.tempRise_deltaT_celsius} unitType="temperature" unitSystem={UnitSystem.SI} />
                                                </div>
                                            );
                                        }
                                        break;
                                    }
                                }

                                return (
                                    <tr key={eq.id} className="bg-white border-b">
                                        <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: EQUIPMENT_HEX_COLORS[eq.type] }}></span>
                                            {t(`equipmentNames.${eq.type}`)}
                                        </th>
                                        <td className="px-4 py-4 text-right border-l border-slate-200">{formatValue(eq.inletAir.temp, 'temperature')}</td>
                                        <td className="px-4 py-4 text-right">{formatValue(eq.inletAir.rh, 'rh')}</td>
                                        <td className="px-4 py-4 text-right border-l border-slate-200">{formatValue(eq.outletAir.temp, 'temperature')}</td>
                                        <td className="px-4 py-4 text-right">{formatValue(eq.outletAir.rh, 'rh')}</td>
                                        <td className="px-6 py-4 border-l border-slate-200">
                                            <div className="flex flex-col items-start gap-1">
                                                {resultsParts.length > 0 ? resultsParts : '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right border-l border-slate-200">
                                            {eq.type !== EquipmentType.FAN ? (
                                                <DisplayValueWithUnit compact value={eq.pressureLoss} unitType="pressure" unitSystem={unitSystem} />
                                            ) : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {acOutletAir && (
                                <tr className="bg-red-100 border-b font-semibold text-red-800">
                                    <th scope="row" className="px-6 py-4 whitespace-nowrap">
                                        {t('chart.acOutlet')}
                                    </th>
                                    <td className="px-4 py-4 text-right border-l border-slate-200">-</td>
                                    <td className="px-4 py-4 text-right">-</td>
                                    <td className="px-4 py-4 text-right border-l border-slate-200">{formatValue(acOutletAir.temp, 'temperature')}</td>
                                    <td className="px-4 py-4 text-right">{formatValue(acOutletAir.rh, 'rh')}</td>
                                    <td className="px-6 py-4 border-l border-slate-200">-</td>
                                    <td className="px-6 py-4 border-l border-slate-200 text-right">-</td>
                                </tr>
                            )}
                            {equipmentList.length > 0 && (
                                <tr className="bg-slate-200 font-bold text-slate-800">
                                    <td colSpan={6} className="px-6 py-4 text-right">{t('summary.table.totalPressureLoss')}</td>
                                    <td className="px-6 py-4 text-right border-l border-slate-300">
                                        <DisplayValueWithUnit value={totalPressureLoss} unitType="pressure" unitSystem={unitSystem} />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-10 text-slate-500">
                    {t('app.noEquipmentAdded')}
                </div>
            )}
        </div>
    );
};

export default Summary;
