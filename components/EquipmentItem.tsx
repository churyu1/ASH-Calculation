import React, { useEffect, useMemo, useState } from 'react';
import { 
    Equipment, UnitSystem, EquipmentType, AirProperties, 
    CoolingCoilConditions, HeatingCoilConditions, BurnerConditions, FanConditions, 
    FilterConditions, SprayWasherConditions, HotWaterWasherConditions,
    SteamHumidifierConditions, SteamHumidifierResults,
    CoolingCoilResults, HeatingCoilResults, BurnerResults, FanResults, 
    FilterResults, SprayWasherResults, HotWaterWasherResults, CustomResults,
    SteamPressureUnit
} from '../types';
import { calculateAirProperties, calculatePsat, PSYCH_CONSTANTS, calculateSteamProperties, calculateAtmosphericPressure } from '../services/psychrometrics.ts';
import { MOTOR_OUTPUT_CONVERSIONS, MAJOR_GAS_HEATING_VALUES, EQUIPMENT_BG_COLORS } from '../constants.ts';
import { useLanguage } from '../i18n/index.ts';
import NumberInputWithControls from './NumberInputWithControls.tsx';
import DisplayValueWithUnit from './DisplayValueWithUnit.tsx';
import { formatNumber, convertValue, convertSteamPressure, formatNumberForInput, findMotorHp } from '../utils/conversions.ts';
import FormulaTooltipContent from './FormulaTooltipContent.tsx';
import FormulaModalTrigger from './FormulaModalTrigger.tsx';

interface EquipmentItemProps {
    equipment: Equipment;
    index: number;
    totalEquipment: number;
    airflow: number | null;
    systemMassFlowRateDA_kg_s: number;
    altitude: number;
    onUpdate: (id: number, updatedEquipment: Partial<Equipment>) => void;
    onDelete: (id: number) => void;
    unitSystem: UnitSystem;
}

