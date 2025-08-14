
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
    Equipment, UnitSystem, EquipmentType, AirProperties, 
    CoolingCoilConditions, HeatingCoilConditions, FanConditions, 
    DamperConditions, FilterConditions, BurnerConditions, 
    EliminatorConditions, SprayWasherConditions, CustomConditions 
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

const App: React.FC = () => {
    const { t, locale, setLocale } = useLanguage();
    const [airflow, setAirflow] = useState<number | null>(100);
    const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
    const [nextId, setNextId] = useState(0);
    const [unitSystem, setUnitSystem] = useState<UnitSystem>(UnitSystem.SI);
    const [acInletAir, setAcInletAir] = useState<AirProperties>(() => calculateAirProperties(25, 60));
    const [acOutletAir, setAcOutletAir] = useState<AirProperties>(() => calculateAirProperties(35, 40));

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
                newEquipment.outletAir = calculateAirProperties(40, 20);
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
                 newEquipment.outletAir = calculateAirProperties(18, 95);
                 (newEquipment.conditions as SprayWasherConditions) = { waterToAirRatio: 0.8 };
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
                } else if (currentEq.type === EquipmentType.SPRAY_WASHER) {
                    // For spray washer, keep outlet temp as is, but reset other props for recalc
                    updatedEq.outletAir = { temp: currentEq.outletAir.temp, rh: null, absHumidity: null, enthalpy: null, density: null };
                }
                
                newList[targetEqIndex] = updatedEq;
            }
            return newList;
        });
    }, [acInletAir]);

    const reflectDownstreamConditions = useCallback((id: number, currentIndex: number) => {
        setEquipmentList(prevList => {
            let newOutletTemp: number | null = null;
    
            if (currentIndex === prevList.length - 1) {
                // Last item, use AC outlet conditions
                if (acOutletAir && acOutletAir.temp !== null) {
                    newOutletTemp = acOutletAir.temp;
                }
            } else {
                // Not the last item, use next equipment's inlet
                const nextEq = prevList[currentIndex + 1];
                if (nextEq && nextEq.inletAir && nextEq.inletAir.temp !== null) {
                    newOutletTemp = nextEq.inletAir.temp;
                }
            }
            
            if (newOutletTemp === null) return prevList;
    
            return prevList.map(eq => {
                if (eq.id === id) {
                    return { ...eq, outletAir: { ...eq.outletAir, temp: newOutletTemp } };
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
        <button key={type} onClick={() => addEquipment(type)} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-colors text-center text-sm font-medium">
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
                <h1 className="text-3xl font-bold text-center mb-6 text-slate-900">{t('app.title')}</h1>

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
                    <div className="p-4 bg-white rounded-lg shadow-md">
                        <label htmlFor="airflow" className="block text-lg font-semibold mb-2">{t('app.systemAirflow')}</label>
                        <NumberInputWithControls value={airflow} onChange={setAirflow} step={10} unitType="airflow" unitSystem={unitSystem} inputClassName="w-40 text-lg" containerClassName="flex-grow"/>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                    <div id="ac-inlet-conditions" className="p-4 bg-white rounded-lg shadow-md">
                        <h3 className="text-lg font-semibold mb-4">{t('app.acInletConditions')}</h3>
                        <div className="flex flex-col gap-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('airProperties.temperature')}</span>
                                <NumberInputWithControls value={acInletAir.temp} onChange={handleAcInletTempChange} step={1} unitType="temperature" unitSystem={unitSystem} inputClassName="w-24" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('airProperties.rh')}</span>
                                <NumberInputWithControls value={acInletAir.rh} onChange={handleAcInletRHChange} step={1} min={0} max={100} unitType="rh" unitSystem={unitSystem} inputClassName="w-24" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('airProperties.abs_humidity')}</span>
                                <DisplayValueWithUnit value={acInletAir.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} valueClassName="w-24 text-right" tooltipContent={acInletAbsHumidityTooltip} />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('airProperties.enthalpy')}</span>
                                <DisplayValueWithUnit value={acInletAir.enthalpy} unitType="enthalpy" unitSystem={unitSystem} valueClassName="w-24 text-right" tooltipContent={acInletEnthalpyTooltip} />
                            </div>
                        </div>
                    </div>
                    <div id="ac-outlet-conditions" className="p-4 bg-white rounded-lg shadow-md">
                        <h3 className="text-lg font-semibold mb-4">{t('app.acOutletConditions')}</h3>
                        <div className="flex flex-col gap-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('airProperties.temperature')}</span>
                                <NumberInputWithControls value={acOutletAir.temp} onChange={handleAcOutletTempChange} step={1} unitType="temperature" unitSystem={unitSystem} inputClassName="w-24" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('airProperties.rh')}</span>
                                <NumberInputWithControls value={acOutletAir.rh} onChange={handleAcOutletRHChange} step={1} min={0} max={100} unitType="rh" unitSystem={unitSystem} inputClassName="w-24" />
                            </div>
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('airProperties.abs_humidity')}</span>
                                <DisplayValueWithUnit value={acOutletCalculated.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} valueClassName="w-24 text-right" tooltipContent={acOutletAbsHumidityTooltip} />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t('airProperties.enthalpy')}</span>
                                <DisplayValueWithUnit value={acOutletCalculated.enthalpy} unitType="enthalpy" unitSystem={unitSystem} valueClassName="w-24 text-right" tooltipContent={acOutletEnthalpyTooltip} />
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 bg-white rounded-lg shadow-md mb-6">
                    <h2 className="text-xl font-semibold mb-4">{t('app.addEquipment')}</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">{equipmentButtons}</div>
                    <button onClick={deleteAllEquipment} className="w-full px-4 py-3 bg-red-500 text-white rounded-md shadow-md hover:bg-red-600 transition-colors text-center text-sm font-medium">{t('app.deleteAllEquipment')}</button>
                </div>

                <div className="mb-6 space-y-6">
                    {equipmentList.map((eq, index) => (
                        <EquipmentItem key={eq.id} equipment={eq} index={index} totalEquipment={equipmentList.length} airflow={airflow}
                            onUpdate={updateEquipment} onDelete={deleteEquipment} onMove={moveEquipment} 
                            onReflectUpstream={reflectUpstreamConditions} 
                            onReflectDownstream={reflectDownstreamConditions} 
                            unitSystem={unitSystem} />
                    ))}
                </div>

                <Summary equipmentList={equipmentList} totalPressureLoss={totalPressureLoss} unitSystem={unitSystem} />

                <div id="psychrometric-chart" className="p-4 bg-white rounded-lg shadow-md mt-6">
                     <h2 className="text-xl font-semibold mb-4">{t('app.psychrometricChart')}</h2>
                     <PsychrometricChart 
                        airConditionsData={equipmentForChart} 
                        globalInletAir={acInletAir} 
                        globalOutletAir={acOutletCalculated}
                        unitSystem={unitSystem} 
                    />
                </div>
            </div>
             <FloatingNav equipmentList={equipmentList} />
        </div>
    );
};

export default App;
