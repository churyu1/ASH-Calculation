






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
import { MOTOR_OUTPUT_CONVERSIONS } from '../constants.ts';
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
    isCollapsed: boolean;
    onToggleCollapse: (id: number) => void;
}

const EquipmentItem: React.FC<EquipmentItemProps> = ({
    equipment, index, totalEquipment, airflow, onUpdate, onDelete, onMove, onReflectUpstream, onReflectDownstream, unitSystem, isCollapsed, onToggleCollapse
}) => {
    const { id, type, pressureLoss, inletAir, outletAir, conditions, color, results } = equipment;
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
                        const delta_t = userOutletTemp - inletTemp;
                        let delta_x = 0;
                        if (shf > 0 && shf < 1.0) {
                            delta_x = (1000 / PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C) * (1 / shf - 1) * PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR * delta_t;
                        }
                        const outletAbsHum = inletAbsHum + delta_x;
                        newOutletAir = calculateAirProperties(userOutletTemp, null, outletAbsHum);

                        if (newOutletAir.enthalpy !== null) {
                            const totalHeat_kW = massFlowRateDA_kg_s * (newOutletAir.enthalpy - inletEnthalpy);
                            newResults = { heatLoad_kW: totalHeat_kW } as BurnerResults;
                        } else {
                             newResults = { heatLoad_kW: 0 } as BurnerResults;
                        }
                    }
                    break;
                }
                case EquipmentType.COOLING_COIL: {
                    const { chilledWaterInletTemp = 7, chilledWaterOutletTemp = 14, bypassFactor = 5 } = conditions as CoolingCoilConditions;
                    const BF = bypassFactor / 100;
                    const userOutletTemp = outletAir.temp;

                    if (userOutletTemp !== null) {
                        const clampedOutletTemp = Math.min(inletTemp, userOutletTemp);
                        const inletDewPointTemp = calculateDewPoint(inletAbsHum);
                        
                        let T_adp: number | undefined = undefined;
                        let outletAbsHum: number;
                        let contactFactor: number | null = null;
                        
                        if (clampedOutletTemp >= inletDewPointTemp) {
                            // Sensible cooling only
                            outletAbsHum = inletAbsHum;
                            contactFactor = 0;
                            T_adp = inletDewPointTemp; // For sensible cooling, show inlet dew point as ADP is not applicable.
                        } else {
                            // Dehumidifying
                             if (BF < 1.0 && (inletTemp - clampedOutletTemp > 0.01)) {
                                 T_adp = (clampedOutletTemp - inletTemp * BF) / (1 - BF);
                                 const x_adp = calculateAbsoluteHumidity(T_adp, 100);
                                 outletAbsHum = x_adp * (1 - BF) + inletAbsHum * BF;
                                 contactFactor = (1 - BF) * 100;
                            } else {
                                 outletAbsHum = inletAbsHum;
                                 contactFactor = 0;
                                 T_adp = inletDewPointTemp; // Fallback to sensible cooling
                            }
                        }

                        newOutletAir = calculateAirProperties(clampedOutletTemp, null, outletAbsHum);

                        // Correct for supersaturation which can occur due to the linear mixing model approximation
                        const saturationHumidityAtOutlet = calculateAbsoluteHumidity(clampedOutletTemp, 100);
                        if (newOutletAir.absHumidity !== null && newOutletAir.absHumidity > saturationHumidityAtOutlet) {
                            newOutletAir = calculateAirProperties(clampedOutletTemp, 100); 
                        }
                        
                        const outletEnthalpy = newOutletAir.enthalpy;

                        if (outletEnthalpy !== null && newOutletAir.absHumidity !== null) {
                            const airSideHeatLoad_kW = massFlowRateDA_kg_s * (inletEnthalpy - outletEnthalpy);
                            const waterSideHeatLoad_kW = airSideHeatLoad_kW;
                            const dehumidification_kg_s = massFlowRateDA_kg_s * (inletAbsHum - newOutletAir.absHumidity) / 1000;
                            const waterTempDiff = chilledWaterOutletTemp - chilledWaterInletTemp;
                            const chilledWaterFlow_L_min = waterTempDiff > 0 ? (waterSideHeatLoad_kW / (4.186 * waterTempDiff)) * 60 : 0;

                            newResults = {
                                airSideHeatLoad_kW: airSideHeatLoad_kW,
                                coldWaterSideHeatLoad_kW: waterSideHeatLoad_kW,
                                dehumidification_L_min: Math.max(0, dehumidification_kg_s * 60),
                                chilledWaterFlow_L_min: Math.max(0, chilledWaterFlow_L_min),
                                bypassFactor: bypassFactor,
                                contactFactor: contactFactor,
                                apparatusDewPointTemp: T_adp,
                            } as CoolingCoilResults;
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
                                 airSideHeatLoad_kW: airSideHeatLoad_kW,
                                 hotWaterSideHeatLoad_kW: waterSideHeatLoad_kW,
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
                    const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * (inletAbsHum / 1000);
                    const tempRise_deltaT = massFlowRateDA_kg_s > 0 ? heatGeneration_kW / (massFlowRateDA_kg_s * c_pa_moist) : 0;
                    const outletTemp = inletTemp + tempRise_deltaT;
    
                    newOutletAir = calculateAirProperties(outletTemp, null, inletAbsHum);
                    newResults = {
                        heatGeneration_kW: heatGeneration_kW,
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
                 formulaPath = 'tooltips.coil.bypassFactor'; 
                 const coolCond = conditions as CoolingCoilConditions;
                 const BF = (coolCond.bypassFactor ?? 5) / 100;
                 if (unitSystem === UnitSystem.IMPERIAL) {
                     values = {
                         'x_in': { value: convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                         'x_adp': { value: convertValue(calculateAbsoluteHumidity((outletAir.temp! - inletAir.temp!*BF)/(1-BF), 100), 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                         'BF': { value: BF, unit: '' },
                     };
                 } else {
                     values = {
                         'x_in': { value: inletAir.absHumidity, unit: 'g/kg(DA)' },
                         'x_adp': { value: calculateAbsoluteHumidity((outletAir.temp! - inletAir.temp!*BF)/(1-BF), 100), unit: 'g/kg(DA)'},
                         'BF': { value: BF, unit: '' },
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

    }, [type, outletAir, inletAir, conditions, locale, unitSystem, t]);

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
        const formulaPath = 'tooltips.burner.heatLoad';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
            const delta_h = (convertValue(outletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL) ?? 0) - (convertValue(inletAir.enthalpy, 'enthalpy', UnitSystem.SI, UnitSystem.IMPERIAL) ?? 0);
             values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'Δh': { value: delta_h, unit: 'BTU/lb' }
            };
        } else {
            values = {
                'Q': { value: burnerRes.heatLoad_kW, unit: 'kW' },
                'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                'h_in': { value: inletAir.enthalpy, unit: 'kJ/kg(DA)' },
                'h_out': { value: outletAir.enthalpy, unit: 'kJ/kg(DA)' },
            }
        }
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, massFlowRateDA_kg_s, outletAir.enthalpy, inletAir.enthalpy, airflow, results, locale, unitSystem, t]);

    const airSideTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL && type !== EquipmentType.HEATING_COIL) return null;
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

        const airSideHeatLoad_kW_val = (coilResults as CoolingCoilResults).airSideHeatLoad_kW ?? (coilResults as HeatingCoilResults).airSideHeatLoad_kW;
        let values = {};
        if(unitSystem === UnitSystem.IMPERIAL) {
             const airSideHeatLoad_BTUh = convertValue(airSideHeatLoad_kW_val, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
             values = {
                'Q_air': { value: airSideHeatLoad_BTUh, unit: 'BTU/h' },
                'η': { value: (coilConditions as HeatingCoilConditions).heatExchangeEfficiency, unit: '%' },
             };
        } else {
            values = {
               'Q_air': { value: airSideHeatLoad_kW_val, unit: 'kW' },
               'η': { value: (coilConditions as HeatingCoilConditions).heatExchangeEfficiency, unit: '%' },
           };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, results, conditions, locale, unitSystem, t]);

    const waterFlowTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL && type !== EquipmentType.HEATING_COIL) return null;
        const coilRes = results as CoolingCoilResults | HeatingCoilResults;
        const coilCond = conditions as CoolingCoilConditions | HeatingCoilConditions;
        const formulaPath = 'tooltips.coil.waterFlow';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        const waterSideHeatLoad_kW_val = type === EquipmentType.COOLING_COIL ? (coilRes as CoolingCoilResults).coldWaterSideHeatLoad_kW : (coilRes as HeatingCoilResults).hotWaterSideHeatLoad_kW;
        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            const waterSideHeatLoad_BTUh = convertValue(waterSideHeatLoad_kW_val, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
            const waterTempDiff_F = (convertValue((type === EquipmentType.COOLING_COIL ? (coilCond as CoolingCoilConditions).chilledWaterOutletTemp : (coilCond as HeatingCoilConditions).hotWaterInletTemp), 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL) ?? 0) - (convertValue((type === EquipmentType.COOLING_COIL ? (coilCond as CoolingCoilConditions).chilledWaterInletTemp : (coilCond as HeatingCoilConditions).hotWaterOutletTemp), 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL) ?? 0);
            values = {
                'Q_BTUh': { value: waterSideHeatLoad_BTUh, unit: 'BTU/h' },
                'Δt_w': { value: Math.abs(waterTempDiff_F), unit: '°F' },
            };
        } else {
            const waterSideHeatLoad_kW = waterSideHeatLoad_kW_val;
            const waterTempDiff_C = ((type === EquipmentType.COOLING_COIL ? (coilCond as CoolingCoilConditions).chilledWaterOutletTemp : (coilCond as HeatingCoilConditions).hotWaterInletTemp) ?? 0) - ((type === EquipmentType.COOLING_COIL ? (coilCond as CoolingCoilConditions).chilledWaterInletTemp : (coilCond as HeatingCoilConditions).hotWaterOutletTemp) ?? 0);
            values = {
                'Q_kW': { value: waterSideHeatLoad_kW, unit: 'kW' },
                'Δt_w': { value: Math.abs(waterTempDiff_C), unit: '°C' },
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
    }, [type, airflow, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, locale, unitSystem, t]);

    const sprayHumidificationTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER) return null;
        const formulaPath = 'tooltips.spray_washer.humidification';
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
    }, [type, airflow, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, locale, unitSystem, t]);

    const sprayAmountTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER) return null;
        const sprayCond = conditions as SprayWasherConditions;
        const formulaPath = 'tooltips.spray_washer.sprayAmount';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            const density_imp = convertValue(inletAir.density, 'density', UnitSystem.SI, UnitSystem.IMPERIAL);
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'ρ': { value: density_imp, unit: 'lb/ft³' },
                'L/G': { value: sprayCond.waterToAirRatio, unit: '' },
            };
        } else {
            values = {
                'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                'L/G': { value: sprayCond.waterToAirRatio, unit: '' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, airflow, massFlowRateDA_kg_s, inletAir.density, conditions, locale, unitSystem, t]);
    
    const sprayEfficiencyTooltip = useMemo(() => {
        if (type !== EquipmentType.SPRAY_WASHER) return null;
        const formulaPath = 'tooltips.spray_washer.humidificationEfficiency';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        const { finalWSat } = sprayWasherCalculatedValues;

        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'x_in': { value: convertValue(inletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                'x_out': { value: convertValue(outletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
                'x_sat': { value: convertValue(finalWSat, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
            values = {
                'x_in': { value: inletAir.absHumidity, unit: 'g/kg(DA)' },
                'x_out': { value: outletAir.absHumidity, unit: 'g/kg(DA)' },
                'x_sat': { value: finalWSat, unit: 'g/kg(DA)' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, inletAir.absHumidity, outletAir.absHumidity, sprayWasherCalculatedValues, locale, unitSystem, t]);

    const steamAmountTooltip = useMemo(() => {
        if (type !== EquipmentType.STEAM_HUMIDIFIER) return null;
        const formulaPath = 'tooltips.steam_humidifier.requiredSteam';
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
    }, [type, airflow, massFlowRateDA_kg_s, inletAir.absHumidity, outletAir.absHumidity, locale, unitSystem, t]);
    
    const fanHeatGenTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN) return null;
        const fanCond = conditions as FanConditions;
        const formulaPath = 'tooltips.fan.heatGeneration';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'P_HP': { value: convertValue(fanCond.motorOutput, 'motor_power', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'HP' },
                'η': { value: fanCond.motorEfficiency, unit: '%' },
            };
        } else {
            values = {
                'P_kW': { value: fanCond.motorOutput, unit: 'kW' },
                'η': { value: fanCond.motorEfficiency, unit: '%' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, conditions, locale, unitSystem, t]);
    
    const fanTempRiseTooltip = useMemo(() => {
        if (type !== EquipmentType.FAN) return null;
        const fanRes = results as FanResults;
        const formulaPath = 'tooltips.fan.tempRise';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            const heatGen_BTUh = convertValue(fanRes.heatGeneration_kW, 'heat_load', UnitSystem.SI, UnitSystem.IMPERIAL);
            values = {
                'Q_BTUh': { value: heatGen_BTUh, unit: 'BTU/h' },
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
            };
        } else {
            const heatGen_kW = fanRes.heatGeneration_kW;
            const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * ((inletAir.absHumidity ?? 0) / 1000);
            values = {
                'Q_kW': { value: heatGen_kW, unit: 'kW' },
                'G': { value: massFlowRateDA_kg_s, unit: 'kg/s' },
                'Cpa_moist': { value: c_pa_moist, unit: 'kJ/kg·K' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, airflow, massFlowRateDA_kg_s, inletAir.absHumidity, results, locale, unitSystem, t]);
    
    const damperVelocityTooltip = useMemo(() => {
        if (type !== EquipmentType.DAMPER) return null;
        const damperCond = conditions as DamperConditions;
        const formulaPath = 'tooltips.damper.airVelocity';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            const area_ft2 = convertValue(((damperCond.width ?? 0) / 1000) * ((damperCond.height ?? 0) / 1000), 'area', UnitSystem.SI, UnitSystem.IMPERIAL);
            values = {
                'q': { value: convertValue(airflow, 'airflow', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'CFM' },
                'A': { value: area_ft2, unit: 'ft²' },
            };
        } else {
            const area_m2 = ((damperCond.width ?? 0) / 1000) * ((damperCond.height ?? 0) / 1000);
            values = {
                'q': { value: airflow, unit: 'm³/min' },
                'A': { value: area_m2, unit: 'm²' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, airflow, conditions, locale, unitSystem, t]);

    const damperPressureLossTooltip = useMemo(() => {
        if (type !== EquipmentType.DAMPER) return null;
        const damperCond = conditions as DamperConditions;
        const damperRes = results as DamperResults;
        const formulaPath = 'tooltips.damper.pressureLoss';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                'K': { value: damperCond.lossCoefficientK, unit: '' },
                'v': { value: convertValue(damperRes.airVelocity_m_s, 'velocity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'fpm' },
            };
        } else {
            values = {
                'K': { value: damperCond.lossCoefficientK, unit: '' },
                'ρ': { value: inletAir.density, unit: 'kg/m³' },
                'v': { value: damperRes.airVelocity_m_s, unit: 'm/s' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, inletAir.density, conditions, results, locale, unitSystem, t]);

    const contactFactorTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL) return null;
        const coolCond = conditions as CoolingCoilConditions;
        const formulaPath = 'tooltips.coil.contactFactor';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        const BF = (coolCond.bypassFactor ?? 0) / 100;

        const values = {
            'BF': { value: BF, unit: '' },
        };
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, conditions, locale, unitSystem, t]);

    const adpTooltip = useMemo(() => {
        if (type !== EquipmentType.COOLING_COIL || inletAir.temp === null || outletAir.temp === null || inletAir.absHumidity === null) return null;
    
        const coolCond = conditions as CoolingCoilConditions;
        const inletDewPointTemp = calculateDewPoint(inletAir.absHumidity);
        const isSensibleCooling = outletAir.temp >= inletDewPointTemp;
    
        const formulaPath = isSensibleCooling ? 'tooltips.coil.apparatusDewPointTempSensible' : 'tooltips.coil.apparatusDewPointTemp';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
    
        const BF = (coolCond.bypassFactor ?? 0) / 100;
        
        let values = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            const inletTempF = convertValue(inletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL);
            const outletTempF = convertValue(outletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL);
            if (isSensibleCooling) {
                values = {
                    't_in': { value: inletTempF, unit: '°F' },
                    'rh_in': { value: inletAir.rh, unit: '%' },
                };
            } else {
                 values = {
                    't_in': { value: inletTempF, unit: '°F' },
                    't_out': { value: outletTempF, unit: '°F' },
                    'BF': { value: BF, unit: '' },
                };
            }
        } else {
            if (isSensibleCooling) {
                 values = {
                    't_in': { value: inletAir.temp, unit: '°C' },
                    'rh_in': { value: inletAir.rh, unit: '%' },
                };
            } else {
                 values = {
                    't_in': { value: inletAir.temp, unit: '°C' },
                    't_out': { value: outletAir.temp, unit: '°C' },
                    'BF': { value: BF, unit: '' },
                };
            }
        }
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [type, conditions, inletAir.temp, inletAir.rh, inletAir.absHumidity, outletAir.temp, locale, unitSystem, t]);

    // FIX: Added renderConditions function to render equipment-specific inputs.
    const renderConditions = () => {
        switch (type) {
            case EquipmentType.FILTER: {
                const conds = conditions as FilterConditions;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.width')}</span><NumberInputWithControls value={conds.width ?? null} onChange={(val) => handleConditionChange('width', val)} unitType="length" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.height')}</span><NumberInputWithControls value={conds.height ?? null} onChange={(val) => handleConditionChange('height', val)} unitType="length" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.thickness')}</span><NumberInputWithControls value={conds.thickness ?? null} onChange={(val) => handleConditionChange('thickness', val)} unitType="length" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.sheets')}</span><NumberInputWithControls value={conds.sheets ?? null} onChange={(val) => handleConditionChange('sheets', val)} unitType="sheets" unitSystem={unitSystem} min={1} step={1} /></div>
                    </>
                );
            }
            case EquipmentType.BURNER: {
                const conds = conditions as BurnerConditions;
                return <div className={conditionRowClasses}><span className="text-sm">{t('conditions.shf')}</span><NumberInputWithControls value={conds.shf ?? null} onChange={(val) => handleConditionChange('shf', val)} unitType="shf" unitSystem={unitSystem} min={0} max={1.0} step={0.01} /></div>;
            }
            case EquipmentType.COOLING_COIL: {
                const conds = conditions as CoolingCoilConditions;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.chilledWaterInletTemp')}</span><NumberInputWithControls value={conds.chilledWaterInletTemp ?? null} onChange={(val) => handleConditionChange('chilledWaterInletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.chilledWaterOutletTemp')}</span><NumberInputWithControls value={conds.chilledWaterOutletTemp ?? null} onChange={(val) => handleConditionChange('chilledWaterOutletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.bypassFactor')}</span><NumberInputWithControls value={conds.bypassFactor ?? null} onChange={(val) => handleConditionChange('bypassFactor', val)} unitType="efficiency" unitSystem={unitSystem} min={0} max={100} /></div>
                    </>
                );
            }
            case EquipmentType.HEATING_COIL: {
                const conds = conditions as HeatingCoilConditions;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.hotWaterInletTemp')}</span><NumberInputWithControls value={conds.hotWaterInletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterInletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.hotWaterOutletTemp')}</span><NumberInputWithControls value={conds.hotWaterOutletTemp ?? null} onChange={(val) => handleConditionChange('hotWaterOutletTemp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.heatExchangeEfficiency')}</span><NumberInputWithControls value={conds.heatExchangeEfficiency ?? null} onChange={(val) => handleConditionChange('heatExchangeEfficiency', val)} unitType="efficiency" unitSystem={unitSystem} min={0} max={100} /></div>
                    </>
                );
            }
            case EquipmentType.ELIMINATOR: {
                const conds = conditions as EliminatorConditions;
                return (
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('conditions.eliminatorType')}</span>
                        <select value={conds.eliminatorType} onChange={(e) => handleConditionChange('eliminatorType', e.target.value)} className={inputClasses}>
                            <option value="3-fold">{t('conditions.eliminator_3_fold')}</option>
                            <option value="6-fold">{t('conditions.eliminator_6_fold')}</option>
                        </select>
                    </div>
                );
            }
            case EquipmentType.SPRAY_WASHER: {
                const conds = conditions as SprayWasherConditions;
                return <div className={conditionRowClasses}><span className="text-sm">{t('conditions.waterToAirRatio')}</span><NumberInputWithControls value={conds.waterToAirRatio ?? null} onChange={(val) => handleConditionChange('waterToAirRatio', val)} unitType="water_to_air_ratio" unitSystem={unitSystem} min={0} step={0.1} /></div>;
            }
            case EquipmentType.STEAM_HUMIDIFIER: {
                const conds = conditions as SteamHumidifierConditions;
                const handlePressureUnitChange = (unit: SteamPressureUnit) => handleConditionChange('steamGaugePressureUnit', unit);
                const handlePressureValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const rawValue = e.target.value;
                    setPressureInputValue(rawValue);
                    const numericValue = parseFloat(rawValue);
                    if (!isNaN(numericValue)) {
                        const valueInKpa = convertSteamPressure(
                            numericValue,
                            conds.steamGaugePressureUnit || SteamPressureUnit.KPAG,
                            SteamPressureUnit.KPAG
                        );
                        handleConditionChange('steamGaugePressure', valueInKpa);
                    } else {
                        handleConditionChange('steamGaugePressure', null);
                    }
                };
    
                return (
                    <div className={conditionRowClasses}>
                        <span className="text-sm">{t('conditions.steamGaugePressure')}</span>
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                value={pressureInputValue}
                                onChange={handlePressureValueChange}
                                onBlur={() => { // Re-format on blur
                                    if (conds.steamGaugePressure !== null) {
                                        const valueInCurrentUnit = convertSteamPressure(
                                            conds.steamGaugePressure,
                                            SteamPressureUnit.KPAG,
                                            conds.steamGaugePressureUnit || SteamPressureUnit.KPAG
                                        );
                                        setPressureInputValue(formatNumberForInput(valueInCurrentUnit, conds.steamGaugePressureUnit || SteamPressureUnit.KPAG, unitSystem));
                                    } else {
                                        setPressureInputValue('');
                                    }
                                }}
                                className={inputClasses}
                            />
                             <select
                                value={conds.steamGaugePressureUnit || SteamPressureUnit.KPAG}
                                onChange={e => handlePressureUnitChange(e.target.value as SteamPressureUnit)}
                                className="px-2 py-1 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {Object.values(SteamPressureUnit).map(unit => (
                                    <option key={unit} value={unit}>{t(`units.pressure_units.${unit}`)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                );
            }
            case EquipmentType.FAN: {
                const conds = conditions as FanConditions;
                return (
                    <>
                        <div className={conditionRowClasses}>
                            <span className="text-sm">{t('conditions.motorOutput')}</span>
                            <select value={conds.motorOutput} onChange={(e) => handleConditionChange('motorOutput', parseFloat(e.target.value))} className={inputClasses}>
                                {MOTOR_OUTPUT_CONVERSIONS.map(({ hp, kw }) => (
                                    <option key={kw} value={kw}>
                                        {unitSystem === UnitSystem.IMPERIAL ? `${hp} HP` : `${kw} kW`}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.motorEfficiency')}</span><NumberInputWithControls value={conds.motorEfficiency ?? null} onChange={(val) => handleConditionChange('motorEfficiency', val)} unitType="efficiency" unitSystem={unitSystem} min={0} max={100} /></div>
                    </>
                );
            }
            case EquipmentType.DAMPER: {
                const conds = conditions as DamperConditions;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.width')}</span><NumberInputWithControls value={conds.width ?? null} onChange={(val) => handleConditionChange('width', val)} unitType="length" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.height')}</span><NumberInputWithControls value={conds.height ?? null} onChange={(val) => handleConditionChange('height', val)} unitType="length" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.lossCoefficientK')}</span><NumberInputWithControls value={conds.lossCoefficientK ?? null} onChange={(val) => handleConditionChange('lossCoefficientK', val)} unitType="k_value" unitSystem={unitSystem} min={0} step={0.1} /></div>
                    </>
                );
            }
            default: return null;
        }
    };

    // FIX: Added renderResults function to render equipment-specific calculated values.
    const renderResults = () => {
        switch (type) {
            case EquipmentType.FILTER: {
                const res = results as FilterResults;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('equipment.pressureLoss')}</span><NumberInputWithControls value={pressureLoss} onChange={(val) => handleUpdate('pressureLoss', val)} unitType="pressure" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.faceVelocity')}</span><DisplayValueWithUnit value={res.faceVelocity} unitType="velocity" unitSystem={unitSystem} tooltipContent={faceVelocityTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.treatedAirflowPerSheet')}</span><DisplayValueWithUnit value={res.treatedAirflowPerSheet} unitType="airflow_per_sheet" unitSystem={unitSystem} tooltipContent={airflowPerSheetTooltip} /></div>
                    </>
                );
            }
            case EquipmentType.BURNER: {
                const res = results as BurnerResults;
                return <div className={conditionRowClasses}><span className="text-sm">{t('results.heatLoad')}</span><DisplayValueWithUnit value={res.heatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={burnerHeatLoadTooltip} /></div>;
            }
            case EquipmentType.COOLING_COIL: {
                const res = results as CoolingCoilResults;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.airSideHeatLoad')}</span><DisplayValueWithUnit value={res.airSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={airSideTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.coldWaterSideHeatLoad')}</span><DisplayValueWithUnit value={res.coldWaterSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={waterSideTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.chilledWaterFlow_L_min')}</span><DisplayValueWithUnit value={res.chilledWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={waterFlowTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.dehumidification_L_min')}</span><DisplayValueWithUnit value={res.dehumidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={dehumidificationTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.contactFactor')}</span><DisplayValueWithUnit value={res.contactFactor} unitType="efficiency" unitSystem={unitSystem} tooltipContent={contactFactorTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.apparatusDewPointTemp')}</span><DisplayValueWithUnit value={res.apparatusDewPointTemp} unitType="temperature" unitSystem={unitSystem} tooltipContent={adpTooltip} /></div>
                    </>
                );
            }
            case EquipmentType.HEATING_COIL: {
                const res = results as HeatingCoilResults;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.airSideHeatLoad')}</span><DisplayValueWithUnit value={res.airSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={airSideTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.hotWaterSideHeatLoad')}</span><DisplayValueWithUnit value={res.hotWaterSideHeatLoad_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={waterSideTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.hotWaterFlow_L_min')}</span><DisplayValueWithUnit value={res.hotWaterFlow_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={waterFlowTooltip} /></div>
                    </>
                );
            }
            case EquipmentType.ELIMINATOR: {
                return <div className={conditionRowClasses}><span className="text-sm">{t('equipment.pressureLoss')}</span><NumberInputWithControls value={pressureLoss} onChange={(val) => handleUpdate('pressureLoss', val)} unitType="pressure" unitSystem={unitSystem} /></div>;
            }
            case EquipmentType.SPRAY_WASHER: {
                const res = results as SprayWasherResultsType;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.humidification_L_min')}</span><DisplayValueWithUnit value={res.humidification_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayHumidificationTooltip}/></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.sprayAmount_L_min')}</span><DisplayValueWithUnit value={res.sprayAmount_L_min} unitType="water_flow" unitSystem={unitSystem} tooltipContent={sprayAmountTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('conditions.humidificationEfficiency')}</span><DisplayValueWithUnit value={res.humidificationEfficiency} unitType="efficiency" unitSystem={unitSystem} tooltipContent={sprayEfficiencyTooltip}/></div>
                    </>
                );
            }
            case EquipmentType.STEAM_HUMIDIFIER: {
                const res = results as SteamHumidifierResults;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.requiredSteamAmount')}</span><DisplayValueWithUnit value={res.requiredSteamAmount} unitType="steam_flow" unitSystem={unitSystem} tooltipContent={steamAmountTooltip} /></div>
                        <hr className="my-2 border-slate-200" />
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.steamAbsolutePressure')}</span><DisplayValueWithUnit value={res.steamAbsolutePressure} unitType="steam_pressure" unitSystem={unitSystem} tooltipContent={steamAbsPressureTooltip}/></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.steamTemperature')}</span><DisplayValueWithUnit value={res.steamTemperature} unitType="temperature" unitSystem={unitSystem} tooltipContent={steamPropertiesTooltip}/></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.steamEnthalpy')}</span><DisplayValueWithUnit value={res.steamEnthalpy} unitType="steam_enthalpy" unitSystem={unitSystem} tooltipContent={steamPropertiesTooltip}/></div>
                    </>
                );
            }
            case EquipmentType.FAN: {
                const res = results as FanResults;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('equipment.pressureLoss')}</span><NumberInputWithControls value={pressureLoss} onChange={(val) => handleUpdate('pressureLoss', val)} unitType="pressure" unitSystem={unitSystem} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.heatGeneration')}</span><DisplayValueWithUnit value={res.heatGeneration_kW} unitType="heat_load" unitSystem={unitSystem} tooltipContent={fanHeatGenTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.tempRise_deltaT_celsius')}</span><DisplayValueWithUnit value={res.tempRise_deltaT_celsius} unitType="temperature" unitSystem={UnitSystem.SI} tooltipContent={fanTempRiseTooltip}/></div>
                    </>
                );
            }
            case EquipmentType.DAMPER: {
                const res = results as DamperResults;
                return (
                    <>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.airVelocity_m_s')}</span><DisplayValueWithUnit value={res.airVelocity_m_s} unitType="velocity" unitSystem={unitSystem} tooltipContent={damperVelocityTooltip} /></div>
                        <div className={conditionRowClasses}><span className="text-sm">{t('results.pressureLoss_Pa')}</span><DisplayValueWithUnit value={res.pressureLoss_Pa} unitType="pressure" unitSystem={unitSystem} tooltipContent={damperPressureLossTooltip} /></div>
                    </>
                );
            }
            case EquipmentType.CUSTOM: {
                return <div className={conditionRowClasses}><span className="text-sm">{t('equipment.pressureLoss')}</span><NumberInputWithControls value={pressureLoss} onChange={(val) => handleUpdate('pressureLoss', val)} unitType="pressure" unitSystem={unitSystem} /></div>;
            }
            default: return <p>No results available.</p>;
        }
    };

    return (
        <div id={`equipment-${id}`} className={`p-4 bg-white rounded-lg shadow-md border-l-4 ${color}`}>
            <div className={`flex flex-wrap justify-between items-center gap-2 ${!isCollapsed ? 'mb-4' : ''}`}>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onToggleCollapse(id)}
                        className="p-1.5 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
                        aria-label={t('app.toggleExpand')}
                    >
                        {isCollapsed ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                        )}
                    </button>
                    <h3 className="text-lg font-semibold text-slate-800">{`${index + 1}. ${t(`equipmentNames.${type}`)}`}</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => onMove(id, 'up')} disabled={index === 0} className="p-1.5 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed" aria-label={t('equipment.up')}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button onClick={() => onMove(id, 'down')} disabled={index === totalEquipment - 1} className="p-1.5 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed" aria-label={t('equipment.down')}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button onClick={() => onDelete(id)} className="p-1.5 bg-red-500 text-white rounded-md hover:bg-red-600" aria-label={t('equipment.delete')}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>

            {!isCollapsed && (
                <>
                    {warningMessage && (
                        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-3 rounded-md mb-4 text-sm" role="alert">
                            {warningMessage}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {isAirConditionSectionNeeded && (
                            <>
                                <div className={sectionClasses}>
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold">{t('equipment.inletAir')}</h4>
                                            {equipment.inletIsLocked ? (
                                                <Tooltip content={t('equipment.inletUnlockedTooltip')}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                                                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zM8.5 5.5a1.5 1.5 0 10-3 0V9h3V5.5z" clipRule="evenodd" />
                                                    </svg>
                                                </Tooltip>
                                            ) : (
                                                <Tooltip content={t('equipment.inletLockedTooltip')}>
                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                                                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                                    </svg>
                                                </Tooltip>
                                            )}
                                        </div>
                                        <Tooltip content={ index > 0 ? t('equipment.copyUpstreamEquipment') : t('equipment.copyACInlet')}>
                                        <button onClick={() => onReflectUpstream(id, index)} className="p-1.5 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300" aria-label={index > 0 ? t('equipment.copyUpstreamEquipment') : t('equipment.copyACInlet')}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                            </svg>
                                        </button>
                                        </Tooltip>
                                    </div>
                                    <div className={conditionRowClasses}>
                                        <span className="text-sm">{t('airProperties.temperature')}</span>
                                        <NumberInputWithControls value={inletAir.temp} onChange={(val) => handleInletAirChange('temp', val)} unitType="temperature" unitSystem={unitSystem} />
                                    </div>
                                    <div className={conditionRowClasses}>
                                        <span className="text-sm">{t('airProperties.rh')}</span>
                                        <NumberInputWithControls value={inletAir.rh} onChange={(val) => handleInletAirChange('rh', val)} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                        <div className={conditionRowClasses}><span className="text-sm">{t('airProperties.abs_humidity')}</span><DisplayValueWithUnit value={currentInletAirCalculated.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={inletAbsHumidityTooltip} /></div>
                                        <div className={conditionRowClasses}><span className="text-sm">{t('airProperties.enthalpy')}</span><DisplayValueWithUnit value={currentInletAirCalculated.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={inletEnthalpyTooltip} /></div>
                                    </div>
                                </div>

                                <div className={sectionClasses}>
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-semibold">{t('equipment.outletAir')}</h4>
                                        <Tooltip content={ index < totalEquipment - 1 ? t('equipment.copyDownstreamEquipment') : t('equipment.copyACOutlet')}>
                                            <button onClick={() => onReflectDownstream(id, index)} className="p-1.5 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300" aria-label={index < totalEquipment - 1 ? t('equipment.copyDownstreamEquipment') : t('equipment.copyACOutlet')}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                                                </svg>
                                            </button>
                                        </Tooltip>
                                    </div>
                                    {isOutletTempEditable ?
                                        <div className={conditionRowClasses}><span className="text-sm">{t('airProperties.temperature')}</span><NumberInputWithControls value={outletAir.temp} onChange={(val) => handleOutletAirChange('temp', val)} unitType="temperature" unitSystem={unitSystem} /></div>
                                        : <div className={conditionRowClasses}><span className="text-sm">{t('airProperties.temperature')}</span><DisplayValueWithUnit value={outletAir.temp} unitType="temperature" unitSystem={unitSystem} tooltipContent={outletTempTooltip}/></div>
                                    }
                                    {isOutletRhEditable ?
                                        <div className={conditionRowClasses}><span className="text-sm">{t('airProperties.rh')}</span><NumberInputWithControls value={outletAir.rh} onChange={(val) => handleOutletAirChange('rh', val)} unitType="rh" unitSystem={unitSystem} min={0} max={100} /></div>
                                        : <div className={conditionRowClasses}><span className="text-sm">{t('airProperties.rh')}</span><DisplayValueWithUnit value={outletAir.rh} unitType="rh" unitSystem={unitSystem} tooltipContent={outletRhTooltip}/></div>
                                    }
                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                        <div className={conditionRowClasses}><span className="text-sm">{t('airProperties.abs_humidity')}</span><DisplayValueWithUnit value={outletAir.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={outletAbsHumidityTooltip}/></div>
                                        <div className={conditionRowClasses}><span className="text-sm">{t('airProperties.enthalpy')}</span><DisplayValueWithUnit value={outletAir.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={outletEnthalpyTooltip}/></div>
                                    </div>
                                </div>
                            </>
                        )}

                        {showEquipmentConditionsSection && (
                            <div className={sectionClasses}>
                                <h4 className="font-semibold mb-2">{t('equipment.conditions')}</h4>
                                {renderConditions()}
                            </div>
                        )}
                        
                        <div className={sectionClasses}>
                            <h4 className="font-semibold mb-2">{t('equipment.results')}</h4>
                            {renderResults()}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default EquipmentItem;