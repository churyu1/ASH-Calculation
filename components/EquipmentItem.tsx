import React, { useEffect, useMemo, useState } from 'react';
import { 
    Equipment, UnitSystem, EquipmentType, AirProperties, 
    CoolingCoilConditions, HeatingCoilConditions, BurnerConditions, FanConditions, 
    FilterConditions, SprayWasherConditions,
    SteamHumidifierConditions, SteamHumidifierResults,
    CoolingCoilResults, HeatingCoilResults, BurnerResults, FanResults, 
    FilterResults, SprayWasherResults, CustomResults,
    SteamPressureUnit
} from '../types';
import { calculateAirProperties, calculatePsat, PSYCH_CONSTANTS, calculateSteamProperties } from '../services/psychrometrics.ts';
import { MOTOR_OUTPUT_CONVERSIONS } from '../constants.ts';
import { useLanguage } from '../i18n/index.ts';
import NumberInputWithControls from './NumberInputWithControls.tsx';
import DisplayValueWithUnit from './DisplayValueWithUnit.tsx';
import { formatNumber, convertValue, convertSteamPressure, formatNumberForInput, findMotorHp } from '../utils/conversions.ts';
import FormulaTooltipContent from './FormulaTooltipContent.tsx';

interface EquipmentItemProps {
    equipment: Equipment;
    index: number;
    totalEquipment: number;
    airflow: number | null;
    onUpdate: (id: number, updatedEquipment: Partial<Equipment>) => void;
    onDelete: (id: number) => void;
    unitSystem: UnitSystem;
}

