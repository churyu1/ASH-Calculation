

import React, { useEffect, useMemo } from 'react';
import { 
    Equipment, UnitSystem, EquipmentType, AirProperties, 
    CoolingCoilConditions, HeatingCoilConditions, BurnerConditions, FanConditions, 
    DamperConditions, FilterConditions, SprayWasherConditions, EliminatorConditions,
    SteamHumidifierConditions, SteamHumidifierResults,
    CoolingCoilResults, HeatingCoilResults, BurnerResults, FanResults, DamperResults, 
    FilterResults, SprayWasherResults, CustomResults, EliminatorResults, EquipmentConditions,
    SprayWasherResults as SprayWasherResultsType
} from '../types';
import { calculateAirProperties, calculateAbsoluteHumidityFromEnthalpy, calculateEnthalpy, calculateAbsoluteHumidity, calculatePsat, PSYCH_CONSTANTS, calculateDewPoint, calculateRelativeHumidity, calculateSteamProperties } from '../services/psychrometrics';
import { MOTOR_OUTPUT_OPTIONS } from '../constants';
import { useLanguage } from '../i18n';
import NumberInputWithControls from './NumberInputWithControls';
import DisplayValueWithUnit from './DisplayValueWithUnit';
import { formatNumber, convertValue } from '../utils/conversions';
import FormulaTooltipContent from './FormulaTooltipContent';

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
                        
                        const heatLoad_kcal_h = totalHeat_kW * 860.421;
                        const heatLoad_W = totalHeat_kW * 1000;
                        newResults = { heatLoad_kcal: heatLoad_kcal_h, heatLoad_W: heatLoad_W } as BurnerResults;
                        
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [airflow, JSON.stringify(conditions), JSON.stringify(inletAir), JSON.stringify(outletAir)]);


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
                return (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={conditionRowClasses}>
                            <span className="text-sm">{t('conditions.steamGaugePressure')}</span>
                            <NumberInputWithControls value={steamCond.steamGaugePressure ?? null} onChange={(val) => handleConditionChange('steamGaugePressure', val)} unitType='steam_pressure' unitSystem={unitSystem} min={0} step={10} />
                        </div>
                        <div className={conditionRowClasses}>
                            <span className="text-sm">{t('results.steamAbsolutePressure')}</span>
                            <DisplayValueWithUnit value={steamRes.steamAbsolutePressure} unitType="steam_pressure" unitSystem={unitSystem} />
                        </div>
                         <div className={conditionRowClasses}>
                            <span className="text-sm">{t('results.steamTemperature')}</span>
                            <DisplayValueWithUnit value={steamRes.steamTemperature} unitType="temperature" unitSystem={unitSystem} />
                        </div>
                         <div className={conditionRowClasses}>
                            <span className="text-sm">{t('results.steamEnthalpy')}</span>
                            <DisplayValueWithUnit value={steamRes.steamEnthalpy} unitType="steam_enthalpy" unitSystem={unitSystem} />
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
                const filterCond = conditions as FilterConditions;
                
                const faceVelocityTooltip = useMemo(() => {
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
                }, [airflow, conditions, locale, unitSystem, t]);

                const airflowPerSheetTooltip = useMemo(() => {
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
                }, [airflow, conditions, locale, unitSystem, t]);

                return (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.faceVelocity')}</span><DisplayValueWithUnit value={filterRes.faceVelocity} unitType="velocity" unitSystem={unitSystem} tooltipContent={faceVelocityTooltip} /></div>
                        <div className={resultRowClasses}><span>{t('results.treatedAirflowPerSheet')}</span><DisplayValueWithUnit value={filterRes.treatedAirflowPerSheet} unitType="airflow_per_sheet" unitSystem={unitSystem} tooltipContent={airflowPerSheetTooltip} /></div>
                    </div>
                );
            }
            case EquipmentType.BURNER: {
                const burnerRes = results as BurnerResults;
                const burnerCond = conditions as BurnerConditions;
                const burnerHeatLoadTooltip = useMemo(() => {
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
                        const heatLoad_kW = (burnerRes.heatLoad_kcal ?? 0) / 860.421;
                        values = {
                            'Q': { value: heatLoad_kW, unit: 'kW' },
                            'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                            'Δt': { value: (outletAir.temp ?? 0) - (inletAir.temp ?? 0), unit: '°C' },
                            'SHF': { value: burnerCond.shf, unit: '' },
                        }
                    }
                    
                    return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
                }, [massFlowRateDA_kg_s, outletAir.temp, inletAir.temp, conditions, airflow, results, locale, unitSystem, t]);
                
                return (
                    <div className={resultRowClasses}>
                        <span>{t('results.heatLoad_kcal')}</span>
                        <div className="flex flex-col items-end">
                            <DisplayValueWithUnit value={burnerRes.heatLoad_kcal} unitType="heat_load" unitSystem={unitSystem} tooltipContent={burnerHeatLoadTooltip} />
                            {burnerRes.heatLoad_W != null && (
                                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                                    ({formatNumber(burnerRes.heatLoad_W)} W)
                                </div>
                            )}
                        </div>
                    </div>
                );
            }
            case EquipmentType.COOLING_COIL: {
                const coolRes = results as CoolingCoilResults;
                const coolCond = conditions as CoolingCoilConditions;

                const airSideTooltip = useMemo(() => {
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
                }, [massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, locale, unitSystem, t]);

                const waterSideTooltip = useMemo(() => {
                    const formulaPath = 'tooltips.coil.waterSideHeatLoad';
                    const title = t(`${formulaPath}.title`);
                    const formula = t(`${formulaPath}.${unitSystem}.formula`);
                    const legend = t(`${formulaPath}.${unitSystem}.legend`);

                    let values = {};
                    if(unitSystem === UnitSystem.IMPERIAL) {
                         const airSideHeatLoad_BTUh = convertValue(coolRes.airSideHeatLoad_kcal, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
                         values = {
                            'Q_air': { value: airSideHeatLoad_BTUh, unit: 'BTU/h' },
                            'η': { value: coolCond.heatExchangeEfficiency, unit: '%' },
                         };
                    } else {
                        const airSideHeatLoad_kW = (coolRes.airSideHeatLoad_kcal ?? 0) / 860.421;
                        values = {
                           'Q_air': { value: airSideHeatLoad_kW, unit: 'kW' },
                           'η': { value: coolCond.heatExchangeEfficiency, unit: '%' },
                       };
                    }
                    return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
                }, [results, conditions, locale, unitSystem, t]);

                 const waterFlowTooltip = useMemo(() => {
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
                }, [results, conditions, locale, unitSystem, t]);

                const dehumidificationTooltip = useMemo(() => {
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
                }, [massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, locale, unitSystem, t]);

                return (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.airSideHeatLoad_kcal')}</span><DisplayValueWithUnit value={coolRes.airSideHeatLoad_kcal} unitType="heat_load" unitSystem={unitSystem} tooltipContent={airSideTooltip}/></div>
                        <div className={resultRowClasses}><span>{t('results.coldWaterSideHeatLoad_kcal')}</span><DisplayValueWithUnit value={coolRes.coldWaterSideHeatLoad_kcal} unitType="heat_load" unitSystem={unitSystem} tooltipContent={waterSideTooltip}/></div>
                        <div className={resultRowClasses}><span>{t('results.chilledWaterFlow_L_min')}</span><DisplayValueWithUnit value={coolRes.chilledWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={waterFlowTooltip}/></div>
                        <div className={resultRowClasses}><span>{t('results.dehumidification_L_min')}</span><DisplayValueWithUnit value={coolRes.dehumidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={dehumidificationTooltip}/></div>
                    </div>
                );
            }
            case EquipmentType.HEATING_COIL: {
                 const heatRes = results as HeatingCoilResults;
                 const heatCond = conditions as HeatingCoilConditions;

                 const heatAirSideTooltip = useMemo(() => {
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
                }, [massFlowRateDA_kg_s, inletAir.enthalpy, outletAir.enthalpy, airflow, locale, unitSystem, t]);

                 const heatWaterSideTooltip = useMemo(() => {
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
                }, [results, conditions, locale, unitSystem, t]);

                 const heatWaterFlowTooltip = useMemo(() => {
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
                }, [results, conditions, locale, unitSystem, t]);

                return (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.airSideHeatLoad_kcal')}</span><DisplayValueWithUnit value={heatRes.airSideHeatLoad_kcal} unitType="heat_load" unitSystem={unitSystem} tooltipContent={heatAirSideTooltip} /></div>
                        <div className={resultRowClasses}><span>{t('results.hotWaterSideHeatLoad_kcal')}</span><DisplayValueWithUnit value={heatRes.hotWaterSideHeatLoad_kcal} unitType="heat_load" unitSystem={unitSystem} tooltipContent={heatWaterSideTooltip} /></div>
                        <div className={resultRowClasses}><span>{t('results.hotWaterFlow_L_min')}</span><DisplayValueWithUnit value={heatRes.hotWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={heatWaterFlowTooltip} /></div>
                    </div>
                );
            }
            case EquipmentType.ELIMINATOR:
                 return <div className={resultRowClasses}><span>{t('results.pressureLoss_Pa')}</span><DisplayValueWithUnit value={pressureLoss} unitType="pressure" unitSystem={unitSystem} /></div>
            case EquipmentType.SPRAY_WASHER: {
                 const sprayRes = results as SprayWasherResultsType;
                 const sprayCond = conditions as SprayWasherConditions;

                 const humidificationTooltip = useMemo(() => {
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
                 }, [massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, locale, unitSystem, t]);

                 const sprayAmountTooltip = useMemo(() => {
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
                 }, [massFlowRateDA_kg_s, conditions, airflow, currentInletAirCalculated.density, locale, unitSystem, t]);

                 const efficiencyTooltip = useMemo(() => {
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
                 }, [outletAir.absHumidity, inletAir.absHumidity, sprayWasherCalculatedValues.finalWSat, locale, unitSystem, t]);

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
                const requiredSteamTooltip = useMemo(() => {
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
                }, [massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, airflow, locale, unitSystem, t]);

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
                 const fanCond = conditions as FanConditions;

                 const heatGenerationTooltip = useMemo(() => {
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
                 }, [conditions, locale, unitSystem, t]);

                 const tempRiseTooltip = useMemo(() => {
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
                 }, [results, massFlowRateDA_kg_s, airflow, locale, unitSystem, t]);

                 return (
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4'>
                        <div className={resultRowClasses}><span>{t('results.heatGeneration_kcal')}</span><DisplayValueWithUnit value={fanRes.heatGeneration_kcal} unitType="heat_load" unitSystem={unitSystem} tooltipContent={heatGenerationTooltip}/></div>
                        <div className={resultRowClasses}><span>{t('results.tempRise_deltaT_celsius')}</span><DisplayValueWithUnit value={fanRes.tempRise_deltaT_celsius} unitType="temperature" unitSystem={UnitSystem.SI} tooltipContent={tempRiseTooltip}/></div>
                    </div>
                );
            }
            case EquipmentType.DAMPER: {
                const damperRes = results as DamperResults;
                const damperCond = conditions as DamperConditions;
                
                const velocityTooltip = useMemo(() => {
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
                }, [airflow, conditions, locale, unitSystem, t]);

                const pressureLossTooltip = useMemo(() => {
                    const formulaPath = 'tooltips.damper.pressureLoss';
                    const title = t(`${formulaPath}.title`);
                    const formula = t(`${formulaPath}.${unitSystem}.formula`);
                    const legend = t(`${formulaPath}.${unitSystem}.legend`);
                    let values = {};
                    
                    if (unitSystem === UnitSystem.IMPERIAL) {
                        const velocity_fpm = convertValue(damperRes.airVelocity_m_s, 'velocity', UnitSystem.SI, UnitSystem.IMPERIAL)! * 60;
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
                }, [conditions, results, currentInletAirCalculated.density, locale, unitSystem, t]);

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
        <div id={`equipment-${id}`} className={`p-4 rounded-lg shadow-lg mb-6 bg-white border-l-[6px] ${color}`}>
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
                    <hr className="my-2"/>
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
                         <button
                            onClick={() => onReflectDownstream(id, index)}
                            title={index < totalEquipment - 1 ? t('equipment.useDownstreamInlet') : t('equipment.useACOutlet')}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                        >
                            {index < totalEquipment - 1 ? '↓' : '↱'} {index < totalEquipment - 1 ? t('equipment.useDownstreamInlet') : t('equipment.useACOutlet')}
                        </button>
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
                    <hr className="my-2"/>
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