const EquipmentItem: React.FC<EquipmentItemProps> = ({
    equipment, index, totalEquipment, airflow, systemMassFlowRateDA_kg_s, altitude, onUpdate, onDelete, unitSystem
}) => {
    const { id, type, pressureLoss, inletAir, outletAir, conditions, color, results } = equipment;
    const { t, locale } = useLanguage();
    
    const [pressureInputValue, setPressureInputValue] = useState('');
    const [isDescriptionVisible, setIsDescriptionVisible] = useState(false);

    const atmPressure = useMemo(() => calculateAtmosphericPressure(altitude), [altitude]);
    const currentInletAirCalculated = useMemo(() => calculateAirProperties(inletAir.temp, inletAir.rh, atmPressure), [inletAir.temp, inletAir.rh, atmPressure]);
    const currentOutletAirCalculated = useMemo(() => calculateAirProperties(outletAir.temp, outletAir.rh, atmPressure), [outletAir.temp, outletAir.rh, atmPressure]);
    const massFlowRateDA_kg_s = systemMassFlowRateDA_kg_s;
    const bgColor = EQUIPMENT_BG_COLORS[type];

    useEffect(() => {
        if (type === EquipmentType.STEAM_HUMIDIFIER) {
            const steamCond = conditions as SteamHumidifierConditions;
            const currentUnit = steamCond.steamGaugePressureUnit || SteamPressureUnit.KPAG;
            const valueInKpa = steamCond.steamGaugePressure ?? 100;
            
            if (valueInKpa !== null) {
                const valueInCurrentUnit = convertSteamPressure(
                    valueInKpa,
                    SteamPressureUnit.KPAG,
                    currentUnit
                );
                setPressureInputValue(formatNumberForInput(valueInCurrentUnit, currentUnit, unitSystem));
            } else {
                setPressureInputValue('');
            }
        }
    }, [type, conditions, unitSystem]);

    const handleConditionChange = (field: string, value: any) => {
        onUpdate(id, { conditions: { ...conditions, [field]: value } });
    };

    const handleInletChange = (field: 'temp' | 'rh', value: number | null) => {
        const updates: Partial<Equipment> = {
            inletAir: { ...inletAir, [field]: value },
            inletIsLocked: true,
        };
        if (type === EquipmentType.FAN) {
            updates.outletIsLocked = false;
        }
        onUpdate(id, updates);
    };

    const handleOutletChange = (field: 'temp' | 'rh', value: number | null) => {
        const newOutlet = { ...outletAir, [field]: value };
        
        // For steam humidifier, RH drives temp, so clear temp if RH changes
        if (type === EquipmentType.STEAM_HUMIDIFIER && field === 'rh' && value !== null) {
            newOutlet.temp = null;
        }
        
        // The outlet is locked if at least one property is defined by the user.
        const isOutletDefined = newOutlet.temp !== null || newOutlet.rh !== null;
        const updates: Partial<Equipment> = { outletAir: newOutlet, outletIsLocked: isOutletDefined };
        
        if (type === EquipmentType.FAN) {
            // When the outlet is edited (locked or unlocked), the inlet must be unlocked 
            // to allow it to be recalculated either from the outlet (backwards) or from upstream.
            updates.inletIsLocked = false;
        }
        
        onUpdate(id, updates);
    };

    const handlePressureLossChange = (value: number | null) => {
        onUpdate(id, { pressureLoss: value });
    };

    const handleSteamPressureChange = (valueStr: string) => {
        const steamCond = conditions as SteamHumidifierConditions;
        const currentUnit = steamCond.steamGaugePressureUnit || SteamPressureUnit.KPAG;
        setPressureInputValue(valueStr);
        
        let parsedVal = parseFloat(valueStr);
        if (!isNaN(parsedVal)) {
            const valueInKpa = convertSteamPressure(parsedVal, currentUnit, SteamPressureUnit.KPAG);
            handleConditionChange('steamGaugePressure', valueInKpa);
        } else {
            handleConditionChange('steamGaugePressure', null);
        }
    };
    
    const handleSteamUnitChange = (newUnit: SteamPressureUnit) => {
        handleConditionChange('steamGaugePressureUnit', newUnit);
    };

    // Tooltip Memos
    const lowerHeatingValueTooltip = useMemo(() => {
        const formulaPath = 'tooltips.burner.heatingValueReference';
        const unit = t(`units.${unitSystem}.lower_heating_value`);
        const values = MAJOR_GAS_HEATING_VALUES[unitSystem];

        return (
            <div className="flex flex-col gap-2">
                <h4 className="font-bold text-base text-blue-300">{t(`${formulaPath}.title`)}</h4>
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="border-b border-slate-600">
                            <th className="py-1 pr-2 font-semibold text-slate-300 whitespace-nowrap">{t(`${formulaPath}.gasType`)}</th>
                            <th className="py-1 px-2 text-right font-semibold text-slate-300 whitespace-nowrap">{`${t(`${formulaPath}.hhv`)} (${unit})`}</th>
                            <th className="py-1 pl-2 text-right font-semibold text-slate-300 whitespace-nowrap">{`${t(`${formulaPath}.lhv`)} (${unit})`}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {values.map(gas => (
                            <tr key={gas.name} className="border-t border-slate-700">
                                <td className="py-1 pr-2 whitespace-nowrap text-slate-100">{t(`${formulaPath}.gases.${gas.name}`)}</td>
                                <td className="py-1 px-2 text-right font-mono text-slate-100">{formatNumber(gas.hhv)}</td>
                                <td className="py-1 pl-2 text-right font-mono text-slate-100">{formatNumber(gas.lhv)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }, [unitSystem, t, locale]);

    const filterFaceVelocityTooltip = useMemo(() => {
        if (type !== EquipmentType.FILTER || airflow === null) return null;
        const { width = 0, height = 0, sheets = 1 } = conditions as FilterConditions;
        const formulaPath = 'tooltips.filter.faceVelocity';
        const total_area_m2 = (width / 1000) * (height / 1000) * sheets;
        const velocity = results ? (results as FilterResults).faceVelocity : null;
        const values = {
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'a_total': { value: unitSystem === UnitSystem.SI ? total_area_m2 : convertValue(total_area_m2, 'area', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.area`) },
            'v': { value: unitSystem === UnitSystem.SI ? velocity : convertValue(velocity ?? null, 'velocity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.velocity`) }
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, airflow, conditions, unitSystem, t, locale, results]);

    const filterAirflowPerSheetTooltip = useMemo(() => {
        if (type !== EquipmentType.FILTER || airflow === null) return null;
        const { sheets = 1 } = conditions as FilterConditions;
        const formulaPath = 'tooltips.filter.airflowPerSheet';
        const airflowPerSheet = results ? (results as FilterResults).treatedAirflowPerSheet : null;
        const values = {
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'n': { value: sheets, unit: t('units.si.sheets') },
            'q_sheet': { value: unitSystem === UnitSystem.SI ? airflowPerSheet : convertValue(airflowPerSheet ?? null, 'airflow_per_sheet', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow_per_sheet`) }
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, airflow, conditions, unitSystem, t, locale, results]);

    const burnerHeatLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.BURNER || massFlowRateDA_kg_s === 0 || inletAir.enthalpy === null || outletAir.enthalpy === null) return null;
        const formulaPath = 'tooltips.burner.heatLoad';
        const heatLoad_kW = (results as BurnerResults).heatLoad_kW;
        const values = {
            'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'h_in': { value: unitSystem === UnitSystem.SI ? inletAir.enthalpy : convertValue(inletAir.enthalpy, 'enthalpy', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.enthalpy`) },
            'h_out': { value: unitSystem === UnitSystem.SI ? outletAir.enthalpy : convertValue(outletAir.enthalpy, 'enthalpy', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.enthalpy`) },
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'Q': { value: unitSystem === UnitSystem.SI ? heatLoad_kW : convertValue(heatLoad_kW ?? null, 'heat_load', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.heat_load`) },
            'Q_kW': { value: heatLoad_kW, unit: t('units.si.heat_load') },
            'Q_BTUh': { value: convertValue(heatLoad_kW ?? null, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.heat_load') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, unitSystem, t, locale, results]);
    
    const burnerGasFlowTooltip = useMemo(() => {
        if (type !== EquipmentType.BURNER) return null;
        const { heatLoad_kW } = results as BurnerResults;
        const { lowerHeatingValue } = conditions as BurnerConditions;
        if (heatLoad_kW === null || heatLoad_kW === undefined) return null;
        
        const formulaPath = 'tooltips.burner.gasFlowRate';
        const gasFlowRate = (results as BurnerResults).gasFlowRate;
        const values: Record<string, { value: number | null | undefined; unit: string; }> = {
            'Q_kW': { value: heatLoad_kW, unit: t('units.si.heat_load') },
            'Q_BTUh': { value: convertValue(heatLoad_kW, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.heat_load') },
            'H_l': { value: unitSystem === UnitSystem.SI ? lowerHeatingValue : convertValue(lowerHeatingValue ?? null, 'lower_heating_value', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.lower_heating_value`) },
            'V': { value: unitSystem === UnitSystem.SI ? gasFlowRate : convertValue(gasFlowRate ?? null, 'gas_flow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.gas_flow`) },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, results, conditions, unitSystem, t, locale]);

    const coilAirSideHeatLoadTooltip = useMemo(() => {
        if (![EquipmentType.COOLING_COIL, EquipmentType.HEATING_COIL].includes(type) || massFlowRateDA_kg_s === 0 || inletAir.enthalpy === null || outletAir.enthalpy === null) return null;
        const formulaPath = 'tooltips.coil.airSideHeatLoad';
        const airSideHeatLoad_kW = type === EquipmentType.COOLING_COIL ? (results as CoolingCoilResults).airSideHeatLoad_kW : (results as HeatingCoilResults).airSideHeatLoad_kW;
        const values = {
            'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'h_in': { value: unitSystem === UnitSystem.SI ? inletAir.enthalpy : convertValue(inletAir.enthalpy, 'enthalpy', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.enthalpy`) },
            'h_out': { value: unitSystem === UnitSystem.SI ? outletAir.enthalpy : convertValue(outletAir.enthalpy, 'enthalpy', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.enthalpy`) },
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'Q': { value: unitSystem === UnitSystem.SI ? airSideHeatLoad_kW : convertValue(airSideHeatLoad_kW ?? null, 'heat_load', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.heat_load`) },
            'Q_kW': { value: airSideHeatLoad_kW, unit: t('units.si.heat_load') },
            'Q_BTUh': { value: convertValue(airSideHeatLoad_kW ?? null, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.heat_load') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, unitSystem, t, locale, results]);
    
    const coolingCoilWaterSideHeatLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const { coilEfficiency = 85 } = conditions as CoolingCoilConditions;
        const { airSideHeatLoad_kW } = results as CoolingCoilResults;
        if (airSideHeatLoad_kW === null || airSideHeatLoad_kW === undefined) return null;
        const formulaPath = 'tooltips.coil.waterSideHeatLoad_cooling';
        const values = {
            'Q_air': { value: airSideHeatLoad_kW, unit: t('units.si.heat_load') },
            'η': { value: coilEfficiency, unit: t('units.si.efficiency') },
            'Q_water': { value: (results as CoolingCoilResults).coldWaterSideHeatLoad_kW, unit: t(`units.${unitSystem}.heat_load`) },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, conditions, results, unitSystem, t, locale]);

    const heatingCoilWaterSideHeatLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.HEATING_COIL) return null;
        const { coilEfficiency = 85 } = conditions as HeatingCoilConditions;
        const { airSideHeatLoad_kW } = results as HeatingCoilResults;
        if (airSideHeatLoad_kW === null || airSideHeatLoad_kW === undefined) return null;
        const formulaPath = 'tooltips.coil.waterSideHeatLoad_heating';
        const values = {
            'Q_air': { value: airSideHeatLoad_kW, unit: t('units.si.heat_load') },
            'η': { value: coilEfficiency, unit: t('units.si.efficiency') },
            'Q_water': { value: (results as HeatingCoilResults).hotWaterSideHeatLoad_kW, unit: t(`units.${unitSystem}.heat_load`) },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, conditions, results, unitSystem, t, locale]);

    const coilWaterFlowTooltip = useMemo(() => {
        if (![EquipmentType.COOLING_COIL, EquipmentType.HEATING_COIL].includes(type)) return null;
        const formulaPath = 'tooltips.coil.waterFlow';
        let Q_kW: number | undefined, waterTempDiff: number;
        if (type === EquipmentType.COOLING_COIL) {
            const { chilledWaterInletTemp = 7, chilledWaterOutletTemp = 14 } = conditions as CoolingCoilConditions;
            Q_kW = (results as CoolingCoilResults).coldWaterSideHeatLoad_kW;
            waterTempDiff = chilledWaterOutletTemp - chilledWaterInletTemp;
        } else {
            const { hotWaterInletTemp = 80, hotWaterOutletTemp = 50 } = conditions as HeatingCoilConditions;
            Q_kW = (results as HeatingCoilResults).hotWaterSideHeatLoad_kW;
            waterTempDiff = hotWaterInletTemp - hotWaterOutletTemp;
        }
        if (Q_kW === undefined) return null;
        const GPM = type === EquipmentType.COOLING_COIL ? (results as CoolingCoilResults).chilledWaterFlow_L_min : (results as HeatingCoilResults).hotWaterFlow_L_min;
        const values: Record<string, { value: number | null | undefined; unit: string; }> = {
            'Q_kW': { value: Q_kW, unit: t('units.si.heat_load') },
            'Δt_w': { value: unitSystem === UnitSystem.SI ? waterTempDiff : convertValue(waterTempDiff, 'temperature_delta', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.temperature`) },
            'Q_BTUh': { value: convertValue(Q_kW, 'heat_load', UnitSystem.SI, unitSystem), unit: t('units.imperial.heat_load') },
            'L': { value: GPM, unit: 'L/min' },
            'GPM': { value: unitSystem === UnitSystem.SI ? GPM : convertValue(GPM ?? null, 'water_flow', UnitSystem.SI, unitSystem), unit: unitSystem === UnitSystem.SI ? 'L/min' : 'GPM' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, conditions, results, unitSystem, t, locale]);

    const coilDehumidificationTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL || massFlowRateDA_kg_s === 0 || inletAir.absHumidity === null || outletAir.absHumidity === null) return null;
        const formulaPath = 'tooltips.coil.dehumidification';
        const dehumid_L_min = (results as CoolingCoilResults).dehumidification_L_min;
        const values = {
            'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'x_in': { value: unitSystem === UnitSystem.SI ? inletAir.absHumidity : convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'x_out': { value: unitSystem === UnitSystem.SI ? outletAir.absHumidity : convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'D': { value: dehumid_L_min, unit: 'L/min' },
            'D_gpm': { value: unitSystem === UnitSystem.SI ? dehumid_L_min : convertValue(dehumid_L_min ?? null, 'water_flow', UnitSystem.SI, unitSystem), unit: unitSystem === UnitSystem.SI ? 'L/min' : 'GPM' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, unitSystem, t, locale, results]);

    const coilBypassFactorTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const { apparatusDewPointTemp } = results as CoolingCoilResults;
        if (inletAir.temp === null || outletAir.temp === null || apparatusDewPointTemp === undefined || apparatusDewPointTemp === null) return null;
        const formulaPath = 'tooltips.coil.bypassFactor';
        const values = {
            't_in': { value: inletAir.temp, unit: t('units.si.temperature') },
            't_out': { value: outletAir.temp, unit: t('units.si.temperature') },
            't_adp': { value: apparatusDewPointTemp, unit: t('units.si.temperature') },
            'BF': { value: (results as CoolingCoilResults).bypassFactor ? (results as CoolingCoilResults).bypassFactor! / 100 : null, unit: '' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, inletAir.temp, outletAir.temp, results, unitSystem, t, locale]);

    const coilContactFactorTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const { bypassFactor } = results as CoolingCoilResults;
        if (bypassFactor === undefined || bypassFactor === null) return null;
        const formulaPath = 'tooltips.coil.contactFactor';
        const values = { 
            'BF': { value: bypassFactor / 100, unit: '' },
            'CF': { value: (results as CoolingCoilResults).contactFactor ? (results as CoolingCoilResults).contactFactor! / 100 : null, unit: '' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, results, unitSystem, t, locale]);

    const coilAdpTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const { bypassFactor = 5 } = conditions as CoolingCoilConditions;
        const { apparatusDewPointTemp } = results as CoolingCoilResults;
        const isSensible = apparatusDewPointTemp !== undefined && outletAir.absHumidity !== null && inletAir.absHumidity !== null && Math.abs(outletAir.absHumidity - inletAir.absHumidity) < 1e-6;
        const formulaPath = isSensible ? 'tooltips.coil.apparatusDewPointTempSensible' : 'tooltips.coil.apparatusDewPointTemp';
        const values = {
            't_in': { value: unitSystem === UnitSystem.SI ? inletAir.temp : convertValue(inletAir.temp, 'temperature', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.temperature`) },
            't_out': { value: unitSystem === UnitSystem.SI ? outletAir.temp : convertValue(outletAir.temp, 'temperature', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.temperature`) },
            'BF': { value: bypassFactor / 100, unit: '' },
            'rh_in': { value: inletAir.rh, unit: t('units.si.rh') },
            't_adp': { value: unitSystem === UnitSystem.SI ? apparatusDewPointTemp : convertValue(apparatusDewPointTemp ?? null, 'temperature', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.temperature`) },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, inletAir, outletAir, conditions, results, unitSystem, t, locale]);
    
    const sprayWasherHumidificationTooltip = useMemo(() => {
        if ((type !== EquipmentType.SPRAY_WASHER && type !== EquipmentType.HOT_WATER_WASHER) || massFlowRateDA_kg_s === 0 || inletAir.absHumidity === null || outletAir.absHumidity === null) return null;
        const formulaPath = 'tooltips.spray_washer.humidification';
        const humid_L_min = type === EquipmentType.SPRAY_WASHER ? (results as SprayWasherResults).humidification_L_min : (results as HotWaterWasherResults).humidification_L_min;
        const values = {
            'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'x_in': { value: unitSystem === UnitSystem.SI ? inletAir.absHumidity : convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'x_out': { value: unitSystem === UnitSystem.SI ? outletAir.absHumidity : convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'M': { value: humid_L_min, unit: 'L/min' },
            'M_gpm': { value: unitSystem === UnitSystem.SI ? humid_L_min : convertValue(humid_L_min ?? null, 'water_flow', UnitSystem.SI, unitSystem), unit: unitSystem === UnitSystem.SI ? 'L/min' : 'GPM' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, unitSystem, t, locale, results]);

    const sprayWasherSprayAmountTooltip = useMemo(() => {
        if ((type !== EquipmentType.SPRAY_WASHER && type !== EquipmentType.HOT_WATER_WASHER) || massFlowRateDA_kg_s === 0) return null;
        const { waterToAirRatio = 0.8 } = conditions as (SprayWasherConditions | HotWaterWasherConditions);
        const formulaPath = 'tooltips.spray_washer.sprayAmount';
        const spray_L_min = type === EquipmentType.SPRAY_WASHER ? (results as SprayWasherResults).sprayAmount_L_min : (results as HotWaterWasherResults).sprayAmount_L_min;
        const values = {
            'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'L/G': { value: waterToAirRatio, unit: '' },
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'ρ': { value: unitSystem === UnitSystem.SI ? currentInletAirCalculated.density : convertValue(currentInletAirCalculated.density ?? null, 'density', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.density`) },
            'S': { value: spray_L_min, unit: 'L/min' },
            'S_gpm': { value: unitSystem === UnitSystem.SI ? spray_L_min : convertValue(spray_L_min ?? null, 'water_flow', UnitSystem.SI, unitSystem), unit: unitSystem === UnitSystem.SI ? 'L/min' : 'GPM' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, massFlowRateDA_kg_s, conditions, airflow, currentInletAirCalculated.density, unitSystem, t, locale, results]);

    const sprayWasherEfficiencyTooltip = useMemo(() => {
        if ((type !== EquipmentType.SPRAY_WASHER && type !== EquipmentType.HOT_WATER_WASHER) || inletAir.absHumidity === null || outletAir.absHumidity === null) return null;
        const washerResults = results as (SprayWasherResults | HotWaterWasherResults);
        const { humidificationEfficiency, x_sat_g_kg } = washerResults;
        
        const formulaPath = 'tooltips.spray_washer.humidificationEfficiency';
        const values = {
            'x_in': { value: unitSystem === UnitSystem.SI ? inletAir.absHumidity : convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'x_out': { value: unitSystem === UnitSystem.SI ? outletAir.absHumidity : convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'x_sat': { value: unitSystem === UnitSystem.SI ? (x_sat_g_kg || 0) : convertValue(x_sat_g_kg || 0, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'η': { value: humidificationEfficiency, unit: t('units.si.efficiency') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, inletAir.absHumidity, outletAir.absHumidity, results, unitSystem, t, locale]);

    const hotWaterWasherHeatLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.HOT_WATER_WASHER || massFlowRateDA_kg_s === 0 || inletAir.enthalpy === null || outletAir.enthalpy === null) return null;
        const formulaPath = 'tooltips.hot_water_washer.heatLoad';
        const heatLoad_kW = (results as HotWaterWasherResults).heatLoad_kW;
        const values = {
            'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'h_in': { value: unitSystem === UnitSystem.SI ? inletAir.enthalpy : convertValue(inletAir.enthalpy, 'enthalpy', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.enthalpy`) },
            'h_out': { value: unitSystem === UnitSystem.SI ? outletAir.enthalpy : convertValue(outletAir.enthalpy, 'enthalpy', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.enthalpy`) },
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'Q': { value: unitSystem === UnitSystem.SI ? heatLoad_kW : convertValue(heatLoad_kW ?? null, 'heat_load', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.heat_load`) },
            'Q_BTUh': { value: convertValue(heatLoad_kW ?? null, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.heat_load') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, unitSystem, t, locale, results]);

    const hotWaterWasherMakeupWaterHeatingLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.HOT_WATER_WASHER) return null;
        const { hotWaterInletTemp = 40, makeupWaterTemp = 10 } = conditions as HotWaterWasherConditions;
        const { humidification_L_min = 0 } = results as HotWaterWasherResults;
        const humidification_kg_s = humidification_L_min / 60;
        const makeupWaterHeatingLoad_kW = (results as HotWaterWasherResults).makeupWaterHeatingLoad_kW;
        
        const formulaPath = 'tooltips.hot_water_washer.makeupWaterHeatingLoad';
        const values = {
            'M': { value: unitSystem === UnitSystem.SI ? humidification_kg_s : humidification_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'T_hw': { value: unitSystem === UnitSystem.SI ? hotWaterInletTemp : convertValue(hotWaterInletTemp, 'temperature', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.temperature`) },
            'T_m': { value: unitSystem === UnitSystem.SI ? makeupWaterTemp : convertValue(makeupWaterTemp, 'temperature', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.temperature`) },
            'M_lbh': { value: convertValue(humidification_kg_s, 'water_flow', UnitSystem.SI, UnitSystem.IMPERIAL) * 60, unit: 'lb/h' }, // Assuming density of water is 1kg/L
            'Cp': { value: unitSystem === UnitSystem.SI ? 4.186 : 1.0, unit: unitSystem === UnitSystem.SI ? 'kJ/kg·K' : 'BTU/lb·°F' },
            'Q_m': { value: unitSystem === UnitSystem.SI ? makeupWaterHeatingLoad_kW : convertValue(makeupWaterHeatingLoad_kW ?? null, 'heat_load', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.heat_load`) },
            'Q_m_BTUh': { value: convertValue(makeupWaterHeatingLoad_kW ?? null, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.heat_load') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, conditions, results, unitSystem, t, locale]);

    const steamHumidifierRequiredSteamTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER || massFlowRateDA_kg_s === 0 || inletAir.absHumidity === null || outletAir.absHumidity === null) return null;
        const formulaPath = 'tooltips.steam_humidifier.requiredSteam';
        const requiredSteamAmount_kg_h = (results as SteamHumidifierResults).requiredSteamAmount;
        const values = {
            'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'x_in': { value: unitSystem === UnitSystem.SI ? inletAir.absHumidity : convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'x_out': { value: unitSystem === UnitSystem.SI ? outletAir.absHumidity : convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.abs_humidity`) },
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'M': { value: requiredSteamAmount_kg_h, unit: 'kg/h' },
            'M_lbh': { value: convertValue(requiredSteamAmount_kg_h ?? null, 'steam_flow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'lb/h' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, unitSystem, t, locale, results]);

    const steamHumidifierPressureTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER) return null;
        const { steamGaugePressure = 100 } = conditions as SteamHumidifierConditions;
        const formulaPath = 'tooltips.steam_humidifier.steamAbsolutePressure';
        const absolutePressure = (results as SteamHumidifierResults).steamAbsolutePressure;
        const values = {
            'P_gauge': { value: unitSystem === UnitSystem.SI ? steamGaugePressure : convertValue(steamGaugePressure, 'steam_pressure', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.steam_pressure`) },
            'P_atm': { value: unitSystem === UnitSystem.SI ? atmPressure / 1000 : convertValue(atmPressure / 1000, 'steam_pressure', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.steam_pressure`) },
            'P_abs': { value: unitSystem === UnitSystem.SI ? absolutePressure : convertValue(absolutePressure ?? null, 'steam_pressure', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.steam_pressure`) },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, conditions, unitSystem, t, locale, atmPressure, results]);

    const steamHumidifierPropertiesTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER) return null;
        const { steamAbsolutePressure, steamTemperature, steamEnthalpy } = results as SteamHumidifierResults;
        if (steamAbsolutePressure === undefined) return null;
        const formulaPath = 'tooltips.steam_humidifier.steamProperties';
        const values = {
            'P_abs': { value: unitSystem === UnitSystem.SI ? steamAbsolutePressure : convertValue(steamAbsolutePressure, 'steam_pressure', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.steam_pressure`) },
            'T_steam': { value: unitSystem === UnitSystem.SI ? steamTemperature : convertValue(steamTemperature ?? null, 'temperature', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.temperature`) },
            'h_steam': { value: unitSystem === UnitSystem.SI ? steamEnthalpy : convertValue(steamEnthalpy ?? null, 'steam_enthalpy', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.steam_enthalpy`) },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, results, unitSystem, t, locale]);

    const fanHeatGenerationTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN) return null;
        const { motorEfficiency = 80 } = conditions as FanConditions;
        const { motorOutput_kW = 0.75, heatGeneration_kW } = results as FanResults;
        const formulaPath = 'tooltips.fan.heatGeneration';
        const values: Record<string, { value: number | null | undefined; unit: string; }> = {
            'P': { value: unitSystem === UnitSystem.SI ? motorOutput_kW : convertValue(motorOutput_kW, 'motor_power', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.motor_power`) },
            'P_kW': { value: motorOutput_kW, unit: t('units.si.motor_power') },
            'P_HP': { value: convertValue(motorOutput_kW, 'motor_power', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.motor_power') },
            'η': { value: motorEfficiency, unit: t('units.si.efficiency') },
            'Q': { value: unitSystem === UnitSystem.SI ? heatGeneration_kW : convertValue(heatGeneration_kW ?? null, 'heat_load', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.heat_load`) },
            'Q_kW': { value: heatGeneration_kW, unit: t('units.si.heat_load') },
            'Q_BTUh': { value: convertValue(heatGeneration_kW ?? null, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.heat_load') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, conditions, unitSystem, t, locale, results]);

    const fanTempRiseTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN || massFlowRateDA_kg_s === 0) return null;
        const { heatGeneration_kW } = results as FanResults;
        const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * ((inletAir.absHumidity || 0) / 1000);
        const formulaPath = 'tooltips.fan.tempRise';
        const deltaT = (results as FanResults).tempRise_deltaT_celsius;
        const values: Record<string, { value: number | null | undefined; unit: string; }> = {
            'Q_kW': { value: heatGeneration_kW, unit: t('units.si.heat_load') },
            'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 2.20462, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/s' },
            'Cpa_moist': { value: c_pa_moist, unit: 'kJ/kg·K' },
            'Q_BTUh': { value: convertValue(heatGeneration_kW, 'heat_load', UnitSystem.SI, unitSystem), unit: t('units.imperial.heat_load') },
            'q': { value: unitSystem === UnitSystem.SI ? airflow : convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'Δt': { value: unitSystem === UnitSystem.SI ? deltaT : convertValue(deltaT ?? null, 'temperature_delta', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.temperature`) },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [type, results, massFlowRateDA_kg_s, inletAir.absHumidity, airflow, unitSystem, t, locale]);

    const inletAbsHumidityTooltip = useMemo(() => {
        if (inletAir.temp === null || inletAir.rh === null) return null;
        const { temp, rh } = inletAir;
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh';
        const P_sat = calculatePsat(temp);
        const P_v = P_sat * (rh / 100);
        const values: Record<string, { value: number | null | undefined; unit: string; }> = unitSystem === UnitSystem.SI ? {
            't': { value: temp, unit: t('units.si.temperature') },
            'rh': { value: rh, unit: t('units.si.rh') },
            'P_sat': { value: P_sat, unit: 'Pa' },
            'P_v': { value: P_v, unit: 'Pa' },
            'x': { value: currentInletAirCalculated.absHumidity, unit: t('units.si.abs_humidity') },
        } : {
            't_f': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.temperature') },
            'rh': { value: rh, unit: t('units.imperial.rh') },
            'P_v': { value: P_v, unit: 'Pa' },
            'x': { value: convertValue(currentInletAirCalculated.absHumidity ?? null, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.abs_humidity') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [inletAir.temp, inletAir.rh, currentInletAirCalculated.absHumidity, unitSystem, t, locale]);

    const inletEnthalpyTooltip = useMemo(() => {
        const { temp, absHumidity } = inletAir;
        if (temp === null || absHumidity === null) return null;
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const values: Record<string, { value: number | null | undefined; unit: string; }> = unitSystem === UnitSystem.SI ? {
            't': { value: temp, unit: t('units.si.temperature') },
            'x': { value: absHumidity, unit: t('units.si.abs_humidity') },
            'h': { value: currentInletAirCalculated.enthalpy, unit: t('units.si.enthalpy') },
        } : {
            't': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.temperature') },
            'x': { value: convertValue(absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.abs_humidity') },
            'h': { value: convertValue(currentInletAirCalculated.enthalpy ?? null, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.enthalpy') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [inletAir.temp, inletAir.absHumidity, currentInletAirCalculated.enthalpy, unitSystem, t, locale]);

    const outletAbsHumidityTooltip = useMemo(() => {
        if (outletAir.temp === null || outletAir.rh === null) return null;
        const { temp, rh } = outletAir;
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh';
        const P_sat = calculatePsat(temp);
        const P_v = P_sat * (rh / 100);
        const values: Record<string, { value: number | null | undefined; unit: string; }> = unitSystem === UnitSystem.SI ? {
            't': { value: temp, unit: t('units.si.temperature') },
            'rh': { value: rh, unit: t('units.si.rh') },
            'P_sat': { value: P_sat, unit: 'Pa' },
            'P_v': { value: P_v, unit: 'Pa' },
            'x': { value: currentOutletAirCalculated.absHumidity, unit: t('units.si.abs_humidity') },
        } : {
            't_f': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.temperature') },
            'rh': { value: rh, unit: t('units.imperial.rh') },
            'P_v': { value: P_v, unit: 'Pa' },
            'x': { value: convertValue(currentOutletAirCalculated.absHumidity ?? null, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.abs_humidity') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [outletAir.temp, outletAir.rh, currentOutletAirCalculated.absHumidity, unitSystem, t, locale]);

    const outletEnthalpyTooltip = useMemo(() => {
        const { temp, absHumidity } = outletAir;
        if (temp === null || absHumidity === null) return null;
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const values: Record<string, { value: number | null | undefined; unit: string; }> = unitSystem === UnitSystem.SI ? {
            't': { value: temp, unit: t('units.si.temperature') },
            'x': { value: absHumidity, unit: t('units.si.abs_humidity') },
            'h': { value: currentOutletAirCalculated.enthalpy, unit: t('units.si.enthalpy') },
        } : {
            't': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.temperature') },
            'x': { value: convertValue(absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.abs_humidity') },
            'h': { value: convertValue(currentOutletAirCalculated.enthalpy ?? null, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.enthalpy') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={t(`${formulaPath}.${unitSystem}.legend`)} values={values} />;
    }, [outletAir.temp, outletAir.absHumidity, currentOutletAirCalculated.enthalpy, unitSystem, t, locale]);


    const renderAirProperties = (airProps: AirProperties, calculatedProps: AirProperties, title: string, isOutlet = false) => (
        <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
            <h3 className="font-semibold mb-2">{title}</h3>
            <div className="space-y-3">
                {isOutlet ? (
                     <>
                        <div className="flex flex-col gap-1">
                            <label className="text-sm text-slate-700 block">{t('airProperties.temperature')}</label>
                            {type === EquipmentType.STEAM_HUMIDIFIER ? (
                                <div className="flex justify-end"><DisplayValueWithUnit value={airProps.temp} unitType="temperature" unitSystem={unitSystem} /></div>
                            ) : (
                                <NumberInputWithControls value={airProps.temp} onChange={(val) => handleOutletChange('temp', val)} unitType="temperature" unitSystem={unitSystem} />
                            )}
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-sm text-slate-700 block">{t('airProperties.rh')}</label>
                            {type === EquipmentType.STEAM_HUMIDIFIER || type === EquipmentType.CUSTOM || type === EquipmentType.FAN ? (
                                <NumberInputWithControls value={airProps.rh} onChange={(val) => handleOutletChange('rh', val)} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                            ) : (
                                <div className="flex justify-end"><DisplayValueWithUnit value={calculatedProps.rh} unitType="rh" unitSystem={unitSystem} /></div>
                            )}
                        </div>
                     </>
                ) : (
                     <>
                        <div className="flex flex-col gap-1">
                            <label className="text-sm text-slate-700 block">{t('airProperties.temperature')}</label>
                            <NumberInputWithControls value={airProps.temp} onChange={(val) => handleInletChange('temp', val)} unitType="temperature" unitSystem={unitSystem} />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-sm text-slate-700 block">{t('airProperties.rh')}</label>
                            <NumberInputWithControls value={airProps.rh} onChange={(val) => handleInletChange('rh', val)} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                        </div>
                    </>
                )}
                 <hr className="my-2 border-slate-300" />
                <div className="flex justify-between items-center">
                    <span className="text-sm">{t('airProperties.abs_humidity')}</span>
                    <DisplayValueWithUnit value={calculatedProps.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={isOutlet ? outletAbsHumidityTooltip : inletAbsHumidityTooltip} />
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm">{t('airProperties.enthalpy')}</span>
                    <DisplayValueWithUnit value={calculatedProps.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={isOutlet ? outletEnthalpyTooltip : inletEnthalpyTooltip} />
                </div>
            </div>
        </div>
    );
    
    return (
        <div id={`equipment-${id}`} className={`p-4 rounded-lg shadow-md border-2 ${bgColor} ${color}`}>
             <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-semibold">{index + 1}. {equipment.name || t(`equipmentNames.${type}`)}</h2>
                <div className="flex items-center gap-2">
                     <button
                        onClick={() => setIsDescriptionVisible(!isDescriptionVisible)}
                        className="p-1.5 rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 transition-transform duration-300"
                        style={{ transform: isDescriptionVisible ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        title={t('app.toggleExpand')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <button onClick={() => onDelete(id)} className="p-1.5 rounded-md bg-red-500 text-white hover:bg-red-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isDescriptionVisible ? 'max-h-96 pt-0 pb-4' : 'max-h-0'}`}>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-slate-700">
                    <p className="whitespace-pre-wrap">{t(`equipmentDescriptions.${type}`)}</p>
                </div>
            </div>
            <>
                {type === EquipmentType.FILTER ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="md:col-span-2 lg:col-span-1 xl:col-span-2 p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.airConditions')}</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.temperature')}</span>
                                    <DisplayValueWithUnit value={currentInletAirCalculated.temp} unitType="temperature" unitSystem={unitSystem} />
                                </div>
                                <hr className="border-slate-200" />
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.rh')}</span>
                                    <DisplayValueWithUnit value={currentInletAirCalculated.rh} unitType="rh" unitSystem={unitSystem} />
                                </div>
                                <hr className="border-slate-200" />
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.abs_humidity')}</span>
                                    <DisplayValueWithUnit value={currentInletAirCalculated.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={inletAbsHumidityTooltip} />
                                </div>
                                <hr className="border-slate-200" />
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.enthalpy')}</span>
                                    <DisplayValueWithUnit value={currentInletAirCalculated.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={inletEnthalpyTooltip} />
                                </div>
                            </div>
                        </div>
                         <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.conditions')}</h3>
                            <div className="space-y-3">
                                <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.width')}</label><NumberInputWithControls value={(conditions as FilterConditions).width ?? null} onChange={(val) => handleConditionChange('width', val)} unitType="length" unitSystem={unitSystem} /></div>
                                <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.height')}</label><NumberInputWithControls value={(conditions as FilterConditions).height ?? null} onChange={(val) => handleConditionChange('height', val)} unitType="length" unitSystem={unitSystem} /></div>
                                <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.thickness')}</label><NumberInputWithControls value={(conditions as FilterConditions).thickness ?? null} onChange={(val) => handleConditionChange('thickness', val)} unitType="length" unitSystem={unitSystem} /></div>
                                <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.sheets')}</label><NumberInputWithControls value={(conditions as FilterConditions).sheets ?? null} onChange={(val) => handleConditionChange('sheets', val)} unitType="sheets" unitSystem={unitSystem} /></div>
                                <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('equipment.pressureLoss')}</label><NumberInputWithControls value={pressureLoss} onChange={handlePressureLossChange} unitType="pressure" unitSystem={unitSystem} /></div>
                            </div>
                        </div>
                        <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.results')}</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-sm">{t('results.faceVelocity')}</span><DisplayValueWithUnit value={(results as FilterResults).faceVelocity} unitType="velocity" unitSystem={unitSystem} tooltipContent={filterFaceVelocityTooltip} /></div>
                                <div className="flex justify-between items-center"><span className="text-sm">{t('results.treatedAirflowPerSheet')}</span><DisplayValueWithUnit value={(results as FilterResults).treatedAirflowPerSheet} unitType="airflow_per_sheet" unitSystem={unitSystem} tooltipContent={filterAirflowPerSheetTooltip} /></div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-6">
                        {renderAirProperties(inletAir, currentInletAirCalculated, t('equipment.inletAir'))}
                        {renderAirProperties(outletAir, outletAir, t('equipment.outletAir'), true)}
                         <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.conditions')}</h3>
                            <div className="space-y-3">
                                {type === EquipmentType.BURNER && (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-sm text-slate-700 block">{t('conditions.shf')}</label>
                                            <NumberInputWithControls value={(conditions as BurnerConditions).shf ?? null} onChange={(val) => handleConditionChange('shf', val)} unitType="shf" unitSystem={unitSystem} min={0} max={1} step={0.01}/>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-sm text-slate-700 block">
                                                <FormulaModalTrigger content={lowerHeatingValueTooltip} title={t('tooltips.burner.heatingValueReference.title')}>
                                                    <span className="border-b border-dashed border-slate-500 cursor-help">
                                                        {t('conditions.lowerHeatingValue')}
                                                    </span>
                                                </FormulaModalTrigger>
                                            </label>
                                            <NumberInputWithControls value={(conditions as BurnerConditions).lowerHeatingValue ?? null} onChange={(val) => handleConditionChange('lowerHeatingValue', val)} unitType="lower_heating_value" unitSystem={unitSystem} step={0.1}/>
                                        </div>
                                    </>
                                )}
                                {type === EquipmentType.COOLING_COIL && (
                                    <>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.chilledWaterInletTemp')}</label><NumberInputWithControls value={(conditions as CoolingCoilConditions).chilledWaterInletTemp ?? null} onChange={(val) => handleConditionChange('chilledWaterInletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.chilledWaterOutletTemp')}</label><NumberInputWithControls value={(conditions as CoolingCoilConditions).chilledWaterOutletTemp ?? null} onChange={(val) => handleConditionChange('chilledWaterOutletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('results.bypassFactor')}</label><NumberInputWithControls value={(conditions as CoolingCoilConditions).bypassFactor ?? null} onChange={(val) => handleConditionChange('bypassFactor', val)} unitType="efficiency" unitSystem={unitSystem} min={0} max={100} /></div>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.coilEfficiency')}</label><NumberInputWithControls value={(conditions as CoolingCoilConditions).coilEfficiency ?? null} onChange={(val) => handleConditionChange('coilEfficiency', val)} unitType="efficiency" unitSystem={unitSystem} min={0} max={100}/></div>
                                    </>
                                )}
                                {type === EquipmentType.HEATING_COIL && (
                                    <>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.hotWaterInletTemp')}</label><NumberInputWithControls value={(conditions as HeatingCoilConditions).hotWaterInletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterInletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.hotWaterOutletTemp')}</label><NumberInputWithControls value={(conditions as HeatingCoilConditions).hotWaterOutletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterOutletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.coilEfficiency')}</label><NumberInputWithControls value={(conditions as HeatingCoilConditions).coilEfficiency ?? null} onChange={(val) => handleConditionChange('coilEfficiency', val)} unitType="efficiency" unitSystem={unitSystem} /></div>
                                    </>
                                )}
                                {type === EquipmentType.SPRAY_WASHER && (
                                     <div className="flex flex-col gap-1">
                                        <label className="text-sm text-slate-700 block">{t('conditions.waterToAirRatio')}</label>
                                        <NumberInputWithControls value={(conditions as SprayWasherConditions).waterToAirRatio ?? null} onChange={(val) => handleConditionChange('waterToAirRatio', val)} unitType="water_to_air_ratio" unitSystem={unitSystem} step={0.1}/>
                                     </div>
                                )}
                                {type === EquipmentType.HOT_WATER_WASHER && (
                                    <>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.hotWaterInletTemp')}</label><NumberInputWithControls value={(conditions as HotWaterWasherConditions).hotWaterInletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterInletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.makeupWaterTemp')}</label><NumberInputWithControls value={(conditions as HotWaterWasherConditions).makeupWaterTemp ?? null} onChange={(val) => handleConditionChange('makeupWaterTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.waterToAirRatio')}</label><NumberInputWithControls value={(conditions as HotWaterWasherConditions).waterToAirRatio ?? null} onChange={(val) => handleConditionChange('waterToAirRatio', val)} unitType="water_to_air_ratio" unitSystem={unitSystem} step={0.1}/></div>
                                    </>
                                )}
                                {type === EquipmentType.STEAM_HUMIDIFIER && (
                                    <div className="flex flex-col gap-1">
                                        <label className="text-sm text-slate-700 block">{t('conditions.steamGaugePressure')}</label>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                step="10"
                                                value={pressureInputValue}
                                                onChange={(e) => handleSteamPressureChange(e.target.value)}
                                                className="flex-grow w-0 px-2 py-1 border border-slate-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <select
                                                value={(conditions as SteamHumidifierConditions).steamGaugePressureUnit || SteamPressureUnit.KPAG}
                                                onChange={(e) => handleSteamUnitChange(e.target.value as SteamPressureUnit)}
                                                className="flex-shrink-0 px-2 py-1 border border-slate-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            >
                                                {Object.values(SteamPressureUnit).map(unit => (
                                                    <option key={unit} value={unit}>{t(`units.pressure_units.${unit}`)}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                {type === EquipmentType.FAN && (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-sm text-slate-700 block">{t('conditions.motorOutput')}</label>
                                            <select 
                                                value={(conditions as FanConditions).motorOutput ?? ''} 
                                                onChange={(e) => handleConditionChange('motorOutput', parseFloat(e.target.value))}
                                                className="w-full px-2 py-1 border border-slate-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="" disabled>{t('app.select')}</option>
                                                {MOTOR_OUTPUT_CONVERSIONS.map(o => (
                                                    <option key={o.kw} value={o.kw}>{unitSystem === UnitSystem.SI ? `${o.kw} kW` : `${o.hp} HP`}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('conditions.motorEfficiency')}</label><NumberInputWithControls value={(conditions as FanConditions).motorEfficiency ?? null} onChange={(val) => handleConditionChange('motorEfficiency', val)} unitType="efficiency" unitSystem={unitSystem} /></div>
                                    </>
                                )}
                                {type !== EquipmentType.FAN && (
                                    <div className="flex flex-col gap-1"><label className="text-sm text-slate-700 block">{t('equipment.pressureLoss')}</label><NumberInputWithControls value={pressureLoss} onChange={handlePressureLossChange} unitType="pressure" unitSystem={unitSystem} /></div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.results')}</h3>
                            <div className="space-y-2">
                                {type === EquipmentType.BURNER && (<>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.heatLoad')}</span><DisplayValueWithUnit value={(results as BurnerResults).heatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={burnerHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.gasFlowRate')}</span><DisplayValueWithUnit value={(results as BurnerResults).gasFlowRate} unitType="gas_flow" unitSystem={unitSystem} tooltipContent={burnerGasFlowTooltip} /></div>
                                </>)}
                                {type === EquipmentType.COOLING_COIL && (<>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.airSideHeatLoad')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).airSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={coilAirSideHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.coldWaterSideHeatLoad')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).coldWaterSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={coolingCoilWaterSideHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.chilledWaterFlow_L_min')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).chilledWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={coilWaterFlowTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.dehumidification_L_min')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).dehumidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={coilDehumidificationTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.bypassFactor')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).bypassFactor} unitType="efficiency" unitSystem={unitSystem} tooltipContent={coilBypassFactorTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.contactFactor')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).contactFactor} unitType="efficiency" unitSystem={unitSystem} tooltipContent={coilContactFactorTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.apparatusDewPointTemp')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).apparatusDewPointTemp} unitType="temperature" unitSystem={unitSystem} tooltipContent={coilAdpTooltip} /></div>
                                </>)}
                                {type === EquipmentType.HEATING_COIL && (<>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.airSideHeatLoad')}</span><DisplayValueWithUnit value={(results as HeatingCoilResults).airSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={coilAirSideHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.hotWaterSideHeatLoad')}</span><DisplayValueWithUnit value={(results as HeatingCoilResults).hotWaterSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={heatingCoilWaterSideHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.hotWaterFlow_L_min')}</span><DisplayValueWithUnit value={(results as HeatingCoilResults).hotWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={coilWaterFlowTooltip} /></div>
                                </>)}
                                {type === EquipmentType.SPRAY_WASHER && (<>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.humidification_L_min')}</span><DisplayValueWithUnit value={(results as SprayWasherResults).humidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayWasherHumidificationTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.sprayAmount_L_min')}</span><DisplayValueWithUnit value={(results as SprayWasherResults).sprayAmount_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayWasherSprayAmountTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('conditions.humidificationEfficiency')}</span><DisplayValueWithUnit value={(results as SprayWasherResults).humidificationEfficiency} unitType="efficiency" unitSystem={unitSystem} tooltipContent={sprayWasherEfficiencyTooltip} /></div>
                                </>)}
                                {type === EquipmentType.HOT_WATER_WASHER && (<>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.heatLoad')}</span><DisplayValueWithUnit value={(results as HotWaterWasherResults).heatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={hotWaterWasherHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.makeupWaterHeatingLoad_kW')}</span><DisplayValueWithUnit value={(results as HotWaterWasherResults).makeupWaterHeatingLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={hotWaterWasherMakeupWaterHeatingLoadTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.humidification_L_min')}</span><DisplayValueWithUnit value={(results as HotWaterWasherResults).humidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayWasherHumidificationTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.sprayAmount_L_min')}</span><DisplayValueWithUnit value={(results as HotWaterWasherResults).sprayAmount_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayWasherSprayAmountTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('conditions.humidificationEfficiency')}</span><DisplayValueWithUnit value={(results as HotWaterWasherResults).humidificationEfficiency} unitType="efficiency" unitSystem={unitSystem} tooltipContent={sprayWasherEfficiencyTooltip} /></div>
                                </>)}
                                {type === EquipmentType.STEAM_HUMIDIFIER && (<>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.requiredSteamAmount')}</span><DisplayValueWithUnit value={(results as SteamHumidifierResults).requiredSteamAmount} unitType="steam_flow" unitSystem={unitSystem} tooltipContent={steamHumidifierRequiredSteamTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.steamAbsolutePressure')}</span><DisplayValueWithUnit value={(results as SteamHumidifierResults).steamAbsolutePressure} unitType="steam_pressure" unitSystem={unitSystem} tooltipContent={steamHumidifierPressureTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.steamTemperature')}</span><DisplayValueWithUnit value={(results as SteamHumidifierResults).steamTemperature} unitType="temperature" unitSystem={unitSystem} tooltipContent={steamHumidifierPropertiesTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.steamEnthalpy')}</span><DisplayValueWithUnit value={(results as SteamHumidifierResults).steamEnthalpy} unitType="steam_enthalpy" unitSystem={unitSystem} tooltipContent={steamHumidifierPropertiesTooltip} /></div>
                                </>)}
                                {type === EquipmentType.FAN && (<>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.heatGeneration')}</span><DisplayValueWithUnit value={(results as FanResults).heatGeneration_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={fanHeatGenerationTooltip} /></div>
                                    <div className="flex justify-between items-center"><span className="text-sm">{t('results.tempRise_deltaT_celsius')}</span><DisplayValueWithUnit value={(results as FanResults).tempRise_deltaT_celsius} unitType="temperature_delta" unitSystem={unitSystem} tooltipContent={fanTempRiseTooltip} /></div>
                                </>)}
                                {type === EquipmentType.CUSTOM && (<div className="text-center text-slate-500 py-4">{t('equipment.noResults')}</div>)}
                            </div>
                        </div>
                    </div>
                )}
            </>
        </div>
    );
};

export default EquipmentItem;