const EquipmentItem: React.FC<EquipmentItemProps> = ({
    equipment, index, totalEquipment, airflow, onUpdate, onDelete, unitSystem
}) => {
    const { id, type, pressureLoss, inletAir, outletAir, conditions, color, results } = equipment;
    const { t, locale } = useLanguage();
    
    const [pressureInputValue, setPressureInputValue] = useState('');

    const currentInletAirCalculated = useMemo(() => calculateAirProperties(inletAir.temp, inletAir.rh), [inletAir.temp, inletAir.rh]);
    const massFlowRateDA_kg_s = useMemo(() => (airflow !== null && currentInletAirCalculated.density !== null) ? (airflow / 60) * currentInletAirCalculated.density : 0, [airflow, currentInletAirCalculated.density]);

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
        onUpdate(id, {
            inletAir: { ...inletAir, [field]: value },
            inletIsLocked: true,
        });
    };

    const handleOutletChange = (field: 'temp' | 'rh', value: number | null) => {
        const newOutlet = { ...outletAir, [field]: value };
        // For steam humidifier, RH drives temp, so clear temp if RH changes
        if (type === EquipmentType.STEAM_HUMIDIFIER && field === 'rh' && value !== null) {
            newOutlet.temp = null;
        }
        onUpdate(id, { outletAir: newOutlet });
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
    const filterFaceVelocityTooltip = useMemo(() => {
        if (type !== EquipmentType.FILTER || airflow === null) return null;
        const { width = 0, height = 0, sheets = 1 } = conditions as FilterConditions;
        const formulaPath = 'tooltips.filter.faceVelocity';
        const total_area_m2 = (width / 1000) * (height / 1000) * sheets;
        const values = {
            'q': { value: airflow, unit: t('units.si.airflow') },
            'a_total': { value: total_area_m2, unit: t('units.si.area') }
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, airflow, conditions, unitSystem, t, locale]);

    const filterAirflowPerSheetTooltip = useMemo(() => {
        if (type !== EquipmentType.FILTER || airflow === null) return null;
        const { sheets = 1 } = conditions as FilterConditions;
        const formulaPath = 'tooltips.filter.airflowPerSheet';
        const values = {
            'q': { value: airflow, unit: t('units.si.airflow') },
            'n': { value: sheets, unit: t('units.si.sheets') }
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, airflow, conditions, unitSystem, t, locale]);

    const burnerHeatLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.BURNER || massFlowRateDA_kg_s === 0 || inletAir.enthalpy === null || outletAir.enthalpy === null) return null;
        const formulaPath = 'tooltips.burner.heatLoad';
        const values = {
            'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
            'h_in': { value: inletAir.enthalpy, unit: t('units.si.enthalpy') },
            'h_out': { value: outletAir.enthalpy, unit: t('units.si.enthalpy') },
            'q': { value: airflow, unit: t('units.si.airflow') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, unitSystem, t, locale]);
    
    const coilAirSideHeatLoadTooltip = useMemo(() => {
        if (![EquipmentType.COOLING_COIL, EquipmentType.HEATING_COIL].includes(type) || massFlowRateDA_kg_s === 0 || inletAir.enthalpy === null || outletAir.enthalpy === null) return null;
        const formulaPath = 'tooltips.coil.airSideHeatLoad';
        const values = {
            'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
            'h_in': { value: inletAir.enthalpy, unit: t('units.si.enthalpy') },
            'h_out': { value: outletAir.enthalpy, unit: t('units.si.enthalpy') },
            'q': { value: airflow, unit: t('units.si.airflow') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, unitSystem, t, locale]);
    
    const coolingCoilWaterSideHeatLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const { airSideHeatLoad_kW } = results as CoolingCoilResults;
        if (airSideHeatLoad_kW === null || airSideHeatLoad_kW === undefined) return null;
        const title = t('results.coldWaterSideHeatLoad');
        const formula = "Q_water = Q_air";
        const legend = {
            "Q_water": `${t('results.coldWaterSideHeatLoad')} (${t(`units.${unitSystem}.heat_load`)})`,
            "Q_air": `${t('results.airSideHeatLoad')} (${t(`units.${unitSystem}.heat_load`)})`,
        };
        const values = {
            'Q_air': { value: airSideHeatLoad_kW, unit: t(`units.${unitSystem}.heat_load`) },
        };
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, results, unitSystem, t, locale]);

    const heatingCoilWaterSideHeatLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.HEATING_COIL) return null;
        const { heatExchangeEfficiency = 85 } = conditions as HeatingCoilConditions;
        const { airSideHeatLoad_kW } = results as HeatingCoilResults;
        if (airSideHeatLoad_kW === null || airSideHeatLoad_kW === undefined) return null;
        const formulaPath = 'tooltips.coil.waterSideHeatLoad';
        const values = {
            'Q_air': { value: airSideHeatLoad_kW, unit: t('units.si.heat_load') },
            'η': { value: heatExchangeEfficiency, unit: t('units.si.efficiency') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
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
        const values: Record<string, { value: number | null | undefined; unit: string; }> = {
            'Q_kW': { value: Q_kW, unit: t('units.si.heat_load') },
            'Δt_w': { value: waterTempDiff, unit: t('units.si.temperature') },
            'Q_BTUh': { value: convertValue(Q_kW, 'heat_load', UnitSystem.SI, unitSystem), unit: t('units.imperial.heat_load') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, conditions, results, unitSystem, t, locale]);

    const coilDehumidificationTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL || massFlowRateDA_kg_s === 0 || inletAir.absHumidity === null || outletAir.absHumidity === null) return null;
        const formulaPath = 'tooltips.coil.dehumidification';
        const values = {
            'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
            'x_in': { value: inletAir.absHumidity, unit: t('units.si.abs_humidity') },
            'x_out': { value: outletAir.absHumidity, unit: t('units.si.abs_humidity') },
            'q': { value: airflow, unit: t('units.si.airflow') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, unitSystem, t, locale]);

    const coilBypassFactorTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const { apparatusDewPointTemp } = results as CoolingCoilResults;
        if (inletAir.temp === null || outletAir.temp === null || apparatusDewPointTemp === undefined || apparatusDewPointTemp === null) return null;
        const formulaPath = 'tooltips.coil.bypassFactor';
        const values = {
            't_in': { value: inletAir.temp, unit: t('units.si.temperature') },
            't_out': { value: outletAir.temp, unit: t('units.si.temperature') },
            't_adp': { value: apparatusDewPointTemp, unit: t('units.si.temperature') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, inletAir.temp, outletAir.temp, results, unitSystem, t, locale]);

    const coilContactFactorTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const { bypassFactor } = results as CoolingCoilResults;
        if (bypassFactor === undefined || bypassFactor === null) return null;
        const formulaPath = 'tooltips.coil.contactFactor';
        const values = { 'BF': { value: bypassFactor / 100, unit: '' } };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, results, unitSystem, t, locale]);

    const coilAdpTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const { bypassFactor = 5 } = conditions as CoolingCoilConditions;
        const { apparatusDewPointTemp } = results as CoolingCoilResults;
        const isSensible = apparatusDewPointTemp !== undefined && outletAir.absHumidity !== null && inletAir.absHumidity !== null && Math.abs(outletAir.absHumidity - inletAir.absHumidity) < 1e-6;
        const formulaPath = isSensible ? 'tooltips.coil.apparatusDewPointTempSensible' : 'tooltips.coil.apparatusDewPointTemp';
        const values = {
            't_in': { value: inletAir.temp, unit: t('units.si.temperature') },
            't_out': { value: outletAir.temp, unit: t('units.si.temperature') },
            'BF': { value: bypassFactor / 100, unit: '' },
            'rh_in': { value: inletAir.rh, unit: t('units.si.rh') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, inletAir, outletAir, conditions, results, unitSystem, t, locale]);
    
    const sprayWasherHumidificationTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER || massFlowRateDA_kg_s === 0 || inletAir.absHumidity === null || outletAir.absHumidity === null) return null;
        const formulaPath = 'tooltips.spray_washer.humidification';
        const values = {
            'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
            'x_in': { value: inletAir.absHumidity, unit: t('units.si.abs_humidity') },
            'x_out': { value: outletAir.absHumidity, unit: t('units.si.abs_humidity') },
            'q': { value: airflow, unit: t('units.si.airflow') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, unitSystem, t, locale]);

    const sprayWasherSprayAmountTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER || massFlowRateDA_kg_s === 0) return null;
        const { waterToAirRatio = 0.8 } = conditions as SprayWasherConditions;
        const formulaPath = 'tooltips.spray_washer.sprayAmount';
        const values = {
            'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
            'L/G': { value: waterToAirRatio, unit: '' },
            'q': { value: airflow, unit: t('units.si.airflow') },
            'ρ': { value: currentInletAirCalculated.density, unit: t('units.si.density') }
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, massFlowRateDA_kg_s, conditions, airflow, currentInletAirCalculated.density, unitSystem, t, locale]);

    const sprayWasherEfficiencyTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER || inletAir.absHumidity === null || outletAir.absHumidity === null) return null;
        const { humidificationEfficiency } = results as SprayWasherResults;
        const formulaPath = 'tooltips.spray_washer.humidificationEfficiency';
        const values = {
            'x_in': { value: inletAir.absHumidity, unit: t('units.si.abs_humidity') },
            'x_out': { value: outletAir.absHumidity, unit: t('units.si.abs_humidity') },
            'η': { value: humidificationEfficiency, unit: t('units.si.efficiency') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, inletAir.absHumidity, outletAir.absHumidity, results, unitSystem, t, locale]);

    const steamHumidifierRequiredSteamTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER || massFlowRateDA_kg_s === 0 || inletAir.absHumidity === null || outletAir.absHumidity === null) return null;
        const formulaPath = 'tooltips.steam_humidifier.requiredSteam';
        const values = {
            'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
            'x_in': { value: inletAir.absHumidity, unit: t('units.si.abs_humidity') },
            'x_out': { value: outletAir.absHumidity, unit: t('units.si.abs_humidity') },
            'q': { value: airflow, unit: t('units.si.airflow') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, unitSystem, t, locale]);

    const steamHumidifierPressureTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER) return null;
        const { steamGaugePressure = 100 } = conditions as SteamHumidifierConditions;
        const formulaPath = 'tooltips.steam_humidifier.steamAbsolutePressure';
        const values = {
            'P_gauge': { value: steamGaugePressure, unit: 'kPaG' },
            'P_atm': { value: PSYCH_CONSTANTS.ATM_PRESSURE_PA / 1000, unit: 'kPa' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, conditions, unitSystem, t, locale]);

    const steamHumidifierPropertiesTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER) return null;
        const { steamAbsolutePressure } = results as SteamHumidifierResults;
        if (steamAbsolutePressure === undefined) return null;
        const formulaPath = 'tooltips.steam_humidifier.steamProperties';
        const values = {
            'P_abs': { value: steamAbsolutePressure, unit: t('units.si.steam_pressure') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, results, unitSystem, t, locale]);

    const fanHeatGenerationTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN) return null;
        const { motorOutput = 0.2, motorEfficiency = 80 } = conditions as FanConditions;
        const formulaPath = 'tooltips.fan.heatGeneration';
        const values: Record<string, { value: number | null | undefined; unit: string; }> = {
            'P': { value: motorOutput, unit: t('units.si.motor_power') },
            'η': { value: motorEfficiency, unit: t('units.si.efficiency') },
            'P_HP': { value: convertValue(motorOutput, 'motor_power', UnitSystem.SI, unitSystem), unit: t('units.imperial.motor_power') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, conditions, unitSystem, t, locale]);

    const fanTempRiseTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN || massFlowRateDA_kg_s === 0) return null;
        const { heatGeneration_kW } = results as FanResults;
        const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * ((inletAir.absHumidity || 0) / 1000);
        const formulaPath = 'tooltips.fan.tempRise';
        const values: Record<string, { value: number | null | undefined; unit: string; }> = {
            'Q_kW': { value: heatGeneration_kW, unit: t('units.si.heat_load') },
            'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
            'Cpa_moist': { value: c_pa_moist, unit: 'kJ/kg·K' },
            'Q_BTUh': { value: convertValue(heatGeneration_kW, 'heat_load', UnitSystem.SI, unitSystem), unit: t('units.imperial.heat_load') },
            'q': { value: airflow, unit: t('units.si.airflow') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [type, results, massFlowRateDA_kg_s, inletAir.absHumidity, airflow, unitSystem, t, locale]);

    const requiredMotorPowerTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN || airflow === null) return null;
        const { totalPressure, fanEfficiency, marginFactor } = conditions as FanConditions;
        const { requiredMotorPower } = results as FanResults;

        const formulaPath = 'tooltips.fan.requiredMotorPower';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = JSON.parse(t(`${formulaPath}.${unitSystem}.legend`));
        
        const airPower_kW = (airflow !== null && totalPressure !== null)
            ? (airflow * totalPressure) / (60 * 1000)
            : null;
        
        const motorShaftPower_kW = (airPower_kW !== null && fanEfficiency !== null && fanEfficiency > 0)
            ? airPower_kW / (fanEfficiency / 100)
            : null;

        const values: Record<string, { value: number | null | undefined; unit: string; }> = {
            'Q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.airflow`) },
            'Pt': { value: convertValue(totalPressure, 'pressure', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.pressure`) },
            'ηt': { value: fanEfficiency, unit: t(`units.${unitSystem}.efficiency`) },
            'α': { value: marginFactor, unit: t(`units.${unitSystem}.efficiency`) },
            'P_shaft': { value: convertValue(motorShaftPower_kW, 'motor_power', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.motor_power`) },
            'P_req': { value: convertValue(requiredMotorPower, 'motor_power', UnitSystem.SI, unitSystem), unit: t(`units.${unitSystem}.motor_power`) },
        };
        
        if (Object.values(values).some(v => v.value === null || v.value === undefined)) return null;

        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, airflow, conditions, results, unitSystem, t, locale]);

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
        } : {
            't_f': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.temperature') },
            'rh': { value: rh, unit: t('units.imperial.rh') },
            'P_v': { value: P_v, unit: 'Pa' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [inletAir.temp, inletAir.rh, unitSystem, t, locale]);

    const inletEnthalpyTooltip = useMemo(() => {
        const { temp, absHumidity } = inletAir;
        if (temp === null || absHumidity === null) return null;
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const values: Record<string, { value: number | null | undefined; unit: string; }> = unitSystem === UnitSystem.SI ? {
            't': { value: temp, unit: t('units.si.temperature') },
            'x': { value: absHumidity, unit: t('units.si.abs_humidity') },
        } : {
            't': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.temperature') },
            'x': { value: convertValue(absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.abs_humidity') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [inletAir.temp, inletAir.absHumidity, unitSystem, t, locale]);

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
        } : {
            't_f': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.temperature') },
            'rh': { value: rh, unit: t('units.imperial.rh') },
            'P_v': { value: P_v, unit: 'Pa' },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [outletAir.temp, outletAir.rh, unitSystem, t, locale]);

    const outletEnthalpyTooltip = useMemo(() => {
        const { temp, absHumidity } = outletAir;
        if (temp === null || absHumidity === null) return null;
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const values: Record<string, { value: number | null | undefined; unit: string; }> = unitSystem === UnitSystem.SI ? {
            't': { value: temp, unit: t('units.si.temperature') },
            'x': { value: absHumidity, unit: t('units.si.abs_humidity') },
        } : {
            't': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.temperature') },
            'x': { value: convertValue(absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: t('units.imperial.abs_humidity') },
        };
        return <FormulaTooltipContent title={t(`${formulaPath}.title`)} formula={t(`${formulaPath}.${unitSystem}.formula`)} legend={JSON.parse(t(`${formulaPath}.${unitSystem}.legend`))} values={values} />;
    }, [outletAir.temp, outletAir.absHumidity, unitSystem, t, locale]);


    const renderAirProperties = (airProps: AirProperties, calculatedProps: AirProperties, title: string, isOutlet = false) => (
        <div className="p-4 bg-slate-100 rounded-lg">
            <h3 className="font-semibold mb-2">{title}</h3>
            {isOutlet ? (
                 <>
                    <div className="flex justify-between items-center py-1">
                        <span className="text-sm">{t('airProperties.temperature')}</span>
                        {type === EquipmentType.STEAM_HUMIDIFIER ? (
                            <DisplayValueWithUnit value={airProps.temp} unitType="temperature" unitSystem={unitSystem} />
                        ) : (
                            <NumberInputWithControls value={airProps.temp} onChange={(val) => handleOutletChange('temp', val)} unitType="temperature" unitSystem={unitSystem} />
                        )}
                    </div>
                    <div className="flex justify-between items-center py-1">
                        <span className="text-sm">{t('airProperties.rh')}</span>
                        {type === EquipmentType.STEAM_HUMIDIFIER ? (
                            <NumberInputWithControls value={airProps.rh} onChange={(val) => handleOutletChange('rh', val)} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                        ) : type === EquipmentType.SPRAY_WASHER ? (
                             <DisplayValueWithUnit value={calculatedProps.rh} unitType="rh" unitSystem={unitSystem} />
                        ) : (
                             <DisplayValueWithUnit value={calculatedProps.rh} unitType="rh" unitSystem={unitSystem} />
                        )}
                    </div>
                 </>
            ) : (
                 <>
                    <div className="flex justify-between items-center py-1">
                        <span className="text-sm">{t('airProperties.temperature')}</span>
                        <NumberInputWithControls value={airProps.temp} onChange={(val) => handleInletChange('temp', val)} unitType="temperature" unitSystem={unitSystem} />
                    </div>
                    <div className="flex justify-between items-center py-1">
                        <span className="text-sm">{t('airProperties.rh')}</span>
                        <NumberInputWithControls value={airProps.rh} onChange={(val) => handleInletChange('rh', val)} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                    </div>
                </>
            )}
             <hr className="my-2 border-slate-300" />
            <div className="flex justify-between items-center py-1">
                <span className="text-sm">{t('airProperties.abs_humidity')}</span>
                <DisplayValueWithUnit value={calculatedProps.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={isOutlet ? outletAbsHumidityTooltip : inletAbsHumidityTooltip} />
            </div>
            <div className="flex justify-between items-center py-1">
                <span className="text-sm">{t('airProperties.enthalpy')}</span>
                <DisplayValueWithUnit value={calculatedProps.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={isOutlet ? outletEnthalpyTooltip : inletEnthalpyTooltip} />
            </div>
        </div>
    );
    
    return (
        <div id={`equipment-${id}`} className={`p-4 rounded-lg shadow-md bg-white border border-slate-300 border-t-0 rounded-t-none`}>
             <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-semibold">{index + 1}. {t(`equipmentNames.${type}`)}</h2>
                <div className="flex items-center gap-1">
                    <button onClick={() => onDelete(id)} className="p-1.5 rounded-md bg-red-500 text-white hover:bg-red-600">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>
            <>
                {type === EquipmentType.FILTER ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2 p-4 bg-slate-100 rounded-lg">
                            <h3 className="font-semibold mb-2">{t('equipment.airConditions')}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex justify-between items-center py-1 border-b sm:border-b-0 sm:border-r pr-4">
                                    <span className="text-sm">{t('airProperties.temperature')}</span>
                                    <DisplayValueWithUnit value={currentInletAirCalculated.temp} unitType="temperature" unitSystem={unitSystem} />
                                </div>
                                <div className="flex justify-between items-center py-1 border-b sm:border-b-0 md:border-r pr-4">
                                    <span className="text-sm">{t('airProperties.rh')}</span>
                                    <DisplayValueWithUnit value={currentInletAirCalculated.rh} unitType="rh" unitSystem={unitSystem} />
                                </div>
                                <div className="flex justify-between items-center py-1 border-b sm:border-b-0 sm:border-r pr-4">
                                    <span className="text-sm">{t('airProperties.abs_humidity')}</span>
                                    <DisplayValueWithUnit value={currentInletAirCalculated.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={inletAbsHumidityTooltip} />
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.enthalpy')}</span>
                                    <DisplayValueWithUnit value={currentInletAirCalculated.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={inletEnthalpyTooltip} />
                                </div>
                            </div>
                        </div>
                         <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.conditions')}</h3>
                            <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.width')}</span><NumberInputWithControls value={(conditions as FilterConditions).width ?? null} onChange={(val) => handleConditionChange('width', val)} unitType="length" unitSystem={unitSystem} /></div>
                            <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.height')}</span><NumberInputWithControls value={(conditions as FilterConditions).height ?? null} onChange={(val) => handleConditionChange('height', val)} unitType="length" unitSystem={unitSystem} /></div>
                            <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.thickness')}</span><NumberInputWithControls value={(conditions as FilterConditions).thickness ?? null} onChange={(val) => handleConditionChange('thickness', val)} unitType="length" unitSystem={unitSystem} /></div>
                            <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.sheets')}</span><NumberInputWithControls value={(conditions as FilterConditions).sheets ?? null} onChange={(val) => handleConditionChange('sheets', val)} unitType="sheets" unitSystem={unitSystem} /></div>
                            <div className="flex justify-between items-center py-1"><span className="text-sm">{t('equipment.pressureLoss')}</span><NumberInputWithControls value={pressureLoss} onChange={handlePressureLossChange} unitType="pressure" unitSystem={unitSystem} /></div>
                        </div>
                        <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.results')}</h3>
                            <div className="grid grid-cols-1 gap-2">
                                <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.faceVelocity')}</span><DisplayValueWithUnit value={(results as FilterResults).faceVelocity} unitType="velocity" unitSystem={unitSystem} tooltipContent={filterFaceVelocityTooltip} /></div>
                                <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.treatedAirflowPerSheet')}</span><DisplayValueWithUnit value={(results as FilterResults).treatedAirflowPerSheet} unitType="airflow_per_sheet" unitSystem={unitSystem} tooltipContent={filterAirflowPerSheetTooltip} /></div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderAirProperties(inletAir, currentInletAirCalculated, t('equipment.inletAir'))}
                        {renderAirProperties(outletAir, outletAir, t('equipment.outletAir'), true)}
                         <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.conditions')}</h3>
                            {type === EquipmentType.BURNER && (
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('conditions.shf')}</span>
                                    <NumberInputWithControls value={(conditions as BurnerConditions).shf ?? null} onChange={(val) => handleConditionChange('shf', val)} unitType="shf" unitSystem={unitSystem} min={0} max={1} step={0.01}/>
                                </div>
                            )}
                            {type === EquipmentType.COOLING_COIL && (
                                <>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.chilledWaterInletTemp')}</span><NumberInputWithControls value={(conditions as CoolingCoilConditions).chilledWaterInletTemp ?? null} onChange={(val) => handleConditionChange('chilledWaterInletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.chilledWaterOutletTemp')}</span><NumberInputWithControls value={(conditions as CoolingCoilConditions).chilledWaterOutletTemp ?? null} onChange={(val) => handleConditionChange('chilledWaterOutletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.bypassFactor')}</span><NumberInputWithControls value={(conditions as CoolingCoilConditions).bypassFactor ?? null} onChange={(val) => handleConditionChange('bypassFactor', val)} unitType="efficiency" unitSystem={unitSystem} /></div>
                                </>
                            )}
                            {type === EquipmentType.HEATING_COIL && (
                                <>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.hotWaterInletTemp')}</span><NumberInputWithControls value={(conditions as HeatingCoilConditions).hotWaterInletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterInletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.hotWaterOutletTemp')}</span><NumberInputWithControls value={(conditions as HeatingCoilConditions).hotWaterOutletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterOutletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.heatExchangeEfficiency')}</span><NumberInputWithControls value={(conditions as HeatingCoilConditions).heatExchangeEfficiency ?? null} onChange={(val) => handleConditionChange('heatExchangeEfficiency', val)} unitType="efficiency" unitSystem={unitSystem} /></div>
                                </>
                            )}
                            {type === EquipmentType.SPRAY_WASHER && (
                                 <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('conditions.waterToAirRatio')}</span>
                                    <NumberInputWithControls value={(conditions as SprayWasherConditions).waterToAirRatio ?? null} onChange={(val) => handleConditionChange('waterToAirRatio', val)} unitType="water_to_air_ratio" unitSystem={unitSystem} step={0.1}/>
                                 </div>
                            )}
                            {type === EquipmentType.STEAM_HUMIDIFIER && (
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('conditions.steamGaugePressure')}</span>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="text"
                                            value={pressureInputValue}
                                            onChange={(e) => handleSteamPressureChange(e.target.value)}
                                            className="w-24 px-2 py-1 border border-slate-300 rounded-md bg-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <select
                                            value={(conditions as SteamHumidifierConditions).steamGaugePressureUnit || SteamPressureUnit.KPAG}
                                            onChange={(e) => handleSteamUnitChange(e.target.value as SteamPressureUnit)}
                                            className="w-24 px-2 py-1 border border-slate-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
                                    <div className="flex justify-between items-center py-1">
                                        <span className="text-sm">{t('conditions.motorOutput')}</span>
                                        <select 
                                            value={(conditions as FanConditions).motorOutput ?? ''} 
                                            onChange={(e) => handleConditionChange('motorOutput', parseFloat(e.target.value))}
                                            className="w-48 px-2 py-1 border border-slate-300 rounded-md bg-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="" disabled>{t('app.select')}</option>
                                            {MOTOR_OUTPUT_CONVERSIONS.map(o => (
                                                <option key={o.kw} value={o.kw}>{unitSystem === UnitSystem.SI ? `${o.kw} kW` : `${o.hp} HP`}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.motorEfficiency')}</span><NumberInputWithControls value={(conditions as FanConditions).motorEfficiency ?? null} onChange={(val) => handleConditionChange('motorEfficiency', val)} unitType="efficiency" unitSystem={unitSystem} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.totalPressure')}</span><NumberInputWithControls value={(conditions as FanConditions).totalPressure ?? null} onChange={(val) => handleConditionChange('totalPressure', val)} unitType="pressure" unitSystem={unitSystem} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.fanEfficiency')}</span><NumberInputWithControls value={(conditions as FanConditions).fanEfficiency ?? null} onChange={(val) => handleConditionChange('fanEfficiency', val)} unitType="efficiency" unitSystem={unitSystem} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.marginFactor')}</span><NumberInputWithControls value={(conditions as FanConditions).marginFactor ?? null} onChange={(val) => handleConditionChange('marginFactor', val)} unitType="efficiency" unitSystem={unitSystem} /></div>
                                </>
                            )}
                            {type !== EquipmentType.FAN && (
                                <div className="flex justify-between items-center py-1"><span className="text-sm">{t('equipment.pressureLoss')}</span><NumberInputWithControls value={pressureLoss} onChange={handlePressureLossChange} unitType="pressure" unitSystem={unitSystem} /></div>
                            )}
                        </div>
                        <div className="p-4 bg-white rounded-lg shadow-inner border border-slate-200">
                            <h3 className="font-semibold mb-2">{t('equipment.results')}</h3>
                            <div className="grid grid-cols-1 gap-2">
                                {type === EquipmentType.BURNER && (<div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.heatLoad')}</span><DisplayValueWithUnit value={(results as BurnerResults).heatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={burnerHeatLoadTooltip} /></div>)}
                                {type === EquipmentType.COOLING_COIL && (<>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.airSideHeatLoad')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).airSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={coilAirSideHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.coldWaterSideHeatLoad')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).coldWaterSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={coolingCoilWaterSideHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.chilledWaterFlow_L_min')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).chilledWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={coilWaterFlowTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.dehumidification_L_min')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).dehumidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={coilDehumidificationTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.bypassFactor')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).bypassFactor} unitType="efficiency" unitSystem={unitSystem} tooltipContent={coilBypassFactorTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.contactFactor')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).contactFactor} unitType="efficiency" unitSystem={unitSystem} tooltipContent={coilContactFactorTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.apparatusDewPointTemp')}</span><DisplayValueWithUnit value={(results as CoolingCoilResults).apparatusDewPointTemp} unitType="temperature" unitSystem={unitSystem} tooltipContent={coilAdpTooltip} /></div>
                                </>)}
                                {type === EquipmentType.HEATING_COIL && (<>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.airSideHeatLoad')}</span><DisplayValueWithUnit value={(results as HeatingCoilResults).airSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={coilAirSideHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.hotWaterSideHeatLoad')}</span><DisplayValueWithUnit value={(results as HeatingCoilResults).hotWaterSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={heatingCoilWaterSideHeatLoadTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.hotWaterFlow_L_min')}</span><DisplayValueWithUnit value={(results as HeatingCoilResults).hotWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={coilWaterFlowTooltip} /></div>
                                </>)}
                                {type === EquipmentType.SPRAY_WASHER && (<>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.humidification_L_min')}</span><DisplayValueWithUnit value={(results as SprayWasherResults).humidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayWasherHumidificationTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.sprayAmount_L_min')}</span><DisplayValueWithUnit value={(results as SprayWasherResults).sprayAmount_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayWasherSprayAmountTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('conditions.humidificationEfficiency')}</span><DisplayValueWithUnit value={(results as SprayWasherResults).humidificationEfficiency} unitType="efficiency" unitSystem={unitSystem} tooltipContent={sprayWasherEfficiencyTooltip} /></div>
                                </>)}
                                {type === EquipmentType.STEAM_HUMIDIFIER && (<>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.requiredSteamAmount')}</span><DisplayValueWithUnit value={(results as SteamHumidifierResults).requiredSteamAmount} unitType="steam_flow" unitSystem={unitSystem} tooltipContent={steamHumidifierRequiredSteamTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.steamAbsolutePressure')}</span><DisplayValueWithUnit value={(results as SteamHumidifierResults).steamAbsolutePressure} unitType="steam_pressure" unitSystem={unitSystem} tooltipContent={steamHumidifierPressureTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.steamTemperature')}</span><DisplayValueWithUnit value={(results as SteamHumidifierResults).steamTemperature} unitType="temperature" unitSystem={unitSystem} tooltipContent={steamHumidifierPropertiesTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.steamEnthalpy')}</span><DisplayValueWithUnit value={(results as SteamHumidifierResults).steamEnthalpy} unitType="steam_enthalpy" unitSystem={unitSystem} tooltipContent={steamHumidifierPropertiesTooltip} /></div>
                                </>)}
                                {type === EquipmentType.FAN && (<>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.heatGeneration')}</span><DisplayValueWithUnit value={(results as FanResults).heatGeneration_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={fanHeatGenerationTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.tempRise_deltaT_celsius')}</span><DisplayValueWithUnit value={(results as FanResults).tempRise_deltaT_celsius} unitType="temperature" unitSystem={UnitSystem.SI} tooltipContent={fanTempRiseTooltip} /></div>
                                    <div className="flex justify-between items-center py-1"><span className="text-sm">{t('results.requiredMotorPower')}</span><DisplayValueWithUnit value={(results as FanResults).requiredMotorPower} unitType="motor_power" unitSystem={unitSystem} tooltipContent={requiredMotorPowerTooltip} /></div>
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