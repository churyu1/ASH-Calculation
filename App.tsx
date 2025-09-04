import React, { useState, useCallback, useMemo, useRef } from 'react';
import { 
    Equipment, UnitSystem, EquipmentType, AirProperties, 
    CoolingCoilConditions, HeatingCoilConditions, FanConditions, 
    DamperConditions, FilterConditions, BurnerConditions, 
    EliminatorConditions, SprayWasherConditions, SteamHumidifierConditions, CustomConditions,
    SteamPressureUnit
} from './types';
import { EQUIPMENT_COLORS } from './constants';
import { calculateAirProperties, calculatePsat } from './services/psychrometrics';
import { useLanguage, enMessages, get } from './i18n';
import EquipmentItem from './components/EquipmentItem';
import NumberInputWithControls from './components/NumberInputWithControls';
import DisplayValueWithUnit from './components/DisplayValueWithUnit';
import PsychrometricChart from './components/PsychrometricChart';
import Summary from './components/Summary';
import FloatingNav from './components/FloatingNav';
import FormulaTooltipContent from './components/FormulaTooltipContent';
import { convertValue } from './utils/conversions';

// Function to generate the initial equipment list
const getInitialEquipment = (): Equipment[] => {
    // Define initial setups. Inlet properties are for components that break the chain.
    const equipmentSetups = [
        { type: EquipmentType.FILTER },
        { type: EquipmentType.BURNER },
        { type: EquipmentType.COOLING_COIL,       inlet: { temp: 25,   rh: 80 } },
        { type: EquipmentType.HEATING_COIL,       inlet: { temp: 15,   rh: 60 } },
        { type: EquipmentType.ELIMINATOR },
        { type: EquipmentType.SPRAY_WASHER,     inlet: { temp: 55.2, rh: 4.58 } },
        { type: EquipmentType.STEAM_HUMIDIFIER, inlet: { temp: 30,   rh: 30 } },
        { type: EquipmentType.FAN,                inlet: { temp: 25,   rh: 60 } },
        { type: EquipmentType.DAMPER },
    ];

    const acInletAir = calculateAirProperties(0, 50);

    const result = equipmentSetups.reduce<{ list: Equipment[], lastOutlet: AirProperties }>((acc, setup, index) => {
        const { type, inlet: specificInletConfig } = setup;
        
        const inletAir = specificInletConfig 
            ? calculateAirProperties(specificInletConfig.temp, specificInletConfig.rh) 
            : acc.lastOutlet;
        
        const inletIsLocked = !!specificInletConfig;
        
        const defaultName = get(enMessages, `equipmentNames.${type}`) || type;

        let newEquipment: Equipment = {
            id: index,
            type,
            name: defaultName,
            pressureLoss: 50,
            inletAir: { ...inletAir },
            outletAir: { ...inletAir }, // Default outlet to inlet, will be overridden
            conditions: {},
            results: {},
            color: EQUIPMENT_COLORS[type],
            inletIsLocked: inletIsLocked,
        };

        // Apply type-specific defaults for conditions and initial outlet values
        switch (type) {
            case EquipmentType.FILTER:
                (newEquipment.conditions as FilterConditions) = { width: 500, height: 500, thickness: 50, sheets: 1 };
                break;
            case EquipmentType.BURNER:
                newEquipment.outletAir = calculateAirProperties(55.2, null, newEquipment.inletAir.absHumidity);
                (newEquipment.conditions as BurnerConditions) = { shf: 0.9 };
                break;
            case EquipmentType.COOLING_COIL:
                newEquipment.outletAir = calculateAirProperties(15, 100);
                (newEquipment.conditions as CoolingCoilConditions) = { chilledWaterInletTemp: 7, chilledWaterOutletTemp: 14, heatExchangeEfficiency: 85 };
                break;
            case EquipmentType.HEATING_COIL:
                newEquipment.outletAir = calculateAirProperties(30, null, newEquipment.inletAir.absHumidity);
                (newEquipment.conditions as HeatingCoilConditions) = { hotWaterInletTemp: 80, hotWaterOutletTemp: 50, heatExchangeEfficiency: 85 };
                break;
            case EquipmentType.ELIMINATOR:
                (newEquipment.conditions as EliminatorConditions) = { eliminatorType: '3-fold' };
                break;
            case EquipmentType.SPRAY_WASHER:
                 newEquipment.outletAir = calculateAirProperties(25, 70);
                 (newEquipment.conditions as SprayWasherConditions) = { waterToAirRatio: 0.8 };
                 break;
            case EquipmentType.STEAM_HUMIDIFIER:
                newEquipment.outletAir = { temp: null, rh: 40, absHumidity: null, enthalpy: null, density: null };
                (newEquipment.conditions as SteamHumidifierConditions) = { 
                    steamGaugePressure: 100,
                    steamGaugePressureUnit: SteamPressureUnit.KPAG,
                };
                break;
            case EquipmentType.FAN:
                (newEquipment.conditions as FanConditions) = { motorOutput: 0.2, motorEfficiency: 80 };
                break;
            case EquipmentType.DAMPER:
                newEquipment.pressureLoss = 0;
                (newEquipment.conditions as DamperConditions) = { width: 500, height: 500, lossCoefficientK: 1.0 };
                break;
            case EquipmentType.CUSTOM:
                (newEquipment.conditions as CustomConditions) = {};
                break;
        }

        acc.list.push(newEquipment);
        acc.lastOutlet = newEquipment.outletAir;
        
        return acc;
    }, { list: [], lastOutlet: acInletAir });

    return result.list;
};

