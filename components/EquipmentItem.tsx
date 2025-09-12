

import React, { useEffect, useMemo, useState } from 'react';
import { 
    Equipment, UnitSystem, EquipmentType, AirProperties, 
    CoolingCoilConditions, HeatingCoilConditions, BurnerConditions, FanConditions, 
    DamperConditions, FilterConditions, SprayWasherConditions, EliminatorConditions,
    SteamHumidifierConditions, SteamHumidifierResults,
    CoolingCoilResults, HeatingCoilResults, BurnerResults, FanResults, DamperResults, 
    FilterResults, SprayWasherResults, CustomResults, EliminatorResults, EquipmentConditions,
    SprayWasherResults as SprayWasherResultsType,
    SteamPressureUnit
} from '../types';
import { calculateAirProperties, calculateAbsoluteHumidityFromEnthalpy, calculateEnthalpy, calculateAbsoluteHumidity, calculatePsat, PSYCH_CONSTANTS, calculateDewPoint, calculateRelativeHumidity, calculateSteamProperties } from '../services/psychrometrics.ts';
import { MOTOR_OUTPUT_OPTIONS } from '../constants.ts';
import { useLanguage } from '../i18n/index.ts';
import NumberInputWithControls from './NumberInputWithControls.tsx';
import DisplayValueWithUnit from './DisplayValueWithUnit.tsx';
import { formatNumber, convertValue, convertSteamPressure, formatNumberForInput } from '../utils/conversions.ts';
import FormulaTooltipContent from './FormulaTooltipContent.tsx';
import Tooltip from './Tooltip.tsx';

interface EquipmentItemProps {
    equipment: Equipment;
    index: number;
    totalEquipment: number;
    airflow: number | null;
    onUpdate: (id: number, updatedEquipment: Equipment) => void;
    onDelete: (id: number) => void;
    onMove: (id: number, direction: 'up' | 'down') => void;
    onReflectUpstream: (id: number, currentIndex: number) => void;
    onReflectDownstream: (id: number, currentIndex: number) => void;
    unitSystem: UnitSystem;
}

const EquipmentItem: React.FC<EquipmentItemProps> = ({
    equipment, index, totalEquipment, airflow, onUpdate, onDelete, onMove, onReflectUpstream, onReflectDownstream, unitSystem
}) => {
    const { id, type, name, pressureLoss, inletAir, outletAir, conditions, color, results } = equipment;
    const { t, locale } = useLanguage();
    
    // Local state for the steam pressure input to allow for smoother user input
    const [pressureInputValue, setPressureInputValue] = useState('');

    const currentInletAirCalculated = useMemo(() => calculateAirProperties(inletAir.temp, inletAir.rh), [inletAir.temp, inletAir.rh]);
    const massFlowRateDA_kg_s = useMemo(() => (airflow !== null && currentInletAirCalculated.density !== null) ? (airflow / 60) * currentInletAirCalculated.density : 0, [airflow, currentInletAirCalculated.density]);

    const sprayWasherCalculatedValues = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER) return { finalWSat: 0 };
        const inletTemp = currentInletAirCalculated.temp;
        const inletEnthalpy = currentInletAirCalculated.enthalpy;

        if (inletTemp === null || inletEnthalpy === null) return { finalWSat: 0 };

        let tSat = inletTemp;
        for (let i = 0; i < 15; i++) {
            let wSat = calculateAbsoluteHumidity(tSat, 100);
            let hSat = calculateEnthalpy(tSat, wSat);
            tSat -= (hSat - inletEnthalpy) * 0.05; 
        }
        const finalWSat = calculateAbsoluteHumidity(tSat, 100);
        return { finalWSat };
    }, [type, currentInletAirCalculated.temp, currentInletAirCalculated.enthalpy]);

    // Effect to synchronize the local pressure input state with props from the parent
    useEffect(() => {
        if (type === EquipmentType.STEAM_HUMIDIFIER) {
            const steamCond = conditions as SteamHumidifierConditions;
            const currentUnit = steamCond.steamGaugePressureUnit || SteamPressureUnit.KPAG;
            const valueInKpa = steamCond.steamGaugePressure ?? 100;
            
            if (valueInKpa !== null) {
                const valueInCurrentUnit = convertSteamPressure(
                    valueInKpa,
                    SteamPressureUnit.KPAG, // internal is always kPa
                    currentUnit
                );
                setPressureInputValue(formatNumberForInput(valueInCurrentUnit, currentUnit, unitSystem));
            } else {
                setPressureInputValue('');
            }
        }
    }, [type, conditions, unitSystem]);


    useEffect(() => {
        let newPressureLoss: number | null = pressureLoss;
        let newResults: Equipment['results'] = {};
        let newOutletAir: AirProperties = { ...outletAir };
        
        const inletTemp = currentInletAirCalculated.temp;
        const inletAbsHum = currentInletAirCalculated.absHumidity;
        const inletEnthalpy = currentInletAirCalculated.enthalpy;
        const inletDensity = currentInletAirCalculated.density;

        if (massFlowRateDA_kg_s > 0 && inletTemp !== null && inletAbsHum !== null && inletEnthalpy !== null && inletDensity !== null) {
             switch (type) {
                case EquipmentType.FILTER: {
                    const { width = 0, height = 0, sheets = 1 } = conditions as FilterConditions;
                    const area_m2_per_sheet = (width / 1000) * (height / 1000);
                    const total_area_m2 = area_m2_per_sheet * sheets;
                    const faceVelocity = total_area_m2 > 0 && airflow ? (airflow / 60) / total_area_m2 : 0;
                    const airflowPerSheet = sheets > 0 && airflow ? airflow / sheets : 0;
                    newResults = { faceVelocity, treatedAirflowPerSheet: airflowPerSheet } as FilterResults;
                    newOutletAir = { ...currentInletAirCalculated };
                    // Pressure loss is manual
                    break;
                }
                case EquipmentType.BURNER: {
                    const { shf = 1.0 } = conditions as BurnerConditions;
                    const userOutletTemp = outletAir.temp;
                    if (userOutletTemp !== null) {
                        const sensibleHeat_kW = massFlowRateDA_kg_s * 1.02 * (userOutletTemp - inletTemp); // approximation
                        const totalHeat_kW = shf > 0 && shf <=1 ? sensibleHeat_kW / shf : sensibleHeat_kW;
                        const outletEnthalpy = inletEnthalpy + totalHeat_kW / massFlowRateDA_kg_s;
                        
                        newResults = { heatLoad_kW: totalHeat_kW } as BurnerResults;
                        
                        const outletAbsHum = calculateAbsoluteHumidityFromEnthalpy(userOutletTemp, outletEnthalpy);
                        newOutletAir = calculateAirProperties(userOutletTemp, null, outletAbsHum);
                    }
                    break;
                }
                case EquipmentType.COOLING_COIL: {
                    const { chilledWaterInletTemp = 7, chilledWaterOutletTemp = 14, heatExchangeEfficiency = 85 } = conditions as CoolingCoilConditions;
                    const userOutletTemp = outletAir.temp;

                    if (userOutletTemp !== null) {
                        const inletDewPoint = calculateDewPoint(inletAbsHum);
                        
                        let outletAbsHum: number | null;
                        if (userOutletTemp >= inletDewPoint) {
                            // Sensible cooling only
                            outletAbsHum = inletAbsHum;
                        } else {
                            // Cooling and dehumidification, assume 100% RH at outlet
                            outletAbsHum = calculateAbsoluteHumidity(userOutletTemp, 100);
                        }

                        if (outletAbsHum !== null) {
                            newOutletAir = calculateAirProperties(userOutletTemp, null, outletAbsHum);
                            const outletEnthalpy = newOutletAir.enthalpy;

                            if (outletEnthalpy !== null && newOutletAir.absHumidity !== null) {
                                const airSideHeatLoad_kW = massFlowRateDA_kg_s * (inletEnthalpy - outletEnthalpy);
                                const waterSideHeatLoad_kW = heatExchangeEfficiency > 0 ? airSideHeatLoad_kW / (heatExchangeEfficiency / 100) : 0;
                                const dehumidification_kg_s = massFlowRateDA_kg_s * (inletAbsHum - newOutletAir.absHumidity) / 1000;
                                const waterTempDiff = chilledWaterOutletTemp - chilledWaterInletTemp;
                                const chilledWaterFlow_L_min = waterTempDiff > 0 ? (waterSideHeatLoad_kW / (4.186 * waterTempDiff)) * 60 : 0;

                                newResults = {
                                    airSideHeatLoad_kcal: airSideHeatLoad_kW * 860.421,
                                    coldWaterSideHeatLoad_kcal: waterSideHeatLoad_kW * 860.421,
                                    dehumidification_L_min: Math.max(0, dehumidification_kg_s * 60),
                                    chilledWaterFlow_L_min: Math.max(0, chilledWaterFlow_L_min)
                                } as CoolingCoilResults;
                            }
                        }
                    }
                    break;
                }
                case EquipmentType.HEATING_COIL: {
                    const { hotWaterInletTemp = 80, hotWaterOutletTemp = 50, heatExchangeEfficiency = 85 } = conditions as HeatingCoilConditions;
                    const userOutletTemp = outletAir.temp;
                    if (userOutletTemp !== null) {
                        newOutletAir = calculateAirProperties(userOutletTemp, null, inletAbsHum);
                        const outletEnthalpy = newOutletAir.enthalpy;
                        if(outletEnthalpy !== null) {
                            const airSideHeatLoad_kW = massFlowRateDA_kg_s * (outletEnthalpy - inletEnthalpy);
                            const waterSideHeatLoad_kW = heatExchangeEfficiency > 0 ? airSideHeatLoad_kW / (heatExchangeEfficiency / 100) : 0;
                            const waterTempDiff = hotWaterInletTemp - hotWaterOutletTemp;
                            const hotWaterFlow_L_min = waterTempDiff > 0 ? (waterSideHeatLoad_kW / (4.186 * waterTempDiff)) * 60 : 0;

                            newResults = {
                                 airSideHeatLoad_kcal: airSideHeatLoad_kW * 860.421,
                                 hotWaterSideHeatLoad_kcal: waterSideHeatLoad_kW * 860.421,
                                 hotWaterFlow_L_min: Math.max(0, hotWaterFlow_L_min)
                            } as HeatingCoilResults;
                        }
                    }
                   break;
               }
                case EquipmentType.SPRAY_WASHER: {
                    const { waterToAirRatio = 1.5 } = conditions as SprayWasherConditions;
                    const userOutletRh = outletAir.rh;

                    if (userOutletRh !== null && !isNaN(userOutletRh)) {
                        let outletTempGuess = inletTemp;

                        for (let i = 0; i < 20; i++) {
                            const outletAbsHumGuess = calculateAbsoluteHumidityFromEnthalpy(outletTempGuess, inletEnthalpy);
                            if (outletAbsHumGuess < 0) {
                                outletTempGuess += 0.5;
                                continue;
                            }
                            const outletRhGuess = calculateRelativeHumidity(outletTempGuess, outletAbsHumGuess);
                            const error = userOutletRh - outletRhGuess;
                            if (Math.abs(error) < 0.01) break;
                            outletTempGuess -= error * 0.1;
                        }

                        const finalOutletTemp = outletTempGuess;
                        const finalAbsHumidity = calculateAbsoluteHumidityFromEnthalpy(finalOutletTemp, inletEnthalpy);
                        
                        const calculatedOutletProps = calculateAirProperties(finalOutletTemp, null, finalAbsHumidity);
                        // Overwrite the RH with the user's original input to prevent the UI from jumping due to calculation precision.
                        newOutletAir = {
                            ...calculatedOutletProps,
                            rh: userOutletRh,
                        };

                        if (newOutletAir.absHumidity !== null) {
                            const { finalWSat } = sprayWasherCalculatedValues;
                            let humidificationEfficiency = 0;
                            const potentialHumidification = finalWSat - inletAbsHum;
                            if (potentialHumidification > 0.001) {
                                const actualHumidification = newOutletAir.absHumidity - inletAbsHum;
                                humidificationEfficiency = (actualHumidification / potentialHumidification) * 100;
                                humidificationEfficiency = Math.max(0, Math.min(100, humidificationEfficiency));
                            }
                            
                            const humidification_L_min = (massFlowRateDA_kg_s * (newOutletAir.absHumidity - inletAbsHum) / 1000) * 60;
                            const sprayAmount_L_min = massFlowRateDA_kg_s * waterToAirRatio * 60;
                            
                            newResults = { 
                                humidification_L_min: Math.max(0, humidification_L_min), 
                                sprayAmount_L_min,
                                humidificationEfficiency
                            } as SprayWasherResultsType;
                        }
                    }
                    break;
                }
                 case EquipmentType.STEAM_HUMIDIFIER: {
                    const { steamGaugePressure = 100 } = conditions as SteamHumidifierConditions;
                    const userOutletRh = outletAir.rh;

                    const steamProps = calculateSteamProperties(steamGaugePressure);
                    const h_steam_kJ_kg = steamProps.enthalpy;

                    const steamAbsPressure_kPa = steamProps.absPressure;
                    const steamTemperature_C = steamProps.temp;
                    const steamEnthalpy_kcal_kg = h_steam_kJ_kg / 4.186;

                    const partialResults = {
                        steamAbsolutePressure: steamAbsPressure_kPa,
                        steamTemperature: steamTemperature_C,
                        steamEnthalpy: steamEnthalpy_kcal_kg,
                    };

                    if (userOutletRh !== null && !isNaN(userOutletRh)) {
                        const C = inletEnthalpy - (inletAbsHum / 1000) * h_steam_kJ_kg;
                        let outletTempGuess = inletTemp;

                        for (let i = 0; i < 30; i++) {
                            const outletAbsHumGuess = calculateAbsoluteHumidity(outletTempGuess, userOutletRh);
                            const outletEnthalpyGuess = calculateEnthalpy(outletTempGuess, outletAbsHumGuess);
                            const LHS = outletEnthalpyGuess - (outletAbsHumGuess / 1000) * h_steam_kJ_kg;
                            const error = C - LHS;
                            if (Math.abs(error) < 0.01) break;
                            outletTempGuess += error * 0.1;
                        }

                        const finalOutletTemp = outletTempGuess;
                        const finalAbsHumidity = calculateAbsoluteHumidity(finalOutletTemp, userOutletRh);

                        const calculatedOutletProps = calculateAirProperties(finalOutletTemp, null, finalAbsHumidity);
                        newOutletAir = { ...calculatedOutletProps, rh: userOutletRh };
                        
                        if (newOutletAir.absHumidity !== null) {
                            const steamMassFlow_kg_s = massFlowRateDA_kg_s * (newOutletAir.absHumidity - inletAbsHum) / 1000;
                            const requiredSteamAmount_kg_h = steamMassFlow_kg_s * 3600;
                            newResults = { ...partialResults, requiredSteamAmount: Math.max(0, requiredSteamAmount_kg_h) } as SteamHumidifierResults;
                        } else {
                            newResults = { ...partialResults, requiredSteamAmount: 0 } as SteamHumidifierResults;
                        }
                    } else {
                        newResults = { ...partialResults, requiredSteamAmount: 0 } as SteamHumidifierResults;
                    }
                    break;
                }
                case EquipmentType.FAN: {
                    const { motorOutput = 0, motorEfficiency = 80 } = conditions as FanConditions;
                    const heatGeneration_kW = motorEfficiency > 0 ? motorOutput * (1 - motorEfficiency / 100) : 0; // Heat is the loss
                    const tempRise_deltaT = massFlowRateDA_kg_s > 0 ? heatGeneration_kW / (massFlowRateDA_kg_s * 1.02) : 0;
                    const outletTemp = inletTemp + tempRise_deltaT;
    
                    newOutletAir = calculateAirProperties(outletTemp, null, inletAbsHum);
                    newResults = {
                        heatGeneration_kcal: heatGeneration_kW * 860.421,
                        tempRise_deltaT_celsius: tempRise_deltaT
                    } as FanResults;
                    break;
                }
                case EquipmentType.DAMPER: {
                    const { width = 0, height = 0, lossCoefficientK = 0 } = conditions as DamperConditions;
                    const area_m2 = (width / 1000) * (height / 1000);
                    const airVelocity_m_s = area_m2 > 0 && airflow ? (airflow / 60) / area_m2 : 0;
                    const pressureLoss_Pa = lossCoefficientK * 0.5 * inletDensity * Math.pow(airVelocity_m_s, 2);
                    newPressureLoss = pressureLoss_Pa;
                    newResults = { airVelocity_m_s, pressureLoss_Pa };
                    newOutletAir = { ...currentInletAirCalculated };
                    break;
                }
                case EquipmentType.ELIMINATOR:
                case EquipmentType.CUSTOM:
                     newOutletAir = { ...currentInletAirCalculated };
                     newResults = { pressureLoss: pressureLoss ?? 0 } as CustomResults | EliminatorResults;
                     break;
            }
        } else {
             newOutletAir = { ...currentInletAirCalculated };
             newResults = {};
             if (type === EquipmentType.DAMPER) newPressureLoss = 0;
        }
        
        const hasChanged = JSON.stringify({ p: newPressureLoss, o: newOutletAir, r: newResults }) !== JSON.stringify({ p: equipment.pressureLoss, o: equipment.outletAir, r: equipment.results });
        
        if (hasChanged) {
            onUpdate(id, { ...equipment, pressureLoss: newPressureLoss, outletAir: newOutletAir, results: newResults });
        }
    }, [
        id,
        type,
        pressureLoss,
        inletAir,
        outletAir,
        conditions,
        results,
        equipment,
        airflow,
        onUpdate,
        currentInletAirCalculated,
        massFlowRateDA_kg_s,
        sprayWasherCalculatedValues,
    ]);


    const handleUpdate = <K extends keyof Equipment>(key: K, value: Equipment[K]) => onUpdate(id, { ...equipment, [key]: value });
    const handleConditionChange = (key: string, value: any) => handleUpdate('conditions', { ...conditions, [key]: value } as EquipmentConditions);
    const handleOutletAirChange = <K extends keyof AirProperties>(key: K, value: AirProperties[K]) => {
        onUpdate(id, { ...equipment, outletAir: { ...outletAir, [key]: value } });
    };
    const handleInletAirChange = <K extends keyof AirProperties>(key: K, value: AirProperties[K]) => {
        const temp = key === 'temp' ? value as (number | null) : inletAir.temp;
        const rh = key === 'rh' ? value as (number | null) : inletAir.rh;
    
        // Recalculate all air properties to ensure consistency before updating the state.
        const newInletAir = calculateAirProperties(temp, rh);
    
        onUpdate(id, { ...equipment, inletAir: newInletAir, inletIsLocked: true });
    };

    const isAirConditionSectionNeeded = ![EquipmentType.FILTER, EquipmentType.ELIMINATOR, EquipmentType.DAMPER, EquipmentType.CUSTOM].includes(type);
    const showEquipmentConditionsSection = type !== EquipmentType.CUSTOM;
    const isOutletTempEditable = ![EquipmentType.FAN, EquipmentType.SPRAY_WASHER, EquipmentType.STEAM_HUMIDIFIER].includes(type);
    const isOutletRhEditable = [EquipmentType.SPRAY_WASHER, EquipmentType.STEAM_HUMIDIFIER].includes(type);

    let warningMessage = '';
    if (type === EquipmentType.BURNER && outletAir.temp !== null && inletAir.temp !== null && outletAir.temp < inletAir.temp) {
        warningMessage = t('equipment.warnings.burner');
    } else if (type === EquipmentType.COOLING_COIL) {
        if (outletAir.temp !== null && inletAir.temp !== null && outletAir.temp > inletAir.temp) {
            warningMessage = t('equipment.warnings.cooling_coil_temp');
        }
    } else if (type === EquipmentType.HEATING_COIL && outletAir.temp !== null && inletAir.temp !== null && outletAir.temp < inletAir.temp) {
        warningMessage = t('equipment.warnings.heating_coil');
    }
    
    const inputClasses = "w-24 px-2 py-1 border border-slate-300 rounded-md bg-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500";
    const sectionClasses = "p-4 bg-slate-100 rounded-lg";
    const conditionRowClasses = "flex flex-wrap justify-between items-center gap-2 py-1";

    const inletAbsHumidityTooltip = useMemo(() => {
        if (inletAir.temp === null || inletAir.rh === null) return null;
        
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            const P_sat = calculatePsat(inletAir.temp);
            const P_v = P_sat * (inletAir.rh / 100);
            values = {
                't_f': { value: convertValue(inletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                'rh': { value: inletAir.rh, unit: '%' },
                'P_v': { value: P_v, unit: 'Pa' },
            };
        } else {
            const P_sat = calculatePsat(inletAir.temp);
            const P_v = P_sat * (inletAir.rh / 100);
            values = {
                't': { value: inletAir.temp, unit: '°C' },
                'rh': { value: inletAir.rh, unit: '%' },
                'P_sat': { value: P_sat, unit: 'Pa' },
                'P_v': { value: P_v, unit: 'Pa' },
            };
        }
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [inletAir.temp, inletAir.rh, locale, unitSystem, t]);

    const inletEnthalpyTooltip = useMemo(() => {
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                't': { value: convertValue(inletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                'x': { value: convertValue(currentInletAirCalculated.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
            values = {
                't': { value: inletAir.temp, unit: '°C' },
                'x': { value: currentInletAirCalculated.absHumidity, unit: 'g/kg(DA)' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [inletAir.temp, currentInletAirCalculated.absHumidity, locale, unitSystem, t]);

    const outletTempTooltip = useMemo(() => {
        if (type === EquipmentType.FAN) {
            const fanRes = results as FanResults;
            const formulaPath = 'tooltips.fan.outletTemp';
            const title = t(`${formulaPath}.title`);
            const formula = t(`${formulaPath}.${unitSystem}.formula`);
            const legend = t(`${formulaPath}.${unitSystem}.legend`);
            
            let values = {};
            if (unitSystem === UnitSystem.IMPERIAL) {
                const tempRise_F = (fanRes.tempRise_deltaT_celsius ?? 0) * 9 / 5;
                values = {
                    't_in': { value: convertValue(inletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                    'ΔT': { value: tempRise_F, unit: '°F' },
                };
            } else {
                values = {
                    't_in': { value: inletAir.temp, unit: '°C' },
                    'ΔT': { value: fanRes.tempRise_deltaT_celsius, unit: '°C' },
                };
            }
            return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
        }
        if (type === EquipmentType.SPRAY_WASHER) {
            const formulaPath = 'tooltips.spray_washer.outletTemp';
            const title = t(`${formulaPath}.title`);
            const formula = t(`${formulaPath}.${unitSystem}.formula`);
            const legend = t(`${formulaPath}.${unitSystem}.legend`);

            let values = {};
            if (unitSystem === UnitSystem.IMPERIAL) {
                 values = {
                    'h_in': { value: convertValue(inletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'BTU/lb' },
                    'RH_out': { value: outletAir.rh, unit: '%' },
                };
            } else {
                 values = {
                    'h_in': { value: inletAir.enthalpy, unit: 'kJ/kg(DA)' },
                    'RH_out': { value: outletAir.rh, unit: '%' },
                };
            }
            return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
        }
        if (type === EquipmentType.STEAM_HUMIDIFIER) {
            const formulaPath = 'tooltips.steam_humidifier.outletTemp';
            const title = t(`${formulaPath}.title`);
            const formula = t(`${formulaPath}.${unitSystem}.formula`);
            const legend = t(`${formulaPath}.${unitSystem}.legend`);
            const steamRes = results as SteamHumidifierResults;
    
            let values = {};
            if (unitSystem === UnitSystem.IMPERIAL) {
                values = {
                    'h_in': { value: convertValue(inletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'BTU/lb' },
                    'x_in': { value: convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                    'h_steam': { value: convertValue(steamRes.steamEnthalpy, 'steam_enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'BTU/lb' },
                    'RH_out': { value: outletAir.rh, unit: '%' },
                };
            } else {
                values = {
                    'h_in': { value: inletAir.enthalpy, unit: 'kJ/kg(DA)' },
                    'x_in': { value: inletAir.absHumidity, unit: 'g/kg(DA)' },
                    'h_steam': { value: (steamRes.steamEnthalpy ?? 0) * 4.186, unit: 'kJ/kg' },
                    'RH_out': { value: outletAir.rh, unit: '%' },
                };
            }
            return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
        }
        return null;
    }, [type, results, inletAir, outletAir.rh, locale, unitSystem, t]);

    const outletRhTooltip = useMemo(() => {
        if (outletAir.temp === null || outletAir.absHumidity === null) return null;
        
        const formulaPath = 'tooltips.airProperties.rhFromTX';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            const W_kg_kgDA = outletAir.absHumidity / 1000;
            const Pv_from_W = (PSYCH_CONSTANTS.ATM_PRESSURE_PA * W_kg_kgDA) / (0.622 + W_kg_kgDA);
            values = {
                't_f': { value: convertValue(outletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                'x': { value: convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                'P_v': { value: Pv_from_W, unit: 'Pa' },
            };
        } else {
            const W_kg_kgDA = outletAir.absHumidity / 1000;
            const Pv_from_W = (PSYCH_CONSTANTS.ATM_PRESSURE_PA * W_kg_kgDA) / (0.622 + W_kg_kgDA);
            const Psat = calculatePsat(outletAir.temp);
            values = {
                't': { value: outletAir.temp, unit: '°C' },
                'x': { value: outletAir.absHumidity, unit: 'g/kg(DA)' },
                'P_v': { value: Pv_from_W, unit: 'Pa' },
                'P_sat': { value: Psat, unit: 'Pa' },
            };
        }

        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [outletAir.temp, outletAir.absHumidity, locale, unitSystem, t]);

    const outletAbsHumidityTooltip = useMemo(() => {
        let formulaPath = '';
        let values = {};
        let showTooltip = false;

        switch (type) {
            case EquipmentType.BURNER:
            case EquipmentType.SPRAY_WASHER:
            case EquipmentType.STEAM_HUMIDIFIER:
                formulaPath = 'tooltips.airProperties.absHumidityFromTH';
                if (unitSystem === UnitSystem.IMPERIAL) {
                    values = {
                        'h': { value: convertValue(outletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'BTU/lb' },
                        't': { value: convertValue(outletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                    };
                } else {
                    values = {
                        'h': { value: outletAir.enthalpy, unit: 'kJ/kg(DA)' },
                        't': { value: outletAir.temp, unit: '°C' },
                    };
                }
                showTooltip = true;
                break;
            case EquipmentType.HEATING_COIL:
            case EquipmentType.FAN:
                 formulaPath = 'tooltips.airProperties.constantAbsHumidity';
                 if (unitSystem === UnitSystem.IMPERIAL) {
                    values = {
                        'x_in': { value: convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                        'x_out': { value: convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' }
                    };
                 } else {
                    values = {
                        'x_in': { value: inletAir.absHumidity, unit: 'g/kg(DA)' },
                        'x_out': { value: outletAir.absHumidity, unit: 'g/kg(DA)' }
                    };
                 }
                 showTooltip = true;
                break;
            case EquipmentType.COOLING_COIL:
                 formulaPath = 'tooltips.airProperties.absHumidityFromTRh';
                 if (unitSystem === UnitSystem.IMPERIAL) {
                     values = {
                         't_f': { value: convertValue(outletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                         'rh': { value: outletAir.rh, unit: '%' },
                     };
                 } else {
                     const P_sat = calculatePsat(outletAir.temp ?? 0);
                     values = {
                         't': { value: outletAir.temp, unit: '°C' },
                         'rh': { value: outletAir.rh, unit: '%' },
                         'P_sat': { value: P_sat, unit: 'Pa' },
                         'P_v': { value: P_sat * ( (outletAir.rh ?? 0) / 100), unit: 'Pa' },
                     };
                 }
                 showTooltip = true;
                break;
            default:
                return null;
        }

        if (showTooltip && formulaPath) {
            const title = t(`${formulaPath}.title`);
            const formula = t(`${formulaPath}.${unitSystem}.formula`);
            const legend = t(`${formulaPath}.${unitSystem}.legend`);
            return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
        }
        return null;

    }, [type, outletAir, inletAir.absHumidity, locale, unitSystem, t]);

    const outletEnthalpyTooltip = useMemo(() => {
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                't': { value: convertValue(outletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                'x': { value: convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
             values = {
                't': { value: outletAir.temp, unit: '°C' },
                'x': { value: outletAir.absHumidity, unit: 'g/kg(DA)' },
            };
        }
       
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [outletAir.temp, outletAir.absHumidity, locale, unitSystem, t]);

    const steamAbsPressureTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER) return null;
    
        const steamCond = conditions as SteamHumidifierConditions;
        const steamRes = results as SteamHumidifierResults;
        if (steamCond.steamGaugePressure === null || steamCond.steamGaugePressure === undefined || steamRes.steamAbsolutePressure === null || steamRes.steamAbsolutePressure === undefined) return null;
    
        const formulaPath = 'tooltips.steam_humidifier.steamAbsolutePressure';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            const atm_pressure_psi = convertValue(101.325, 'steam_pressure', UnitSystem.SI, UnitSystem.IMPERIAL)!;
            values = {
                'P_gauge': { value: convertValue(steamCond.steamGaugePressure, 'steam_pressure', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'psiG' },
                'P_atm': { value: atm_pressure_psi, unit: 'psi' }
            };
        } else {
            values = {
                'P_gauge': { value: steamCond.steamGaugePressure, unit: 'kPaG' },
                'P_atm': { value: 101.325, unit: 'kPa' }
            };
        }
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, conditions, results, unitSystem, locale, t]);
    
    const steamPropertiesTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER) return null;
    
        const steamRes = results as SteamHumidifierResults;
        if (steamRes.steamAbsolutePressure === null || steamRes.steamAbsolutePressure === undefined) return null;
    
        const formulaPath = 'tooltips.steam_humidifier.steamProperties';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'P_abs': { value: convertValue(steamRes.steamAbsolutePressure, 'steam_pressure', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'psi' }
            };
        } else {
            values = {
                'P_abs': { value: steamRes.steamAbsolutePressure, unit: 'kPa' }
            };
        }
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, results, unitSystem, locale, t]);
    
    const faceVelocityTooltip = useMemo(() => {
        if (type !== EquipmentType.FILTER) return null;
        const filterCond = conditions as FilterConditions;
        const formulaPath = 'tooltips.filter.faceVelocity';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            const area_ft2 = convertValue(((filterCond.width ?? 0) / 1000) * ((filterCond.height ?? 0) / 1000) * (filterCond.sheets ?? 1), 'area', UnitSystem.SI, UnitSystem.IMPERIAL);
            values = {
                 'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                 'a_total': { value: area_ft2, unit: 'ft²' }
            }
        } else {
            const area_m2 = ((filterCond.width ?? 0) / 1000) * ((filterCond.height ?? 0) / 1000) * (filterCond.sheets ?? 1);
            values = {
                'q': { value: airflow, unit: 'm³/min' },
                'a_total': { value: area_m2, unit: 'm²' }
            }
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, airflow, conditions, locale, unitSystem, t]);

    const airflowPerSheetTooltip = useMemo(() => {
        if (type !== EquipmentType.FILTER) return null;
        const filterCond = conditions as FilterConditions;
        const formulaPath = 'tooltips.filter.airflowPerSheet';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        const numSheets = filterCond.sheets ?? 1;

        let values = {};
         if(unitSystem === UnitSystem.IMPERIAL) {
            values = {
                 'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                 'n': { value: numSheets, unit: t(`units.imperial.sheets`) }
            }
        } else {
            values = {
                'q': { value: airflow, unit: 'm³/min' },
                'n': { value: numSheets, unit: t(`units.si.sheets`) }
            }
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, airflow, conditions, locale, unitSystem, t]);

    const burnerHeatLoadTooltip = useMemo(() => {
        if (type !== EquipmentType.BURNER) return null;
        const burnerRes = results as BurnerResults;
        const burnerCond = conditions as BurnerConditions;
        const formulaPath = 'tooltips.burner.heatLoad';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            const delta_t = convertValue(outletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL)! - convertValue(inletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL)!;
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'Δt': { value: delta_t, unit: '°F' },
                'SHF': { value: burnerCond.shf, unit: '' },
            }
        } else {
            values = {
                'Q': { value: burnerRes.heatLoad_kW, unit: 'kW' },
                'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                'Δt': { value: (outletAir.temp ?? 0) - (inletAir.temp ?? 0), unit: '°C' },
                'SHF': { value: burnerCond.shf, unit: '' },
            }
        }
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, massFlowRateDA_kg_s, outletAir.temp, inletAir.temp, conditions, airflow, results, locale, unitSystem, t]);

    const airSideTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const formulaPath = 'tooltips.coil.airSideHeatLoad';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'h_in': { value: convertValue(inletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'BTU/lb' },
                'h_out': { value: convertValue(outletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'BTU/lb' },
            };
        } else {
            values = {
                'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                'h_in': { value: inletAir.enthalpy, unit: 'kJ/kg(DA)' },
                'h_out': { value: outletAir.enthalpy, unit: 'kJ/kg(DA)' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, locale, unitSystem, t]);

    const waterSideTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL && type !== EquipmentType.HEATING_COIL) return null;
        
        const coilResults = results as CoolingCoilResults | HeatingCoilResults;
        const coilConditions = conditions as CoolingCoilConditions | HeatingCoilConditions;

        const formulaPath = 'tooltips.coil.waterSideHeatLoad';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
             const airSideHeatLoad_BTUh = convertValue(coilResults.airSideHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
             values = {
                'Q_air': { value: airSideHeatLoad_BTUh, unit: 'BTU/h' },
                'η': { value: coilConditions.heatExchangeEfficiency, unit: '%' },
             };
        } else {
            const airSideHeatLoad_kW = (coilResults.airSideHeatLoad_kcal ?? 0) / 860.421;
            values = {
               'Q_air': { value: airSideHeatLoad_kW, unit: 'kW' },
               'η': { value: coilConditions.heatExchangeEfficiency, unit: '%' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, results, conditions, locale, unitSystem, t]);

    const waterFlowTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const coolRes = results as CoolingCoilResults;
        const coolCond = conditions as CoolingCoilConditions;
        const formulaPath = 'tooltips.coil.waterFlow';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
         
        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            const waterSideHeatLoad_BTUh = convertValue(coolRes.coldWaterSideHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
            const delta_t_w = convertValue(coolCond.chilledWaterOutletTemp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL)! - convertValue(coolCond.chilledWaterInletTemp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL)!;
            values = {
                'Q_BTUh': { value: waterSideHeatLoad_BTUh, unit: 'BTU/h' },
                'Δt_w': { value: delta_t_w, unit: '°F' },
            };
        } else {
            const waterSideHeatLoad_kW = (coolRes.coldWaterSideHeatLoad_kcal ?? 0) / 860.421;
            values = {
                'Q_kW': { value: waterSideHeatLoad_kW, unit: 'kW' },
                'Δt_w': { value: (coolCond.chilledWaterOutletTemp ?? 0) - (coolCond.chilledWaterInletTemp ?? 0), unit: '°C' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, results, conditions, locale, unitSystem, t]);

    const dehumidificationTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const formulaPath = 'tooltips.coil.dehumidification';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'x_in': { value: convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                'x_out': { value: convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
            values = {
               'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
               'x_in': { value: inletAir.absHumidity, unit: 'g/kg(DA)' },
               'x_out': { value: outletAir.absHumidity, unit: 'g/kg(DA)' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, locale, unitSystem, t]);

    const heatAirSideTooltip = useMemo(() => {
        if (type !== EquipmentType.HEATING_COIL) return null;
        const formulaPath = 'tooltips.coil.airSideHeatLoad';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'h_in': { value: convertValue(inletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'BTU/lb' },
                'h_out': { value: convertValue(outletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'BTU/lb' },
            };
        } else {
            values = {
                'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                'h_in': { value: inletAir.enthalpy, unit: 'kJ/kg(DA)' },
                'h_out': { value: outletAir.enthalpy, unit: 'kJ/kg(DA)' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, locale, unitSystem, t]);

    const heatWaterSideTooltip = useMemo(() => {
        if (type !== EquipmentType.HEATING_COIL) return null;
        const heatRes = results as HeatingCoilResults;
        const heatCond = conditions as HeatingCoilConditions;
        const formulaPath = 'tooltips.coil.waterSideHeatLoad';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
             const airSideHeatLoad_BTUh = convertValue(heatRes.airSideHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
             values = {
                'Q_air': { value: airSideHeatLoad_BTUh, unit: 'BTU/h' },
                'η': { value: heatCond.heatExchangeEfficiency, unit: '%' },
             };
        } else {
            const airSideHeatLoad_kW = (heatRes.airSideHeatLoad_kcal ?? 0) / 860.421;
            values = {
               'Q_air': { value: airSideHeatLoad_kW, unit: 'kW' },
               'η': { value: heatCond.heatExchangeEfficiency, unit: '%' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, results, conditions, locale, unitSystem, t]);

    const heatWaterFlowTooltip = useMemo(() => {
        if (type !== EquipmentType.HEATING_COIL) return null;
        const heatRes = results as HeatingCoilResults;
        const heatCond = conditions as HeatingCoilConditions;
        const formulaPath = 'tooltips.coil.waterFlow';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
         
        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            const waterSideHeatLoad_BTUh = convertValue(heatRes.hotWaterSideHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
            const delta_t_w = convertValue(heatCond.hotWaterInletTemp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL)! - convertValue(heatCond.hotWaterOutletTemp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL)!;
            values = {
                'Q_BTUh': { value: waterSideHeatLoad_BTUh, unit: 'BTU/h' },
                'Δt_w': { value: delta_t_w, unit: '°F' },
            };
        } else {
            const waterSideHeatLoad_kW = (heatRes.hotWaterSideHeatLoad_kcal ?? 0) / 860.421;
            values = {
                'Q_kW': { value: waterSideHeatLoad_kW, unit: 'kW' },
                'Δt_w': { value: (heatCond.hotWaterInletTemp ?? 0) - (heatCond.hotWaterOutletTemp ?? 0), unit: '°C' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, results, conditions, locale, unitSystem, t]);

    const humidificationTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER) return null;
        const formulaPath = 'tooltips.spray_washer.humidification';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'x_in': { value: convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                'x_out': { value: convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
            values = {
               'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
               'x_in': { value: inletAir.absHumidity, unit: 'g/kg(DA)' },
               'x_out': { value: outletAir.absHumidity, unit: 'g/kg(DA)' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
     }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, locale, unitSystem, t]);

     const sprayAmountTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER) return null;
        const sprayCond = conditions as SprayWasherConditions;
        const formulaPath = 'tooltips.spray_washer.sprayAmount';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            values = {
               'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
               'ρ': { value: convertValue(currentInletAirCalculated.density, 'density', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'lb/ft³'},
               'L/G': { value: sprayCond.waterToAirRatio, unit: '' },
            };
        } else {
             values = {
                'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                'L/G': { value: sprayCond.waterToAirRatio, unit: '' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
     }, [type, massFlowRateDA_kg_s, conditions, airflow, currentInletAirCalculated.density, locale, unitSystem, t]);

     const efficiencyTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER) return null;
        const formulaPath = 'tooltips.spray_washer.humidificationEfficiency';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
         let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            values = {
               'x_out': { value: convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
               'x_in': { value: convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
               'x_sat': { value: convertValue(sprayWasherCalculatedValues.finalWSat, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
            values = {
               'x_out': { value: outletAir.absHumidity, unit: 'g/kg(DA)' },
               'x_in': { value: inletAir.absHumidity, unit: 'g/kg(DA)' },
               'x_sat': { value: sprayWasherCalculatedValues.finalWSat, unit: 'g/kg(DA)' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
     }, [type, outletAir.absHumidity, inletAir.absHumidity, sprayWasherCalculatedValues.finalWSat, locale, unitSystem, t]);

    const requiredSteamTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER) return null;
        const formulaPath = 'tooltips.steam_humidifier.requiredSteam';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'x_in': { value: convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                'x_out': { value: convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
            values = {
                'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                'x_in': { value: inletAir.absHumidity, unit: 'g/kg(DA)' },
                'x_out': { value: outletAir.absHumidity, unit: 'g/kg(DA)' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, locale, unitSystem, t]);

    const heatGenerationTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN) return null;
        const fanCond = conditions as FanConditions;
        const formulaPath = 'tooltips.fan.heatGeneration';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values = {};

        if(unitSystem === UnitSystem.IMPERIAL) {
            values = {
               'P': { value: convertValue(fanCond.motorOutput, 'motor_power', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'HP' },
               'η': { value: fanCond.motorEfficiency, unit: '%' },
            };
        } else {
            values = {
               'P': { value: fanCond.motorOutput, unit: 'kW' },
               'η': { value: fanCond.motorEfficiency, unit: '%' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
     }, [type, conditions, locale, unitSystem, t]);

     const tempRiseTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN) return null;
        const fanRes = results as FanResults;
        const formulaPath = 'tooltips.fan.tempRise';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values = {};

        if(unitSystem === UnitSystem.IMPERIAL) {
            const heatGenBTUh = convertValue(fanRes.heatGeneration_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
            values = {
               'Q_BTUh': { value: heatGenBTUh, unit: 'BTU/h' },
               'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
            };
        } else {
            const heatGenKw = (fanRes.heatGeneration_kcal ?? 0) / 860.421;
            values = {
               'Q_kW': { value: heatGenKw, unit: 'kW' },
               'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
     }, [type, results, massFlowRateDA_kg_s, airflow, locale, unitSystem, t]);
     
    const velocityTooltip = useMemo(() => {
        if (type !== EquipmentType.DAMPER) return null;
        const damperCond = conditions as DamperConditions;
        const formulaPath = 'tooltips.damper.airVelocity';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values = {};
        const area_m2 = ((damperCond.width ?? 0) / 1000) * ((damperCond.height ?? 0) / 1000);

        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'A': { value: convertValue(area_m2, 'area', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'ft²' },
            };
        } else {
            values = {
               'q': { value: airflow, unit: 'm³/min' },
               'A': { value: area_m2, unit: 'm²' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, airflow, conditions, locale, unitSystem, t]);

    const pressureLossTooltip = useMemo(() => {
        if (type !== EquipmentType.DAMPER) return null;
        const damperRes = results as DamperResults;
        const damperCond = conditions as DamperConditions;
        const formulaPath = 'tooltips.damper.pressureLoss';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values = {};
        
        if (unitSystem === UnitSystem.IMPERIAL) {
            const velocity_fpm = convertValue(damperRes.airVelocity_m_s, 'velocity', UnitSystem.SI, UnitSystem.IMPERIAL);
            values = {
                'K': { value: damperCond.lossCoefficientK, unit: '' },
                'v': { value: velocity_fpm, unit: 'fpm' },
            };
        } else {
            values = {
               'K': { value: damperCond.lossCoefficientK, unit: '' },
               'ρ': { value: currentInletAirCalculated.density, unit: 'kg/m³' },
               'v': { value: damperRes.airVelocity_m_s, unit: 'm/s' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, conditions, results, currentInletAirCalculated.density, locale, unitSystem, t]);

    const renderConditions = () => {
        switch(type) {
            case EquipmentType.FILTER:
                const filterCond = conditions as FilterConditions;
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.width')}</span><NumberInputWithControls value={filterCond.width ?? null} onChange={(val) => handleConditionChange('width', val)} unitType='length' unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.height')}</span><NumberInputWithControls value={filterCond.height ?? null} onChange={(val) => handleConditionChange('height', val)} unitType='length' unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.thickness')}</span><NumberInputWithControls value={filterCond.thickness ?? null} onChange={(val) => handleConditionChange('thickness', val)} unitType='length' unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.sheets')}</span><NumberInputWithControls value={filterCond.sheets ?? null} onChange={(val) => handleConditionChange('sheets', val)} unitType='sheets' unitSystem={unitSystem} /></div>
                    </div>
                );
            case EquipmentType.BURNER:
                const burnerCond = conditions as BurnerConditions;
                return <div className={conditionRowClasses}><span className="text-sm">{t('conditions.shf')}</span><NumberInputWithControls value={burnerCond.shf ?? null} onChange={(val) => handleConditionChange('shf', val)} unitType='shf' unitSystem={unitSystem} min={0} max={1} step={0.05} /></div>
            case EquipmentType.COOLING_COIL:
                const coolCond = conditions as CoolingCoilConditions;
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.chilledWaterInletTemp')}</span><NumberInputWithControls value={coolCond.chilledWaterInletTemp ?? null} onChange={(val) => handleConditionChange('chilledWaterInletTemp', val)} unitType='temperature' unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.chilledWaterOutletTemp')}</span><NumberInputWithControls value={coolCond.chilledWaterOutletTemp ?? null} onChange={(val) => handleConditionChange('chilledWaterOutletTemp', val)} unitType='temperature' unitSystem={unitSystem} /></div>
                        <div className={`${conditionRowClasses}`}><span className="text-sm">{t('conditions.heatExchangeEfficiency')}</span><NumberInputWithControls value={coolCond.heatExchangeEfficiency ?? null} onChange={(val) => handleConditionChange('heatExchangeEfficiency', val)} unitType='efficiency' unitSystem={unitSystem} min={0} max={100} /></div>
                    </div>
                );
            case EquipmentType.HEATING_COIL:
                const heatCond = conditions as HeatingCoilConditions;
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.hotWaterInletTemp')}</span><NumberInputWithControls value={heatCond.hotWaterInletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterInletTemp', val)} unitType='temperature' unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.hotWaterOutletTemp')}</span><NumberInputWithControls value={heatCond.hotWaterOutletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterOutletTemp', val)} unitType='temperature' unitSystem={unitSystem} /></div>
                        <div className={`${conditionRowClasses}`}><span className="text-sm">{t('conditions.heatExchangeEfficiency')}</span><NumberInputWithControls value={heatCond.heatExchangeEfficiency ?? null} onChange={(val) => handleConditionChange('heatExchangeEfficiency', val)} unitType='efficiency' unitSystem={unitSystem} min={0} max={100} /></div>
                    </div>
                );
            case EquipmentType.ELIMINATOR:
                const elimCond = conditions as EliminatorConditions;
                return (
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('conditions.eliminatorType')}</span>
                        <select value={elimCond.eliminatorType} onChange={(e) => handleConditionChange('eliminatorType', e.target.value)} className="px-2 py-1 border border-slate-300 rounded-md bg-white">
                            <option value="3-fold">{t('conditions.eliminator_3_fold')}</option>
                            <option value="6-fold">{t('conditions.eliminator_6_fold')}</option>
                        </select>
                    </div>
                );
            case EquipmentType.SPRAY_WASHER:
                const sprayCond = conditions as SprayWasherConditions;
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={conditionRowClasses}>
                            <span className="text-sm">{t('conditions.waterToAirRatio')}</span>
                            <NumberInputWithControls value={sprayCond.waterToAirRatio ?? null} onChange={(val) => handleConditionChange('waterToAirRatio', val)} unitType='water_to_air_ratio' unitSystem={unitSystem} min={0} step={0.1} />
                        </div>
                    </div>
                );
            case EquipmentType.STEAM_HUMIDIFIER:
                const steamCond = conditions as SteamHumidifierConditions;
                const steamRes = results as SteamHumidifierResults;

                const handlePressureValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const stringValue = e.target.value;
                    setPressureInputValue(stringValue);
                    const numValue = parseFloat(stringValue);
                    if (!isNaN(numValue)) {
                        const valueInKpa = convertSteamPressure(
                            numValue,
                            steamCond.steamGaugePressureUnit || SteamPressureUnit.KPAG,
                            SteamPressureUnit.KPAG
                        );
                        handleConditionChange('steamGaugePressure', valueInKpa);
                    } else if (stringValue === '') {
                        handleConditionChange('steamGaugePressure', null);
                    }
                };
            
                const handlePressureUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
                    const newUnit = e.target.value as SteamPressureUnit;
                    handleConditionChange('steamGaugePressureUnit', newUnit);
                };

                return (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={conditionRowClasses}>
                            <span className="text-sm">{t('conditions.steamGaugePressure')}</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={pressureInputValue}
                                    onChange={handlePressureValueChange}
                                    onFocus={(e) => e.target.select()}
                                    className={inputClasses}
                                />
                                <select
                                    value={steamCond.steamGaugePressureUnit || SteamPressureUnit.KPAG}
                                    onChange={handlePressureUnitChange}
                                    className="px-2 py-1 border border-slate-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {Object.values(SteamPressureUnit).map(unit => (
                                        <option key={unit} value={unit}>
                                            {t(`units.pressure_units.${unit}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className={conditionRowClasses}>
                            <span className="text-sm">{t('results.steamAbsolutePressure')}</span>
                            <DisplayValueWithUnit value={steamRes.steamAbsolutePressure} unitType="steam_pressure" unitSystem={unitSystem} tooltipContent={steamAbsPressureTooltip} />
                        </div>
                         <div className={conditionRowClasses}>
                            <span className="text-sm">{t('results.steamTemperature')}</span>
                            <DisplayValueWithUnit value={steamRes.steamTemperature} unitType="temperature" unitSystem={unitSystem} tooltipContent={steamPropertiesTooltip} />
                        </div>
                         <div className={conditionRowClasses}>
                            <span className="text-sm">{t('results.steamEnthalpy')}</span>
                            <DisplayValueWithUnit value={steamRes.steamEnthalpy} unitType="steam_enthalpy" unitSystem={unitSystem} tooltipContent={steamPropertiesTooltip} />
                        </div>
                    </div>
                );
            case EquipmentType.FAN:
                 const fanCond = conditions as FanConditions;
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={conditionRowClasses}>
                            <span className="text-sm">{t('conditions.motorOutput')}</span>
                            <select value={fanCond.motorOutput} onChange={(e) => handleConditionChange('motorOutput', parseFloat(e.target.value))} className="px-2 py-1 border border-slate-300 rounded-md bg-white">
                                {MOTOR_OUTPUT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt} kW</option>)}
                            </select>
                        </div>
                        <div className={conditionRowClasses}>
                            <span className="text-sm">{t('conditions.motorEfficiency')}</span>
                            <NumberInputWithControls value={fanCond.motorEfficiency ?? null} onChange={(val) => handleConditionChange('motorEfficiency', val)} unitType='efficiency' unitSystem={unitSystem} min={0} max={100} />
                        </div>
                    </div>
                );
            case EquipmentType.DAMPER:
                const damperCond = conditions as DamperConditions;
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.width')}</span><NumberInputWithControls value={damperCond.width ?? null} onChange={(val) => handleConditionChange('width', val)} unitType='length' unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.height')}</span><NumberInputWithControls value={damperCond.height ?? null} onChange={(val) => handleConditionChange('height', val)} unitType='length' unitSystem={unitSystem} /></div>
                        <div className={`${conditionRowClasses}`}><span className="text-sm">{t('conditions.lossCoefficientK')}</span><NumberInputWithControls value={damperCond.lossCoefficientK ?? null} onChange={(val) => handleConditionChange('lossCoefficientK', val)} unitType='k_value' unitSystem={unitSystem} step={0.1} /></div>
                    </div>
                );
            default: return null;
        }
    }
    
    const renderResults = () => {
        const resultRowClasses = "flex flex-wrap justify-between items-center gap-2 py-1 text-sm";
        switch(type) {
            case EquipmentType.FILTER: {
                const filterRes = results as FilterResults;
                return (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.faceVelocity')}</span><DisplayValueWithUnit value={filterRes.faceVelocity} unitType="velocity" unitSystem={unitSystem} tooltipContent={faceVelocityTooltip} /></div>
                        <div className={resultRowClasses}><span>{t('results.treatedAirflowPerSheet')}</span><DisplayValueWithUnit value={filterRes.treatedAirflowPerSheet} unitType="airflow_per_sheet" unitSystem={unitSystem} tooltipContent={airflowPerSheetTooltip} /></div>
                    </div>
                );
            }
            case EquipmentType.BURNER: {
                const burnerRes = results as BurnerResults;
                const heatLoad_kW = burnerRes.heatLoad_kW;
                if (heatLoad_kW == null) return null;

                const heatLoad_kcal = heatLoad_kW * 860.421;
                const heatLoad_btuh = convertValue(heatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);

                if (unitSystem === UnitSystem.SI) {
                    return (
                        <div className={resultRowClasses}>
                            <span>{t('results.heatLoad_kcal')}</span>
                            <div className="flex flex-col items-end">
                                <Tooltip content={burnerHeatLoadTooltip}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-bold">{formatNumber(heatLoad_kW)}</span>
                                        <span className="text-sm w-24 text-left pl-1">kW</span>
                                    </div>
                                </Tooltip>
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    <div className="flex flex-col items-end">
                                        <span>({formatNumber(heatLoad_kcal)} kcal/h)</span>
                                        <span>({formatNumber(heatLoad_btuh)} BTU/h)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                } else { // Imperial
                    return (
                         <div className={resultRowClasses}>
                            <span>{t('results.heatLoad_kcal')}</span>
                             <div className="flex flex-col items-end">
                                <Tooltip content={burnerHeatLoadTooltip}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-bold">{formatNumber(heatLoad_btuh)}</span>
                                        <span className="text-sm w-24 text-left pl-1">{t('units.imperial.heat_load')}</span>
                                    </div>
                                </Tooltip>
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    <div className="flex flex-col items-end">
                                        <span>({formatNumber(heatLoad_kW)} kW)</span>
                                        <span>({formatNumber(heatLoad_kcal)} kcal/h)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                }
            }
            case EquipmentType.COOLING_COIL: {
                const coolRes = results as CoolingCoilResults;
                const waterHeatLoad_kcal = coolRes.coldWaterSideHeatLoad_kcal;
                let waterHeatLoadDisplay = null;

                if (waterHeatLoad_kcal != null) {
                    const heatLoad_kW = waterHeatLoad_kcal / 860.421;
                    const heatLoad_btuh = convertValue(waterHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);

                    if (unitSystem === UnitSystem.SI) {
                        waterHeatLoadDisplay = (
                             <div className="flex flex-col items-end">
                                <Tooltip content={waterSideTooltip}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-bold">{formatNumber(heatLoad_kW)}</span>
                                        <span className="text-sm w-24 text-left pl-1">kW</span>
                                    </div>
                                </Tooltip>
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    <div className="flex flex-col items-end">
                                        <span>({formatNumber(waterHeatLoad_kcal)} kcal/h)</span>
                                        <span>({formatNumber(heatLoad_btuh)} BTU/h)</span>
                                    </div>
                                </div>
                            </div>
                        );
                    } else { // Imperial
                        waterHeatLoadDisplay = (
                             <div className="flex flex-col items-end">
                                <Tooltip content={waterSideTooltip}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-bold">{formatNumber(heatLoad_btuh)}</span>
                                        <span className="text-sm w-24 text-left pl-1">{t('units.imperial.heat_load')}</span>
                                    </div>
                                </Tooltip>
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    <div className="flex flex-col items-end">
                                        <span>({formatNumber(heatLoad_kW)} kW)</span>
                                        <span>({formatNumber(waterHeatLoad_kcal)} kcal/h)</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }
                }
                
                const airHeatLoad_kcal = coolRes.airSideHeatLoad_kcal;
                let airHeatLoadDisplay = null;
                if (airHeatLoad_kcal != null) {
                    const heatLoad_kW = airHeatLoad_kcal / 860.421;
                    const heatLoad_btuh = convertValue(airHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
                
                    if (unitSystem === UnitSystem.SI) {
                        airHeatLoadDisplay = (
                            <div className="flex flex-col items-end">
                                <Tooltip content={airSideTooltip}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-bold">{formatNumber(heatLoad_kW)}</span>
                                        <span className="text-sm w-24 text-left pl-1">kW</span>
                                    </div>
                                </Tooltip>
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    <div className="flex flex-col items-end">
                                        <span>({formatNumber(airHeatLoad_kcal)} kcal/h)</span>
                                        <span>({formatNumber(heatLoad_btuh)} BTU/h)</span>
                                    </div>
                                </div>
                            </div>
                        );
                    } else { // Imperial
                        airHeatLoadDisplay = (
                            <div className="flex flex-col items-end">
                                <Tooltip content={airSideTooltip}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-bold">{formatNumber(heatLoad_btuh)}</span>
                                        <span className="text-sm w-24 text-left pl-1">{t('units.imperial.heat_load')}</span>
                                    </div>
                                </Tooltip>
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    <div className="flex flex-col items-end">
                                        <span>({formatNumber(heatLoad_kW)} kW)</span>
                                        <span>({formatNumber(airHeatLoad_kcal)} kcal/h)</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }
                }

                return (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.airSideHeatLoad_kcal')}</span>{airHeatLoadDisplay}</div>
                        <div className={resultRowClasses}>
                            <span>{t('results.coldWaterSideHeatLoad_kcal')}</span>
                            {waterHeatLoadDisplay}
                        </div>
                        <div className={resultRowClasses}><span>{t('results.chilledWaterFlow_L_min')}</span><DisplayValueWithUnit value={coolRes.chilledWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={waterFlowTooltip}/></div>
                        <div className={resultRowClasses}><span>{t('results.dehumidification_L_min')}</span><DisplayValueWithUnit value={coolRes.dehumidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={dehumidificationTooltip}/></div>
                    </div>
                );
            }
            case EquipmentType.HEATING_COIL: {
                 const heatRes = results as HeatingCoilResults;
                 const waterHeatLoad_kcal = heatRes.hotWaterSideHeatLoad_kcal;
                 let waterHeatLoadDisplay = null;
                 if (waterHeatLoad_kcal != null) {
                     const heatLoad_kW = waterHeatLoad_kcal / 860.421;
                     const heatLoad_btuh = convertValue(waterHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);

                     if (unitSystem === UnitSystem.SI) {
                         waterHeatLoadDisplay = (
                              <div className="flex flex-col items-end">
                                 <Tooltip content={heatWaterSideTooltip}>
                                     <div className="flex items-center justify-end gap-1">
                                         <span className="font-bold">{formatNumber(heatLoad_kW)}</span>
                                         <span className="text-sm w-24 text-left pl-1">kW</span>
                                     </div>
                                 </Tooltip>
                                 <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                     <div className="flex flex-col items-end">
                                         <span>({formatNumber(waterHeatLoad_kcal)} kcal/h)</span>
                                         <span>({formatNumber(heatLoad_btuh)} BTU/h)</span>
                                     </div>
                                 </div>
                             </div>
                         );
                     } else { // Imperial
                         waterHeatLoadDisplay = (
                              <div className="flex flex-col items-end">
                                 <Tooltip content={heatWaterSideTooltip}>
                                     <div className="flex items-center justify-end gap-1">
                                         <span className="font-bold">{formatNumber(heatLoad_btuh)}</span>
                                         <span className="text-sm w-24 text-left pl-1">{t('units.imperial.heat_load')}</span>
                                     </div>
                                 </Tooltip>
                                 <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                     <div className="flex flex-col items-end">
                                         <span>({formatNumber(heatLoad_kW)} kW)</span>
                                         <span>({formatNumber(waterHeatLoad_kcal)} kcal/h)</span>
                                     </div>
                                 </div>
                             </div>
                         );
                     }
                 }

                const airHeatLoad_kcal = heatRes.airSideHeatLoad_kcal;
                let airHeatLoadDisplay = null;
                if (airHeatLoad_kcal != null) {
                    const heatLoad_kW = airHeatLoad_kcal / 860.421;
                    const heatLoad_btuh = convertValue(airHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
                
                    if (unitSystem === UnitSystem.SI) {
                        airHeatLoadDisplay = (
                            <div className="flex flex-col items-end">
                                <Tooltip content={heatAirSideTooltip}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-bold">{formatNumber(heatLoad_kW)}</span>
                                        <span className="text-sm w-24 text-left pl-1">kW</span>
                                    </div>
                                </Tooltip>
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    <div className="flex flex-col items-end">
                                        <span>({formatNumber(airHeatLoad_kcal)} kcal/h)</span>
                                        <span>({formatNumber(heatLoad_btuh)} BTU/h)</span>
                                    </div>
                                </div>
                            </div>
                        );
                    } else { // Imperial
                        airHeatLoadDisplay = (
                            <div className="flex flex-col items-end">
                                <Tooltip content={heatAirSideTooltip}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="font-bold">{formatNumber(heatLoad_btuh)}</span>
                                        <span className="text-sm w-24 text-left pl-1">{t('units.imperial.heat_load')}</span>
                                    </div>
                                </Tooltip>
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    <div className="flex flex-col items-end">
                                        <span>({formatNumber(heatLoad_kW)} kW)</span>
                                        <span>({formatNumber(airHeatLoad_kcal)} kcal/h)</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }
                }

                 return (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.airSideHeatLoad_kcal')}</span>{airHeatLoadDisplay}</div>
                        <div className={resultRowClasses}>
                            <span>{t('results.hotWaterSideHeatLoad_kcal')}</span>
                            {waterHeatLoadDisplay}
                        </div>
                        <div className={resultRowClasses}><span>{t('results.hotWaterFlow_L_min')}</span><DisplayValueWithUnit value={heatRes.hotWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={heatWaterFlowTooltip} /></div>
                    </div>
                );
            }
            case EquipmentType.ELIMINATOR:
                 return <div className={resultRowClasses}><span>{t('results.pressureLoss_Pa')}</span><DisplayValueWithUnit value={pressureLoss} unitType="pressure" unitSystem={unitSystem} /></div>
            case EquipmentType.SPRAY_WASHER: {
                 const sprayRes = results as SprayWasherResultsType;
                 return (
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.humidification_L_min')}</span><DisplayValueWithUnit value={sprayRes.humidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={humidificationTooltip} /></div>
                        <div className={resultRowClasses}><span>{t('results.sprayAmount_L_min')}</span><DisplayValueWithUnit value={sprayRes.sprayAmount_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayAmountTooltip} /></div>
                        <div className={resultRowClasses}><span>{t('conditions.humidificationEfficiency')}</span><DisplayValueWithUnit value={sprayRes.humidificationEfficiency} unitType="efficiency" unitSystem={unitSystem} tooltipContent={efficiencyTooltip} /></div>
                    </div>
                 );
            }
            case EquipmentType.STEAM_HUMIDIFIER: {
                const steamRes = results as SteamHumidifierResults;
                return (
                    <div className={resultRowClasses}>
                        <span>{t('results.requiredSteamAmount')}</span>
                        <DisplayValueWithUnit 
                            value={steamRes.requiredSteamAmount} 
                            unitType="steam_flow" 
                            unitSystem={unitSystem} 
                            tooltipContent={requiredSteamTooltip} 
                        />
                    </div>
                );
            }
            case EquipmentType.FAN: {
                 const fanRes = results as FanResults;
                 return (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.heatGeneration_kcal')}</span><DisplayValueWithUnit value={fanRes.heatGeneration_kcal} unitType="heat_load" unitSystem={unitSystem} tooltipContent={heatGenerationTooltip}/></div>
                        <div className={resultRowClasses}><span>{t('results.tempRise_deltaT_celsius')}</span><DisplayValueWithUnit value={fanRes.tempRise_deltaT_celsius} unitType="temperature" unitSystem={UnitSystem.SI} tooltipContent={tempRiseTooltip}/></div>
                    </div>
                );
            }
            case EquipmentType.DAMPER: {
                const damperRes = results as DamperResults;
                return (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.airVelocity_m_s')}</span><DisplayValueWithUnit value={damperRes.airVelocity_m_s} unitType="velocity" unitSystem={unitSystem} tooltipContent={velocityTooltip} /></div>
                        <div className={resultRowClasses}><span>{t('results.pressureLoss_Pa')}</span><DisplayValueWithUnit value={damperRes.pressureLoss_Pa} unitType="pressure" unitSystem={unitSystem} tooltipContent={pressureLossTooltip} /></div>
                    </div>
                );
            }
            default: return null;
        }
    }

    return (
        <div className={`p-4 rounded-lg shadow-lg bg-white border-l-[6px] ${color}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <input type="text" value={name} onChange={(e) => handleUpdate('name', e.target.value)} onFocus={(e) => e.target.select()} className="flex-grow min-w-[150px] px-2 py-1 border border-slate-300 rounded-md bg-white text-left font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="flex items-center gap-2">
                    <button onClick={() => onMove(id, 'up')} disabled={index === 0} className="px-3 py-1 text-sm bg-slate-200 hover:bg-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                        {t('equipment.up')}
                    </button>
                    <button onClick={() => onMove(id, 'down')} disabled={index === totalEquipment - 1} className="px-3 py-1 text-sm bg-slate-200 hover:bg-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                        {t('equipment.down')}
                    </button>
                    <button onClick={() => onDelete(id)} className="px-3 py-1 text-sm bg-red-500 text-white hover:bg-red-600 rounded-md">
                        {t('equipment.delete')}
                    </button>
                </div>
            </div>

            {warningMessage && <div className="mt-2 p-2 text-sm bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500 rounded-r-lg">{warningMessage}</div>}

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Inlet Air Section */}
                <div className={sectionClasses}>
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold">{t('equipment.inletAir')}</h4>
                        <button
                            onClick={() => onReflectUpstream(id, index)}
                            title={index > 0 ? t('equipment.useUpstreamOutlet') : t('equipment.useACInlet')}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                        >
                            {index > 0 ? '↑' : '↰'} {index > 0 ? t('equipment.useUpstreamOutlet') : t('equipment.useACInlet')}
                        </button>
                    </div>
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('airProperties.temperature')}</span>
                        <NumberInputWithControls value={inletAir.temp} onChange={(val) => handleInletAirChange('temp', val)} unitType="temperature" unitSystem={unitSystem} />
                    </div>
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('airProperties.rh')}</span>
                        <NumberInputWithControls value={inletAir.rh} onChange={(val) => handleInletAirChange('rh', val)} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                    </div>
                    <hr className="my-2 border-slate-300"/>
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('airProperties.abs_humidity')}</span>
                        <DisplayValueWithUnit value={currentInletAirCalculated.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={inletAbsHumidityTooltip} />
                    </div>
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('airProperties.enthalpy')}</span>
                        <DisplayValueWithUnit value={currentInletAirCalculated.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={inletEnthalpyTooltip} />
                    </div>
                </div>

                {/* Outlet Air Section */}
                {isAirConditionSectionNeeded && (
                <div className={sectionClasses}>
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold">{t('equipment.outletAir')}</h4>
                        {type !== EquipmentType.FAN && (
                             <button
                                onClick={() => onReflectDownstream(id, index)}
                                title={index < totalEquipment - 1 ? t('equipment.useDownstreamInlet') : t('equipment.useACOutlet')}
                                className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                            >
                                {index < totalEquipment - 1 ? '↓' : '↱'} {index < totalEquipment - 1 ? t('equipment.useDownstreamInlet') : t('equipment.useACOutlet')}
                            </button>
                        )}
                    </div>
                    
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('airProperties.temperature')}</span>
                        {isOutletTempEditable ?
                            <NumberInputWithControls value={outletAir.temp} onChange={(val) => handleOutletAirChange('temp', val)} unitType="temperature" unitSystem={unitSystem} />
                            : <DisplayValueWithUnit value={outletAir.temp} unitType="temperature" unitSystem={unitSystem} tooltipContent={outletTempTooltip} />
                        }
                    </div>
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('airProperties.rh')}</span>
                        {isOutletRhEditable ?
                            <NumberInputWithControls value={outletAir.rh} onChange={(val) => handleOutletAirChange('rh', val)} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                            : <DisplayValueWithUnit value={outletAir.rh} unitType="rh" unitSystem={unitSystem} tooltipContent={outletRhTooltip} />
                        }
                    </div>
                    <hr className="my-2 border-slate-300"/>
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('airProperties.abs_humidity')}</span>
                        <DisplayValueWithUnit value={outletAir.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={outletAbsHumidityTooltip} />
                    </div>
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('airProperties.enthalpy')}</span>
                        <DisplayValueWithUnit value={outletAir.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={outletEnthalpyTooltip} />
                    </div>
                </div>
                )}
            </div>

            {showEquipmentConditionsSection && (
            <div className="mt-4">
                <div className={sectionClasses}>
                    <h4 className="font-semibold mb-2">{t('equipment.conditions')}</h4>
                    {renderConditions()}
                </div>
            </div>
            )}
            
            <div className="mt-4">
                <div className={sectionClasses}>
                    <h4 className="font-semibold mb-2">{t('equipment.results')}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                        <div className="flex justify-between items-center py-1 text-sm">
                            <span>{t('equipment.pressureLoss')}</span>
                            <NumberInputWithControls value={pressureLoss} onChange={(val) => handleUpdate('pressureLoss', val)} unitType="pressure" unitSystem={unitSystem} />
                        </div>
                    </div>
                    {Object.keys(results).length > 0 && <hr className="my-2 border-slate-300" />}
                    {renderResults()}
                </div>
            </div>
        </div>
    );
};

export default EquipmentItem;