const App: React.FC = () => {
    const { t, locale, setLocale } = useLanguage();
    const [airflow, setAirflow] = useState<number | null>(100);
    const [equipmentList, setEquipmentList] = useState<Equipment[]>(getInitialEquipment);
    const [nextId, setNextId] = useState(() => Object.values(EquipmentType).filter(t => t !== EquipmentType.CUSTOM).length);
    const [unitSystem, setUnitSystem] = useState<UnitSystem>(UnitSystem.SI);
    const [acInletAir, setAcInletAir] = useState<AirProperties>(() => calculateAirProperties(0, 50));
    const [acOutletAir, setAcOutletAir] = useState<AirProperties>(() => calculateAirProperties(27, 70));
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = () => {
        const dataToSave = {
            version: '1.0.0',
            airflow,
            equipmentList,
            unitSystem,
            acInletAir,
            acOutletAir,
            locale,
        };
        const jsonString = JSON.stringify(dataToSave, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hvac-calculator-config.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') {
                    throw new Error('File content is not a string.');
                }
                const data = JSON.parse(text);

                if (
                    data.airflow !== undefined &&
                    data.equipmentList !== undefined &&
                    data.unitSystem !== undefined &&
                    data.acInletAir !== undefined &&
                    data.acOutletAir !== undefined
                ) {
                    setAirflow(data.airflow);
                    setEquipmentList(data.equipmentList);
                    setUnitSystem(data.unitSystem);
                    setAcInletAir(data.acInletAir);
                    setAcOutletAir(data.acOutletAir);
                    if (data.locale) {
                        setLocale(data.locale);
                    }
                    alert(t('app.importSuccess'));
                } else {
                    throw new Error('Invalid or corrupted configuration file.');
                }
            } catch (error) {
                console.error("Failed to import configuration:", error);
                alert(t('app.importError'));
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.onerror = () => {
            console.error("Failed to read file.");
            alert(t('app.importError'));
        };
        reader.readAsText(file);
    };

    const triggerFileSelect = () => {
        fileInputRef.current?.click();
    };

    const addEquipment = (type: EquipmentType) => {
        const newId = nextId;
        setNextId(prev => prev + 1);

        const defaultInlet = equipmentList.length > 0 ? 
            (equipmentList[equipmentList.length - 1].outletAir) : 
            { ...acInletAir };

        const defaultName = get(enMessages, `equipmentNames.${type}`) || type;

        let newEquipment: Equipment = {
            id: newId, type, name: defaultName, pressureLoss: 50, 
            inletAir: defaultInlet, outletAir: { ...defaultInlet }, 
            conditions: {}, results: {}, color: EQUIPMENT_COLORS[type],
            inletIsLocked: false,
        };

        // Set type-specific defaults
        switch (type) {
             case EquipmentType.FILTER:
                (newEquipment.conditions as FilterConditions) = { width: 500, height: 500, thickness: 50, sheets: 1 };
                break;
            case EquipmentType.BURNER:
                newEquipment.outletAir = calculateAirProperties(55.2, null, defaultInlet.absHumidity);
                (newEquipment.conditions as BurnerConditions) = { shf: 0.9 };
                break;
            case EquipmentType.COOLING_COIL:
                newEquipment.outletAir = calculateAirProperties(15, 95);
                (newEquipment.conditions as CoolingCoilConditions) = { chilledWaterInletTemp: 7, chilledWaterOutletTemp: 14, heatExchangeEfficiency: 85 };
                break;
            case EquipmentType.HEATING_COIL:
                newEquipment.outletAir = calculateAirProperties(40, 30);
                (newEquipment.conditions as HeatingCoilConditions) = { hotWaterInletTemp: 80, hotWaterOutletTemp: 50, heatExchangeEfficiency: 85 };
                break;
            case EquipmentType.ELIMINATOR:
                (newEquipment.conditions as EliminatorConditions) = { eliminatorType: '3-fold' };
                break;
            case EquipmentType.SPRAY_WASHER:
                 newEquipment.outletAir = calculateAirProperties(25, 70);
                 (newEquipment.conditions as SprayWasherConditions) = { waterToAirRatio: 0.8 };
                 break;
            case EquipmentType.STEAM_HUMIDIFIER:
                newEquipment.outletAir = { temp: null, rh: 40, absHumidity: null, enthalpy: null, density: null };
                (newEquipment.conditions as SteamHumidifierConditions) = { 
                    steamGaugePressure: 100,
                    steamGaugePressureUnit: SteamPressureUnit.KPAG,
                };
                break;
            case EquipmentType.FAN:
                (newEquipment.conditions as FanConditions) = { motorOutput: 0.2, motorEfficiency: 80 };
                break;
            case EquipmentType.DAMPER:
                newEquipment.pressureLoss = 0;
                (newEquipment.conditions as DamperConditions) = { width: 500, height: 500, lossCoefficientK: 1.0 };
                break;
            case EquipmentType.CUSTOM:
                (newEquipment.conditions as CustomConditions) = {};
                break;
        }

        setEquipmentList(prev => [...prev, newEquipment]);
    };

    const updateEquipment = useCallback((id: number, updatedEquipment: Equipment) => {
        setEquipmentList(prev => {
            const index = prev.findIndex(eq => eq.id === id);
            if (index === -1) return prev;
    
            const newList = [...prev];
            const oldOutletAir = newList[index].outletAir;
            newList[index] = updatedEquipment;
    
            // If the outlet air has changed, propagate the change to the next component's inlet,
            // but only if that inlet is not locked by a manual user override.
            if (JSON.stringify(oldOutletAir) !== JSON.stringify(updatedEquipment.outletAir)) {
                if (index + 1 < newList.length && !newList[index + 1].inletIsLocked) {
                    const nextEq = newList[index + 1];
                    newList[index + 1] = { ...nextEq, inletAir: { ...updatedEquipment.outletAir } };
                }
            }
    
            return newList;
        });
    }, []);

    const deleteEquipment = (id: number) => setEquipmentList(prev => prev.filter(eq => eq.id !== id));
    const deleteAllEquipment = () => setEquipmentList([]);

    const moveEquipment = (id: number, direction: 'up' | 'down') => {
        setEquipmentList(prevList => {
            const index = prevList.findIndex(eq => eq.id === id);
            if (index === -1) return prevList;
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= prevList.length) return prevList;

            const newList = [...prevList];
            const [movedItem] = newList.splice(index, 1);
            newList.splice(newIndex, 0, movedItem);
            return newList;
        });
    };
    
    const reflectUpstreamConditions = useCallback((id: number, currentIndex: number) => {
        setEquipmentList(prevList => {
            const newList = [...prevList];
            const targetEqIndex = newList.findIndex(eq => eq.id === id);
            if (targetEqIndex === -1) return prevList;
    
            let sourceAir: AirProperties | undefined = undefined;
    
            // Search backward from the item just before the current one.
            for (let i = currentIndex - 1; i >= 0; i--) {
                const upstreamEq = prevList[i];
                const isPassThrough = [
                    EquipmentType.FILTER, 
                    EquipmentType.ELIMINATOR, 
                    EquipmentType.DAMPER, 
                    EquipmentType.CUSTOM
                ].includes(upstreamEq.type);
    
                if (!isPassThrough) {
                    if (upstreamEq.outletAir && upstreamEq.outletAir.temp !== null) {
                        sourceAir = upstreamEq.outletAir;
                    }
                    break; 
                }
            }
            
            if (sourceAir === undefined) {
                sourceAir = acInletAir;
            }
    
            if (sourceAir) {
                const currentEq = newList[targetEqIndex];
                
                let updatedEq: Equipment = {
                    ...currentEq,
                    inletAir: { ...sourceAir },
                    inletIsLocked: false, // Unlock the inlet to re-establish the chain
                };
    
                // For components where outlet is purely calculated, reset outlet to trigger recalculation
                const calculatedOutletTypes = [
                    EquipmentType.FAN, EquipmentType.FILTER,
                    EquipmentType.DAMPER, EquipmentType.ELIMINATOR, EquipmentType.CUSTOM
                ];
                if (calculatedOutletTypes.includes(currentEq.type)) {
                    updatedEq.outletAir = { ...sourceAir };
                } else if (currentEq.type === EquipmentType.SPRAY_WASHER || currentEq.type === EquipmentType.STEAM_HUMIDIFIER) {
                    // For spray washer and steam humidifier, keep outlet RH as is, but reset other props for recalc
                    updatedEq.outletAir = { temp: null, rh: currentEq.outletAir.rh, absHumidity: null, enthalpy: null, density: null };
                }
                
                newList[targetEqIndex] = updatedEq;
            }
            return newList;
        });
    }, [acInletAir]);

    const reflectDownstreamConditions = useCallback((id: number, currentIndex: number) => {
        setEquipmentList(prevList => {
            let sourceAir: AirProperties | null = null;
    
            if (currentIndex === prevList.length - 1) {
                // Last item, use AC outlet conditions
                sourceAir = acOutletAir;
            } else {
                // Not the last item, use next equipment's inlet
                const nextEq = prevList[currentIndex + 1];
                if (nextEq && nextEq.inletAir) {
                    sourceAir = nextEq.inletAir;
                }
            }
            
            if (sourceAir === null) return prevList;
    
            return prevList.map(eq => {
                if (eq.id === id) {
                    let newOutletAir = { ...eq.outletAir };
                    if (eq.type === EquipmentType.SPRAY_WASHER || eq.type === EquipmentType.STEAM_HUMIDIFIER) {
                        if (sourceAir.rh !== null) {
                            newOutletAir.rh = sourceAir.rh;
                        }
                    } else {
                        if (sourceAir.temp !== null) {
                            newOutletAir.temp = sourceAir.temp;
                        }
                    }
                    return { ...eq, outletAir: newOutletAir };
                }
                return eq;
            });
        });
    }, [acOutletAir]);

    const handleAcInletTempChange = (value: number | null) => setAcInletAir(prev => calculateAirProperties(value, prev.rh));
    const handleAcInletRHChange = (value: number | null) => setAcInletAir(prev => calculateAirProperties(prev.temp, value));

    const handleAcOutletTempChange = (value: number | null) => setAcOutletAir(prev => calculateAirProperties(value, prev.rh));
    const handleAcOutletRHChange = (value: number | null) => setAcOutletAir(prev => calculateAirProperties(prev.temp, value));
    
    const equipmentForChart = equipmentList.filter(eq =>
        ![EquipmentType.FILTER, EquipmentType.ELIMINATOR, EquipmentType.DAMPER, EquipmentType.CUSTOM].includes(eq.type) &&
        eq.inletAir.temp !== null && eq.outletAir.temp !== null
    );

    const totalPressureLoss = equipmentList.reduce((sum, eq) => sum + (eq.pressureLoss || 0), 0);

    const equipmentButtons = Object.values(EquipmentType).map(type => (
        <button key={type} onClick={() => addEquipment(type)} className="px-4 py-3 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors text-center font-medium">
            {t(`equipmentNames.${type}`)}
        </button>
    ));

    const acInletAbsHumidityTooltip = useMemo(() => {
        if (acInletAir.temp === null || acInletAir.rh === null) return null;
        
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};

        if (unitSystem === UnitSystem.IMPERIAL) {
            const P_sat = calculatePsat(acInletAir.temp);
            const P_v = P_sat * (acInletAir.rh / 100);
            values = {
                't_f': { value: convertValue(acInletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                'rh': { value: acInletAir.rh, unit: '%' },
                'P_v': { value: P_v, unit: 'Pa' },
            };
        } else {
            const P_sat = calculatePsat(acInletAir.temp);
            const P_v = P_sat * (acInletAir.rh / 100);
            values = {
                't': { value: acInletAir.temp, unit: '°C' },
                'rh': { value: acInletAir.rh, unit: '%' },
                'P_sat': { value: P_sat, unit: 'Pa' },
                'P_v': { value: P_v, unit: 'Pa' },
            };
        }
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [acInletAir.temp, acInletAir.rh, locale, unitSystem, t]);

    const acInletEnthalpyTooltip = useMemo(() => {
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                't': { value: convertValue(acInletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                'x': { value: convertValue(acInletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
            values = {
                't': { value: acInletAir.temp, unit: '°C' },
                'x': { value: acInletAir.absHumidity, unit: 'g/kg(DA)' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [acInletAir.temp, acInletAir.absHumidity, locale, unitSystem, t]);
    
    const acOutletCalculated = useMemo(() => calculateAirProperties(acOutletAir.temp, acOutletAir.rh), [acOutletAir.temp, acOutletAir.rh]);

    const acOutletAbsHumidityTooltip = useMemo(() => {
        if (acOutletAir.temp === null || acOutletAir.rh === null) return null;
        
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);
        
        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};

        if (unitSystem === UnitSystem.IMPERIAL) {
            const P_sat = calculatePsat(acOutletAir.temp);
            const P_v = P_sat * (acOutletAir.rh / 100);
            values = {
                't_f': { value: convertValue(acOutletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                'rh': { value: acOutletAir.rh, unit: '%' },
                'P_v': { value: P_v, unit: 'Pa' },
            };
        } else {
            const P_sat = calculatePsat(acOutletAir.temp);
            const P_v = P_sat * (acOutletAir.rh / 100);
            values = {
                't': { value: acOutletAir.temp, unit: '°C' },
                'rh': { value: acOutletAir.rh, unit: '%' },
                'P_sat': { value: P_sat, unit: 'Pa' },
                'P_v': { value: P_v, unit: 'Pa' },
            };
        }
        
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [acOutletAir.temp, acOutletAir.rh, locale, unitSystem, t]);

    const acOutletEnthalpyTooltip = useMemo(() => {
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const title = t(`${formulaPath}.title`);
        const formula = t(`${formulaPath}.${unitSystem}.formula`);
        const legend = t(`${formulaPath}.${unitSystem}.legend`);

        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};
        if (unitSystem === UnitSystem.IMPERIAL) {
            values = {
                't': { value: convertValue(acOutletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
                'x': { value: convertValue(acOutletCalculated.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' },
            };
        } else {
            values = {
                't': { value: acOutletAir.temp, unit: '°C' },
                'x': { value: acOutletCalculated.absHumidity, unit: 'g/kg(DA)' },
            };
        }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [acOutletAir.temp, acOutletCalculated.absHumidity, locale, unitSystem, t]);

    return (
        <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-800">
            <div className="max-w-7xl mx-auto bg-slate-50 p-6 rounded-lg shadow-xl">
                <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <h1 className="text-3xl font-bold text-slate-900">{t('app.title')}</h1>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <button onClick={triggerFileSelect} className="flex-1 px-3 py-1.5 bg-green-500 text-white rounded-md shadow-sm hover:bg-green-600 transition-colors text-xs font-medium flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            {t('app.importConfig')}
                        </button>
                        <button onClick={handleExport} className="flex-1 px-3 py-1.5 bg-indigo-600 text-white rounded-md shadow-sm hover:bg-indigo-700 transition-colors text-xs font-medium flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.293a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            {t('app.exportConfig')}
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept="application/json"
                        />
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="p-4 bg-white rounded-lg shadow-md">
                        <div className="flex flex-wrap gap-x-8 gap-y-4">
                            <fieldset>
                                <legend className="block text-lg font-semibold mb-2">{t('app.language')}</legend>
                                <div className="flex flex-wrap gap-2">
                                    <div>
                                        <input type="radio" id="lang-ja" name="language" value="ja" checked={locale === 'ja'} onChange={e => setLocale(e.target.value)} className="sr-only" aria-labelledby="lang-ja-label"/>
                                        <label id="lang-ja-label" htmlFor="lang-ja" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ locale === 'ja' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50' }`}>
                                            日本語
                                        </label>
                                    </div>
                                    <div>
                                        <input type="radio" id="lang-en" name="language" value="en" checked={locale === 'en'} onChange={e => setLocale(e.target.value)} className="sr-only" aria-labelledby="lang-en-label"/>
                                        <label id="lang-en-label" htmlFor="lang-en" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ locale === 'en' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50' }`}>
                                            English
                                        </label>
                                    </div>
                                </div>
                            </fieldset>
                            <fieldset>
                                <legend className="block text-lg font-semibold mb-2">{t('app.unitSystem')}</legend>
                                <div className="flex flex-wrap gap-2">
                                    <div>
                                        <input type="radio" id="unit-si" name="unitSystem" value={UnitSystem.SI} checked={unitSystem === UnitSystem.SI} onChange={e => setUnitSystem(e.target.value as UnitSystem)} className="sr-only" aria-labelledby="unit-si-label"/>
                                        <label id="unit-si-label" htmlFor="unit-si" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ unitSystem === UnitSystem.SI ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50' }`}>
                                            {t('app.siUnits')}
                                        </label>
                                    </div>
                                    <div>
                                        <input type="radio" id="unit-imperial" name="unitSystem" value={UnitSystem.IMPERIAL} checked={unitSystem === UnitSystem.IMPERIAL} onChange={e => setUnitSystem(e.target.value as UnitSystem)} className="sr-only" aria-labelledby="unit-imperial-label"/>
                                        <label id="unit-imperial-label" htmlFor="unit-imperial" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ unitSystem === UnitSystem.IMPERIAL ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50' }`}>
                                            {t('app.imperialUnits')}
                                        </label>
                                    </div>
                                </div>
                            </fieldset>
                        </div>
                    </div>

                    <div className="p-4 bg-white rounded-lg shadow-md flex flex-col justify-center">
                        <h2 className="text-lg font-semibold mb-2 text-center">{t('app.systemAirflow')}</h2>
                        <div className="flex justify-center">
                            <NumberInputWithControls value={airflow} onChange={setAirflow} unitType="airflow" unitSystem={unitSystem} containerClassName="w-full" />
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div id="ac-inlet-conditions">
                        <h2 className="text-xl font-semibold mb-4">{t('app.acInletConditions')}</h2>
                        <div className="p-4 bg-white rounded-lg shadow-md grid grid-cols-1 gap-4">
                            <div className="p-4 bg-slate-100 rounded-lg">
                                <h3 className="font-semibold mb-2">{t('equipment.inletAir')}</h3>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.temperature')}</span>
                                    <NumberInputWithControls value={acInletAir.temp} onChange={handleAcInletTempChange} unitType="temperature" unitSystem={unitSystem} />
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.rh')}</span>
                                    <NumberInputWithControls value={acInletAir.rh} onChange={handleAcInletRHChange} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                                </div>
                            </div>
                            <div className="p-4 bg-slate-100 rounded-lg">
                                <h3 className="font-semibold mb-2">{t('equipment.results')}</h3>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.abs_humidity')}</span>
                                    <DisplayValueWithUnit value={acInletAir.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={acInletAbsHumidityTooltip} />
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.enthalpy')}</span>
                                    <DisplayValueWithUnit value={acInletAir.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={acInletEnthalpyTooltip} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="ac-outlet-conditions">
                        <h2 className="text-xl font-semibold mb-4">{t('app.acOutletConditions')}</h2>
                        <div className="p-4 bg-white rounded-lg shadow-md grid grid-cols-1 gap-4">
                             <div className="p-4 bg-slate-100 rounded-lg">
                                <h3 className="font-semibold mb-2">{t('equipment.outletAir')}</h3>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.temperature')}</span>
                                    <NumberInputWithControls value={acOutletAir.temp} onChange={handleAcOutletTempChange} unitType="temperature" unitSystem={unitSystem} />
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.rh')}</span>
                                    <NumberInputWithControls value={acOutletAir.rh} onChange={handleAcOutletRHChange} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                                </div>
                            </div>
                             <div className="p-4 bg-slate-100 rounded-lg">
                                <h3 className="font-semibold mb-2">{t('equipment.results')}</h3>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.abs_humidity')}</span>
                                    <DisplayValueWithUnit value={acOutletCalculated.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={acOutletAbsHumidityTooltip}/>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span className="text-sm">{t('airProperties.enthalpy')}</span>
                                    <DisplayValueWithUnit value={acOutletCalculated.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={acOutletEnthalpyTooltip} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="psychrometric-chart" className="p-4 bg-white rounded-lg shadow-md mb-6">
                    <h2 className="text-xl font-semibold mb-4">{t('app.psychrometricChart')}</h2>
                    <PsychrometricChart 
                        airConditionsData={equipmentForChart} 
                        globalInletAir={acInletAir}
                        globalOutletAir={acOutletCalculated}
                        unitSystem={unitSystem}
                    />
                </div>
                
                <div className="mb-6">
                    <Summary equipmentList={equipmentList} totalPressureLoss={totalPressureLoss} unitSystem={unitSystem} />
                </div>

                <hr className="my-8 border-slate-300" />

                <div className="p-4 bg-white rounded-lg shadow-md mb-6">
                    <h2 className="text-xl font-semibold mb-4">{t('app.addEquipment')}</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {equipmentButtons}
                    </div>
                    {equipmentList.length > 0 && (
                        <div className="mt-4 text-right">
                             <button onClick={deleteAllEquipment} className="px-4 py-2 bg-red-600 text-white rounded-md shadow-md hover:bg-red-700 transition-colors text-sm font-medium">
                                {t('app.deleteAllEquipment')}
                            </button>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    {equipmentList.map((equipment, index) => (
                        <EquipmentItem
                            key={equipment.id}
                            equipment={equipment}
                            index={index}
                            totalEquipment={equipmentList.length}
                            airflow={airflow}
                            onUpdate={updateEquipment}
                            onDelete={deleteEquipment}
                            onMove={moveEquipment}
                            onReflectUpstream={reflectUpstreamConditions}
                            onReflectDownstream={reflectDownstreamConditions}
                            unitSystem={unitSystem}
                        />
                    ))}
                </div>

            </div>
            <FloatingNav equipmentList={equipmentList} />
        </div>
    );
};

export default App;