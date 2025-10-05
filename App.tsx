import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { 
    Equipment, UnitSystem, EquipmentType, AirProperties, 
    CoolingCoilConditions, HeatingCoilConditions, FanConditions, 
    FilterConditions, BurnerConditions, SprayWasherConditions, 
    SteamHumidifierConditions, CustomConditions, SteamPressureUnit, 
    Project, BurnerResults, CoolingCoilResults, FilterResults, HeatingCoilResults,
    SprayWasherResults, SteamHumidifierResults, FanResults, CustomResults
} from './types';
import { EQUIPMENT_COLORS } from './constants.ts';
import { calculateAirProperties, calculatePsat, calculateAbsoluteHumidity, calculateEnthalpy, calculateDewPoint, calculateAbsoluteHumidityFromEnthalpy, calculateRelativeHumidity, calculateDryAirDensity, PSYCH_CONSTANTS, calculateSteamProperties, calculateTempFromRhAndAbsHumidity, calculateAtmosphericPressure } from './services/psychrometrics.ts';
import { useLanguage } from './i18n/index.ts';
import EquipmentItem from './components/EquipmentItem.tsx';
import NumberInputWithControls from './components/NumberInputWithControls.tsx';
import DisplayValueWithUnit from './components/DisplayValueWithUnit.tsx';
import { PsychrometricChart } from './components/PsychrometricChart.tsx';
import FloatingNav from './components/FloatingNav.tsx';
import FormulaTooltipContent from './components/FormulaTooltipContent.tsx';
import { convertValue } from './utils/conversions.ts';
import ProjectTabs from './components/ProjectTabs.tsx';
import AllProjectsSummary from './components/AllProjectsSummary.tsx';

const EquipmentTabs: React.FC<{
    equipmentList: Equipment[];
    selectedId: number | null;
    onSelect: (id: number) => void;
    onMove: (draggedId: number, targetId: number, position: 'before' | 'after') => void;
    onRename: (id: number, newName: string) => void;
}> = ({ equipmentList, selectedId, onSelect, onMove, onRename }) => {
    const { t } = useLanguage();
    const [draggedId, setDraggedId] = useState<number | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ targetId: number; position: 'before' | 'after' } | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const prevEquipmentLengthRef = useRef(equipmentList.length);

    const [editingTabId, setEditingTabId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingTabId !== null && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingTabId]);

    const handleStartEditing = (eq: Equipment) => {
        setEditingTabId(eq.id);
        setEditingName(eq.name || t(`equipmentNames.${eq.type}`));
    };

    const handleFinishEditing = () => {
        if (editingTabId !== null && editingName.trim()) {
            onRename(editingTabId, editingName.trim());
        }
        setEditingTabId(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditingName(e.target.value);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleFinishEditing();
        } else if (e.key === 'Escape') {
            setEditingTabId(null);
        }
    };


    const checkForScroll = useCallback(() => {
        const el = scrollContainerRef.current;
        if (el) {
            const hasOverflow = el.scrollWidth > el.clientWidth;
            setCanScrollLeft(hasOverflow && el.scrollLeft > 1);
            setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
        }
    }, []);

    useLayoutEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        checkForScroll();
        const resizeObserver = new ResizeObserver(checkForScroll);
        resizeObserver.observe(el);
        const mutationObserver = new MutationObserver(checkForScroll);
        mutationObserver.observe(el, { childList: true, subtree: true });
        return () => {
            resizeObserver.disconnect();
            mutationObserver.disconnect();
        };
    }, [equipmentList, checkForScroll]);
    
    useEffect(() => {
        if (equipmentList.length > prevEquipmentLengthRef.current) {
            const el = scrollContainerRef.current;
            if (el) {
                el.scrollTo({
                    left: el.scrollWidth,
                    behavior: 'smooth',
                });
            }
        }
        prevEquipmentLengthRef.current = equipmentList.length;
    }, [equipmentList]);
    
    const handleScroll = (direction: 'left' | 'right') => {
        const el = scrollContainerRef.current;
        if (el) {
            const scrollAmount = el.clientWidth * 0.8;
            el.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth',
            });
        }
    };


    if (equipmentList.length === 0) {
        return null;
    }

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, eqId: number) => {
        e.dataTransfer.setData('application/hvac-equipment-id', eqId.toString());
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => setDraggedId(eqId), 0);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetId: number) => {
        e.preventDefault();
        if (targetId === draggedId) {
            setDropIndicator(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const position = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
        if (dropIndicator?.targetId !== targetId || dropIndicator?.position !== position) {
            setDropIndicator({ targetId, position });
        }
    };
    
    const handleDragLeave = () => {
        setDropIndicator(null);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!dropIndicator || !draggedId) {
            setDraggedId(null);
            setDropIndicator(null);
            return;
        };
        
        const droppedId = parseInt(e.dataTransfer.getData('application/hvac-equipment-id'), 10);
        if (!isNaN(droppedId) && droppedId !== dropIndicator.targetId) {
            onMove(droppedId, dropIndicator.targetId, dropIndicator.position);
        }
        setDropIndicator(null);
        setDraggedId(null);
    };
    
    const handleDragEnd = () => {
        setDraggedId(null);
        setDropIndicator(null);
    };

    return (
        <div className="mb-4">
            <div className="flex items-center -mx-2 px-2">
                 {canScrollLeft && (
                    <button
                        onClick={() => handleScroll('left')}
                        className="z-10 p-1 rounded-full hover:bg-slate-200 transition-colors flex-shrink-0 mr-1"
                        aria-label="Scroll tabs left"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                )}
                <div
                    ref={scrollContainerRef}
                    onScroll={checkForScroll}
                    className="flex-grow flex items-center border-b border-slate-300 overflow-x-auto scrollbar-hide"
                    role="tablist"
                >
                    {equipmentList.map((eq, index) => (
                        <React.Fragment key={eq.id}>
                            {index > 0 && <div className="border-l h-4 border-slate-300"></div>}
                            <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, eq.id)}
                                onDragOver={(e) => handleDragOver(e, eq.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onDragEnd={handleDragEnd}
                                onDoubleClick={() => handleStartEditing(eq)}
                                className={`py-2 px-4 cursor-pointer whitespace-nowrap text-base font-medium transition-all duration-200 rounded-t-md relative top-px ${
                                    selectedId === eq.id
                                        ? 'bg-white border border-slate-300 border-b-white text-blue-700 font-semibold'
                                        : 'text-slate-600 hover:bg-slate-100'
                                } ${draggedId === eq.id ? 'dragging' : ''}`}
                                role="tab"
                                aria-selected={selectedId === eq.id}
                            >
                                {dropIndicator?.targetId === eq.id && dropIndicator.position === 'before' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full" />}
                                {editingTabId === eq.id ? (
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={editingName}
                                        onChange={handleInputChange}
                                        onBlur={handleFinishEditing}
                                        onKeyDown={handleInputKeyDown}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-transparent outline-none border-b border-blue-500 w-24"
                                    />
                                ) : (
                                    <span onClick={() => onSelect(eq.id)} className="whitespace-nowrap max-w-[150px] truncate" title={eq.name || t(`equipmentNames.${eq.type}`)}>
                                        {eq.name || t(`equipmentNames.${eq.type}`)}
                                    </span>
                                )}
                                {dropIndicator?.targetId === eq.id && dropIndicator.position === 'after' && <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full" />}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
                {canScrollRight && (
                    <button
                        onClick={() => handleScroll('right')}
                        className="z-10 p-1 rounded-full hover:bg-slate-200 transition-colors flex-shrink-0 ml-1"
                        aria-label="Scroll tabs right"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};


const AdjacencyInfoPanel: React.FC<{
    equipmentList: Equipment[];
    selectedId: number | null;
    unitSystem: UnitSystem;
}> = ({ equipmentList, selectedId, unitSystem }) => {
    const { t } = useLanguage();

    if (selectedId === null) {
        return null;
    }

    const selectedIndex = equipmentList.findIndex(eq => eq.id === selectedId);
    if (selectedIndex === -1) return null;

    const upstreamEquipment = selectedIndex > 0 ? equipmentList[selectedIndex - 1] : null;
    const downstreamEquipment = selectedIndex < equipmentList.length - 1 ? equipmentList[selectedIndex + 1] : null;
    
    const upstreamOutletAir = upstreamEquipment ? upstreamEquipment.outletAir : { temp: null, rh: null, absHumidity: null, enthalpy: null, density: null };
    const downstreamInletAir = downstreamEquipment ? downstreamEquipment.inletAir : { temp: null, rh: null, absHumidity: null, enthalpy: null, density: null };

    const renderInfo = (
        positionLabel: string,
        airStateLabel: string,
        equipment: Equipment | null,
        airProps: AirProperties
    ) => {
        return (
            <div className="flex-1 p-3 bg-white border border-slate-300 rounded-lg space-y-1 text-sm">
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-2">
                    <span className="font-semibold text-slate-700 justify-self-start">{positionLabel}:</span>
                    <span className="font-medium justify-self-end">{equipment ? (equipment.name || t(`equipmentNames.${equipment.type}`)) : '-'}</span>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-2">
                    <span className="font-semibold text-slate-700 justify-self-start">{airStateLabel}:</span>
                    <div className="flex items-center justify-self-end justify-end gap-2">
                        {equipment ? (
                            <>
                                <DisplayValueWithUnit value={airProps.temp} unitType="temperature" unitSystem={unitSystem} valueClassName="text-base" compact />
                                <DisplayValueWithUnit value={airProps.rh} unitType="rh" unitSystem={unitSystem} valueClassName="text-base" compact />
                            </>
                        ) : (
                            <span className="text-slate-400">-</span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex gap-4 justify-between">
                {renderInfo(t('adjacency.upstreamLabel'), t('adjacency.outletAirLabel'), upstreamEquipment, upstreamOutletAir)}
                {renderInfo(t('adjacency.downstreamLabel'), t('adjacency.inletAirLabel'), downstreamEquipment, downstreamInletAir)}
            </div>
        </div>
    );
};

const getInitialEquipment = (): Equipment[] => {
    return [];
};

const createNewProject = (id: string, name: string): Project => ({
    id,
    name,
    airflow: 100,
    equipmentList: [],
    acInletAir: { temp: 30, rh: 20, absHumidity: null, enthalpy: null, density: null },
    acOutletAir: { temp: 27, rh: 70, absHumidity: null, enthalpy: null, density: null },
    altitude: 0,
});

const SUMMARY_TAB_ID = 'summary-tab';

interface AppState {
    projects: Project[];
    activeProjectId: string;
}

const runFullCalculation = (
    originalList: Equipment[],
    acInletAir: AirProperties,
    airflow: number | null,
    altitude: number
): Equipment[] => {
    const atmPressure = calculateAtmosphericPressure(altitude);
    const initialInlet = calculateAirProperties(acInletAir.temp, acInletAir.rh, atmPressure);

    const calculationResult = originalList.reduce(
        (acc, eq) => {
            const { calculatedList, previousOutlet } = acc;
            
            const currentEq = { ...eq };

            // Step 1: Set the inlet based on the previous outlet
            const effectiveInlet = currentEq.inletIsLocked ? currentEq.inletAir : previousOutlet;
            currentEq.inletAir = calculateAirProperties(effectiveInlet.temp, effectiveInlet.rh, atmPressure);

            // Step 2: Perform the calculation for the current equipment
            const massFlowRateDA_kg_s = (airflow !== null && currentEq.inletAir.density !== null) ? (airflow / 60) * currentEq.inletAir.density : 0;
            
            let newOutletAir: AirProperties = { temp: null, rh: null, absHumidity: null, enthalpy: null, density: null };
            let newResults: Equipment['results'] = {};
            let newPressureLoss: number | null = currentEq.pressureLoss;
            
            const { temp: inletTemp, absHumidity: inletAbsHum, enthalpy: inletEnthalpy } = currentEq.inletAir;

            if (massFlowRateDA_kg_s > 0 && inletTemp !== null && inletAbsHum !== null && inletEnthalpy !== null) {
                switch (currentEq.type) {
                    case EquipmentType.FILTER:
                        newOutletAir = { ...currentEq.inletAir };
                        const { width = 0, height = 0, sheets = 1 } = currentEq.conditions as FilterConditions;
                        const area_m2_per_sheet = (width / 1000) * (height / 1000);
                        const total_area_m2 = area_m2_per_sheet * sheets;
                        const faceVelocity = total_area_m2 > 0 && airflow ? (airflow / 60) / total_area_m2 : 0;
                        const airflowPerSheet = sheets > 0 && airflow ? airflow / sheets : 0;
                        newResults = { faceVelocity, treatedAirflowPerSheet: airflowPerSheet } as FilterResults;
                        break;
                    case EquipmentType.BURNER: {
                        const { shf = 1.0, lowerHeatingValue } = currentEq.conditions as BurnerConditions;
                        const userOutletTemp = currentEq.outletAir.temp;
                        if (userOutletTemp !== null) {
                            const delta_t = userOutletTemp - inletTemp;
                            let delta_x = 0;
                            if (shf > 0 && shf < 1.0) {
                                delta_x = (1000 / PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C) * (1 / shf - 1) * PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR * delta_t;
                            }
                            const outletAbsHum = inletAbsHum + delta_x;
                            newOutletAir = calculateAirProperties(userOutletTemp, null, atmPressure, outletAbsHum);

                            if (newOutletAir.enthalpy !== null) {
                                const totalHeat_kW = massFlowRateDA_kg_s * (newOutletAir.enthalpy - inletEnthalpy);
                                const heatingValue = lowerHeatingValue; // This is in MJ/m³
                                let gasFlowRate: number | undefined = undefined;
                                if (heatingValue && heatingValue > 0 && totalHeat_kW > 0) {
                                    // Convert kW to MJ/h (1 kW = 3.6 MJ/h)
                                    const heatLoad_MJ_h = totalHeat_kW * 3.6;
                                    gasFlowRate = heatLoad_MJ_h / heatingValue; // Result is in m³/h
                                }
                                newResults = { heatLoad_kW: totalHeat_kW, gasFlowRate } as BurnerResults;
                            }
                        }
                        break;
                    }
                    case EquipmentType.COOLING_COIL: {
                        const { chilledWaterInletTemp = 7, chilledWaterOutletTemp = 14, bypassFactor = 5, coilEfficiency = 85 } = currentEq.conditions as CoolingCoilConditions;
                        const BF = bypassFactor / 100;
                        const userOutletTemp = currentEq.outletAir.temp;

                        if (userOutletTemp !== null) {
                            const minAchievableOutletTemp = (chilledWaterInletTemp * (1 - BF)) + (inletTemp * BF);

                            let clampedOutletTemp = userOutletTemp;
                            if (clampedOutletTemp < minAchievableOutletTemp) {
                                clampedOutletTemp = minAchievableOutletTemp;
                            }
                             if (clampedOutletTemp > inletTemp) {
                                clampedOutletTemp = inletTemp;
                            }

                            const inletDewPointTemp = calculateDewPoint(inletAbsHum, atmPressure);
                            
                            let T_adp: number | undefined = undefined;
                            let outletAbsHum: number;
                            
                            if (BF < 1.0 && (inletTemp - clampedOutletTemp) > 0.01) {
                                T_adp = (clampedOutletTemp - inletTemp * BF) / (1 - BF);
                            }

                            if (T_adp !== undefined && T_adp < inletDewPointTemp) {
                                const x_adp = calculateAbsoluteHumidity(T_adp, 100, atmPressure);
                                outletAbsHum = x_adp * (1 - BF) + inletAbsHum * BF;
                            } else {
                                outletAbsHum = inletAbsHum;
                            }
                            
                            newOutletAir = calculateAirProperties(clampedOutletTemp, null, atmPressure, outletAbsHum);

                            const saturationHumidityAtOutlet = calculateAbsoluteHumidity(clampedOutletTemp, 100, atmPressure);
                            if (newOutletAir.absHumidity !== null && newOutletAir.absHumidity > saturationHumidityAtOutlet) {
                                newOutletAir = calculateAirProperties(clampedOutletTemp, 100, atmPressure); 
                            }
                            
                            if (newOutletAir.enthalpy !== null && newOutletAir.absHumidity !== null) {
                                const airSideHeatLoad_kW = massFlowRateDA_kg_s * (inletEnthalpy - newOutletAir.enthalpy);
                                const coldWaterSideHeatLoad_kW = (coilEfficiency > 0) ? airSideHeatLoad_kW / (coilEfficiency / 100) : 0;
                                const dehumidification_kg_s = massFlowRateDA_kg_s * (inletAbsHum - newOutletAir.absHumidity) / 1000;
                                
                                const waterTempDiff = chilledWaterOutletTemp - chilledWaterInletTemp;
                                const chilledWaterFlow_L_min = waterTempDiff > 0 ? (coldWaterSideHeatLoad_kW / (4.186 * waterTempDiff)) * 60 : 0;
                                
                                newResults = {
                                    airSideHeatLoad_kW,
                                    coldWaterSideHeatLoad_kW,
                                    chilledWaterFlow_L_min,
                                    dehumidification_L_min: dehumidification_kg_s > 0 ? dehumidification_kg_s * 60 : 0,
                                    bypassFactor: BF * 100,
                                    contactFactor: (1 - BF) * 100,
                                    apparatusDewPointTemp: T_adp,
                                } as CoolingCoilResults;
                            }
                        }
                        break;
                    }
                    case EquipmentType.HEATING_COIL: {
                        const { hotWaterInletTemp = 80, hotWaterOutletTemp = 50, coilEfficiency = 85 } = currentEq.conditions as HeatingCoilConditions;
                        const userOutletTemp = currentEq.outletAir.temp;

                        if (userOutletTemp !== null) {
                            const clampedOutletTemp = Math.max(inletTemp, userOutletTemp);
                            newOutletAir = calculateAirProperties(clampedOutletTemp, null, atmPressure, inletAbsHum);
                            if (newOutletAir.enthalpy !== null) {
                                const airSideHeatLoad_kW = massFlowRateDA_kg_s * (newOutletAir.enthalpy - inletEnthalpy);
                                const hotWaterSideHeatLoad_kW = (coilEfficiency > 0) ? airSideHeatLoad_kW / (coilEfficiency / 100) : 0;
                                const waterTempDiff = hotWaterInletTemp - hotWaterOutletTemp;
                                const hotWaterFlow_L_min = waterTempDiff > 0 ? (hotWaterSideHeatLoad_kW / (4.186 * waterTempDiff)) * 60 : 0;
                                newResults = { airSideHeatLoad_kW, hotWaterSideHeatLoad_kW, hotWaterFlow_L_min } as HeatingCoilResults;
                            }
                        }
                        break;
                    }
                    case EquipmentType.SPRAY_WASHER: {
                        const { waterToAirRatio = 0.8 } = currentEq.conditions as SprayWasherConditions;
                        const userOutletTemp = currentEq.outletAir.temp;

                        if (userOutletTemp !== null && inletEnthalpy !== null) {
                            let tSat = inletTemp;
                            for (let i = 0; i < 15; i++) { 
                                let wSat = calculateAbsoluteHumidity(tSat, 100, atmPressure);
                                let hSat = calculateEnthalpy(tSat, wSat);
                                tSat -= (hSat - inletEnthalpy) * 0.05; 
                            }
                            const finalWSat = calculateAbsoluteHumidity(tSat, 100, atmPressure);

                            let clampedOutletTemp = userOutletTemp;
                            if (clampedOutletTemp < tSat) clampedOutletTemp = tSat;
                            if (clampedOutletTemp > inletTemp) clampedOutletTemp = inletTemp;

                            const outletAbsHum = calculateAbsoluteHumidityFromEnthalpy(clampedOutletTemp, inletEnthalpy);
                            newOutletAir = calculateAirProperties(clampedOutletTemp, null, atmPressure, outletAbsHum);

                            if (newOutletAir.absHumidity !== null) {
                                const humidification_kg_s = massFlowRateDA_kg_s * (newOutletAir.absHumidity - inletAbsHum) / 1000;
                                let humidificationEfficiency = 0;
                                if (finalWSat > inletAbsHum) {
                                    humidificationEfficiency = ((newOutletAir.absHumidity - inletAbsHum) / (finalWSat - inletAbsHum)) * 100;
                                }
                                newResults = {
                                    humidification_L_min: humidification_kg_s > 0 ? humidification_kg_s * 60 : 0,
                                    sprayAmount_L_min: massFlowRateDA_kg_s * waterToAirRatio * 60,
                                    humidificationEfficiency: Math.max(0, Math.min(100, humidificationEfficiency)),
                                } as SprayWasherResults;
                            }
                        }
                        break;
                    }
                    case EquipmentType.STEAM_HUMIDIFIER: {
                        const steamCond = currentEq.conditions as SteamHumidifierConditions;
                        const userOutletRh = currentEq.outletAir.rh;
                        if (userOutletRh !== null) {
                            const steamProps = calculateSteamProperties(steamCond.steamGaugePressure ?? 100, atmPressure);
                            const h_steam = steamProps.enthalpy;
                            
                            let t_out_guess = inletTemp;
                            for (let i = 0; i < 20; i++) {
                                 const x_out_guess = calculateAbsoluteHumidity(t_out_guess, userOutletRh, atmPressure);
                                 const h_out_guess = calculateEnthalpy(t_out_guess, x_out_guess);
                                 const balance = (h_out_guess - inletEnthalpy) - ((x_out_guess - inletAbsHum) / 1000) * h_steam;
                                 if (Math.abs(balance) < 0.01) break;
                                 t_out_guess -= balance * 0.05;
                            }
                            newOutletAir = calculateAirProperties(t_out_guess, userOutletRh, atmPressure);

                            if (newOutletAir.absHumidity !== null && newOutletAir.temp !== null &&
                                (newOutletAir.absHumidity < inletAbsHum || newOutletAir.temp < inletTemp)) {
                                newOutletAir = { ...currentEq.inletAir }; 
                            }

                            if (newOutletAir.absHumidity !== null) {
                                const steamAmount_kg_s = massFlowRateDA_kg_s * (newOutletAir.absHumidity - inletAbsHum) / 1000;
                                newResults = {
                                    steamAbsolutePressure: steamProps.absPressure,
                                    steamTemperature: steamProps.temp,
                                    steamEnthalpy: steamProps.enthalpy * 0.239006,
                                    requiredSteamAmount: steamAmount_kg_s > 0 ? steamAmount_kg_s * 3600 : 0,
                                } as SteamHumidifierResults;
                            }
                        }
                        break;
                    }
                    case EquipmentType.FAN: {
                        const { motorOutput = 0.2, motorEfficiency = 80 } = currentEq.conditions as FanConditions;
                        const heatGeneration_kW = motorOutput * (1 - (motorEfficiency / 100));

                        if (currentEq.outletIsLocked) {
                            const userOutletTemp = currentEq.outletAir.temp;
                            const userOutletRh = currentEq.outletAir.rh;
                            
                            if (userOutletTemp !== null && userOutletRh !== null && massFlowRateDA_kg_s > 0) {
                                const targetOutletAir = calculateAirProperties(userOutletTemp, userOutletRh, atmPressure);
                
                                if (targetOutletAir.absHumidity !== null && targetOutletAir.temp !== null) {
                                    const newAbsHum = targetOutletAir.absHumidity;
                                    
                                    const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * (newAbsHum / 1000);
                                    const delta_t = heatGeneration_kW / (massFlowRateDA_kg_s * c_pa_moist);
                                    const calculatedInletTemp = targetOutletAir.temp - delta_t;
                                    
                                    currentEq.inletAir = calculateAirProperties(calculatedInletTemp, null, atmPressure, newAbsHum);
                                    newOutletAir = targetOutletAir;
                                    
                                    currentEq.inletIsLocked = true; 
                                }
                            }
                        }
                        
                        if (newOutletAir.temp === null) {
                            if (currentEq.outletIsLocked) {
                                currentEq.outletIsLocked = false;
                            }
                            const effectiveInlet = currentEq.inletIsLocked ? currentEq.inletAir : previousOutlet;
                            currentEq.inletAir = calculateAirProperties(effectiveInlet.temp, effectiveInlet.rh, atmPressure, effectiveInlet.absHumidity);
                            
                            if (currentEq.inletAir.temp !== null && currentEq.inletAir.absHumidity !== null && massFlowRateDA_kg_s > 0) {
                                const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * (currentEq.inletAir.absHumidity / 1000);
                                const tempRise_deltaT_celsius = heatGeneration_kW / (massFlowRateDA_kg_s * c_pa_moist);
                                const outletTemp = currentEq.inletAir.temp + tempRise_deltaT_celsius;
                                newOutletAir = calculateAirProperties(outletTemp, null, atmPressure, currentEq.inletAir.absHumidity);
                            } else {
                                newOutletAir = { ...currentEq.inletAir };
                            }
                        }
                
                        const finalTempRise = (newOutletAir.temp ?? 0) - (currentEq.inletAir.temp ?? 0);
                        newResults = { heatGeneration_kW, tempRise_deltaT_celsius: finalTempRise } as FanResults;
                        newPressureLoss = 0;
                        break;
                    }
                    case EquipmentType.CUSTOM:
                        newOutletAir = calculateAirProperties(currentEq.outletAir.temp, currentEq.outletAir.rh, atmPressure);
                        newResults = {} as CustomResults;
                        break;
                }
            }
            
            currentEq.outletAir = newOutletAir;
            currentEq.results = newResults;
            currentEq.pressureLoss = newPressureLoss;
            
            calculatedList.push(currentEq);
            
            return {
                calculatedList,
                previousOutlet: { ...newOutletAir }
            };
        },
        {
            calculatedList: [] as Equipment[],
            previousOutlet: { ...initialInlet }
        }
    );
    
    return calculationResult.calculatedList;
};


const App: React.FC = () => {
    const { t, locale, setLocale } = useLanguage();
    const [unitSystem, setUnitSystem] = useState<UnitSystem>(UnitSystem.SI);
    
    const [state, setState] = useState<AppState>(() => {
        const firstProjectId = `proj-${Date.now()}`;
        const initialProject = createNewProject(firstProjectId, `ASH 1`);
        const initialEquipment = getInitialEquipment();
        
        const atmPressure = calculateAtmosphericPressure(initialProject.altitude);
        const acInletAir = calculateAirProperties(initialProject.acInletAir.temp, initialProject.acInletAir.rh, atmPressure);
        const acOutletAir = calculateAirProperties(initialProject.acOutletAir.temp, initialProject.acOutletAir.rh, atmPressure);

        const calculatedInitialEquipment = runFullCalculation(initialEquipment, acInletAir, initialProject.airflow, initialProject.altitude);
        
        const initialProjects = [{
            ...initialProject,
            equipmentList: calculatedInitialEquipment,
            acInletAir,
            acOutletAir
        }];

        return {
            projects: initialProjects,
            activeProjectId: firstProjectId
        };
    });
    
    const { projects, activeProjectId } = state;
    const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isTwoColumnLayout, setIsTwoColumnLayout] = useState(true);

    const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);

    useEffect(() => {
        if (activeProject) {
            const currentSelected = activeProject.equipmentList.find(eq => eq.id === selectedEquipmentId);
            if (!currentSelected) {
                setSelectedEquipmentId(activeProject.equipmentList[0]?.id ?? null);
            }
        } else {
            setSelectedEquipmentId(null);
        }
    }, [activeProject, selectedEquipmentId]);
    
    const updateActiveProject = useCallback((
        updater: (project: Project) => Partial<Project>
    ) => {
        setState(prevState => {
            if (!prevState.activeProjectId || prevState.activeProjectId === SUMMARY_TAB_ID) return prevState;
            const currentProject = prevState.projects.find(p => p.id === prevState.activeProjectId);
            if (!currentProject) return prevState;

            const updates = updater(currentProject);
            const updatedProject = { ...currentProject, ...updates };

            return {
                ...prevState,
                projects: prevState.projects.map(p =>
                    p.id === prevState.activeProjectId ? updatedProject : p
                )
            };
        });
    }, []);

    const toggleLayout = () => setIsTwoColumnLayout(prev => !prev);

    const handleExport = () => {
        const dataToSave = {
            version: '2.1.0',
            projects,
            activeProjectId,
            unitSystem,
            locale,
        };
        const jsonString = JSON.stringify(dataToSave, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hvac-calculator-projects.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error('File content is not a string.');
                const data = JSON.parse(text);
                if ((data.version === '2.0.0' || data.version === '2.1.0') && data.projects && data.activeProjectId && data.unitSystem) {
                    const loadedProjects = data.projects.map((p: Project) => ({
                        ...p,
                        altitude: p.altitude ?? 0, // Add altitude fallback
                    }));
                    setState({ projects: loadedProjects, activeProjectId: data.activeProjectId });
                    setUnitSystem(data.unitSystem);
                    if (data.locale) setLocale(data.locale);
                    alert(t('app.importSuccess'));
                } else { throw new Error('Invalid or outdated configuration file.'); }
            } catch (error) {
                console.error("Failed to import configuration:", error);
                alert(t('app.importError'));
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const triggerFileSelect = () => fileInputRef.current?.click();
    
    const handleAddProject = () => {
        const newProject = createNewProject(`proj-${Date.now()}`, `ASH ${projects.length + 1}`);
        setState(prev => ({
            ...prev,
            projects: [...prev.projects, newProject],
            activeProjectId: newProject.id
        }));
    };

    const handleCloseProject = (idToClose: string) => {
        setState(prev => {
            const projectToCloseIndex = prev.projects.findIndex(p => p.id === idToClose);
            const newProjects = prev.projects.filter(p => p.id !== idToClose);

            if (newProjects.length === 0) {
                return { ...prev, projects: [], activeProjectId: SUMMARY_TAB_ID };
            }
            
            let newActiveId = prev.activeProjectId;
            if (prev.activeProjectId === idToClose) {
                if (newProjects.length > 0) {
                    const newActiveIndex = Math.max(0, projectToCloseIndex - 1);
                    newActiveId = newProjects[newActiveIndex].id;
                } else {
                    newActiveId = SUMMARY_TAB_ID;
                }
            }
            return { ...prev, projects: newProjects, activeProjectId: newActiveId };
        });
    };
    
    const handleRenameProject = (id: string, newName: string) => {
        setState(prev => ({
            ...prev,
            projects: prev.projects.map(p => p.id === id ? { ...p, name: newName } : p)
        }));
    };

    const handleDuplicateProject = (idToDuplicate: string) => {
        setState(prev => {
            const projectToDuplicate = prev.projects.find(p => p.id === idToDuplicate);
            if (!projectToDuplicate) return prev;

            const originalIndex = prev.projects.findIndex(p => p.id === idToDuplicate);
            if (originalIndex === -1) return prev;
            
            const newProject: Project = JSON.parse(JSON.stringify(projectToDuplicate));
            newProject.id = `proj-${Date.now()}`;
            newProject.name = `${projectToDuplicate.name}${t('app.copySuffix')}`;

            const newProjects = [...prev.projects];
            newProjects.splice(originalIndex + 1, 0, newProject);

            return {
                ...prev,
                projects: newProjects,
                activeProjectId: newProject.id
            };
        });
    };

    const handleMoveProject = (draggedId: string, targetId: string, position: 'before' | 'after') => {
        setState(prev => {
            const draggedProject = prev.projects.find(p => p.id === draggedId);
            if (!draggedProject) return prev;

            const itemsWithoutDragged = prev.projects.filter(p => p.id !== draggedId);
            let targetIndex = itemsWithoutDragged.findIndex(p => p.id === targetId);

            if (targetIndex === -1) return prev;
            
            if (position === 'after') {
                targetIndex += 1;
            }

            itemsWithoutDragged.splice(targetIndex, 0, draggedProject);
            return { ...prev, projects: itemsWithoutDragged };
        });
    };
    
    const handleGlobalChange = useCallback((updates: Partial<Omit<Project, 'id' | 'name' | 'equipmentList'>>) => {
        updateActiveProject(project => {
            const updatedProjectState = { ...project, ...updates };
            const { altitude, acInletAir, acOutletAir, airflow, equipmentList } = updatedProjectState;
            const atmPressure = calculateAtmosphericPressure(altitude);
            
            const recalculatedInlet = calculateAirProperties(acInletAir.temp, acInletAir.rh, atmPressure);
            const recalculatedOutlet = calculateAirProperties(acOutletAir.temp, acOutletAir.rh, atmPressure);
    
            const calculatedList = runFullCalculation(equipmentList, recalculatedInlet, airflow, altitude);
    
            return { 
                ...updates, 
                acInletAir: recalculatedInlet,
                acOutletAir: recalculatedOutlet,
                equipmentList: calculatedList 
            };
        });
    }, [updateActiveProject]);


    const addEquipment = (type: EquipmentType) => {
        updateActiveProject(project => {
            const { equipmentList, acInletAir, altitude } = project;
            const atmPressure = calculateAtmosphericPressure(altitude);
            const newId = equipmentList.reduce((maxId, eq) => Math.max(eq.id, maxId), -1) + 1;
            const defaultInlet = equipmentList.length > 0 ? (equipmentList[equipmentList.length - 1].outletAir) : { ...acInletAir };
            let newEquipment: Equipment = {
                id: newId, type, pressureLoss: 50, inletAir: defaultInlet, outletAir: { ...defaultInlet },
                conditions: {}, results: {}, color: EQUIPMENT_COLORS[type], inletIsLocked: false,
            };
            // Set type-specific defaults
            switch (type) {
                 case EquipmentType.FILTER: (newEquipment.conditions as FilterConditions) = { width: 500, height: 500, thickness: 50, sheets: 1 }; break;
                 case EquipmentType.BURNER: newEquipment.outletAir = calculateAirProperties(55.2, null, atmPressure, defaultInlet.absHumidity); (newEquipment.conditions as BurnerConditions) = { shf: 0.9, lowerHeatingValue: 45.0 }; break;
                 case EquipmentType.COOLING_COIL: newEquipment.outletAir = calculateAirProperties(15, 95, atmPressure); (newEquipment.conditions as CoolingCoilConditions) = { chilledWaterInletTemp: 7, chilledWaterOutletTemp: 14, bypassFactor: 5, coilEfficiency: 85 }; break;
                 case EquipmentType.HEATING_COIL: newEquipment.outletAir = calculateAirProperties(40, 30, atmPressure); (newEquipment.conditions as HeatingCoilConditions) = { hotWaterInletTemp: 80, hotWaterOutletTemp: 50, coilEfficiency: 85 }; break;
                 case EquipmentType.SPRAY_WASHER: newEquipment.outletAir = calculateAirProperties(25, 70, atmPressure); (newEquipment.conditions as SprayWasherConditions) = { waterToAirRatio: 0.8 }; break;
                 case EquipmentType.STEAM_HUMIDIFIER: newEquipment.outletAir = { temp: null, rh: 70, absHumidity: null, enthalpy: null, density: null }; (newEquipment.conditions as SteamHumidifierConditions) = { steamGaugePressure: 100, steamGaugePressureUnit: SteamPressureUnit.KPAG, }; break;
                 case EquipmentType.FAN:
                    (newEquipment.conditions as FanConditions) = { motorOutput: 0.2, motorEfficiency: 80 };
                    newEquipment.pressureLoss = 0;
                    break;
                 case EquipmentType.CUSTOM:
                    (newEquipment.conditions as CustomConditions) = {};
                    if (defaultInlet.temp !== null && defaultInlet.absHumidity !== null) {
                        const newOutletTemp = defaultInlet.temp + 2;
                        newEquipment.outletAir = calculateAirProperties(newOutletTemp, null, atmPressure, defaultInlet.absHumidity);
                    }
                    break;
            }
            setSelectedEquipmentId(newId);
            const newList = [...equipmentList, newEquipment];
            const calculatedList = runFullCalculation(newList, project.acInletAir, project.airflow, project.altitude);
            return { equipmentList: calculatedList };
        });
    };

    const updateEquipment = useCallback((id: number, updatedEquipment: Partial<Equipment>) => {
        updateActiveProject(project => {
            const preCalculatedList = project.equipmentList.map(eq =>
                eq.id === id ? { ...eq, ...updatedEquipment } : eq
            );
            const fullyCalculatedList = runFullCalculation(
                preCalculatedList,
                project.acInletAir,
                project.airflow,
                project.altitude
            );
            return { equipmentList: fullyCalculatedList };
        });
    }, [updateActiveProject]);
    
    const handleRenameEquipment = (id: number, newName: string) => {
        updateEquipment(id, { name: newName });
    };

    const moveEquipment = (draggedId: number, targetId: number, position: 'before' | 'after') => {
        updateActiveProject(project => {
            const { equipmentList } = project;
            const items = [...equipmentList];
            const draggedIndex = items.findIndex(p => p.id === draggedId);
            if (draggedIndex === -1) return { equipmentList };

            const [draggedItem] = items.splice(draggedIndex, 1);
            
            let targetIndex = items.findIndex(p => p.id === targetId);
            if (targetIndex === -1) {
                 items.splice(draggedIndex, 0, draggedItem);
                 return { equipmentList: items };
            }

            if (position === 'after') {
                targetIndex += 1;
            }

            items.splice(targetIndex, 0, draggedItem);
            
            const calculatedList = runFullCalculation(items, project.acInletAir, project.airflow, project.altitude);
            
            return { equipmentList: calculatedList };
        });
    };

    const handleChartUpdate = useCallback((id: number, updates: { inlet?: AirProperties, outlet?: AirProperties }) => {
        if (!activeProject) return;
        const originalEquipment = activeProject.equipmentList.find(eq => eq.id === id);
        if (!originalEquipment) return;

        const updatedFields: Partial<Equipment> = {};
        if (updates.inlet) { 
            updatedFields.inletAir = updates.inlet; 
            updatedFields.inletIsLocked = true; 
        }
        if (updates.outlet) {
            let newOutlet = { ...updates.outlet };
            if (originalEquipment.type === EquipmentType.COOLING_COIL && newOutlet.temp !== null && originalEquipment.inletAir.temp !== null && newOutlet.temp > originalEquipment.inletAir.temp) { newOutlet.temp = originalEquipment.inletAir.temp; }
            if ((originalEquipment.type === EquipmentType.HEATING_COIL || originalEquipment.type === EquipmentType.BURNER) && newOutlet.temp !== null && originalEquipment.inletAir.temp !== null && newOutlet.temp < originalEquipment.inletAir.temp) { newOutlet.temp = originalEquipment.inletAir.temp; }
            updatedFields.outletAir = newOutlet;
        }
        
        updateEquipment(id, updatedFields);

    }, [activeProject, updateEquipment]);

    const deleteEquipment = (id: number) => {
        if (!activeProject) return;
        const list = activeProject.equipmentList;
        const indexToDelete = list.findIndex(eq => eq.id === id);

        if (id === selectedEquipmentId) {
            const listAfterDelete = list.filter(eq => eq.id !== id);
            if (listAfterDelete.length > 0) {
                const newIndex = Math.max(0, indexToDelete - 1);
                setSelectedEquipmentId(listAfterDelete[newIndex].id);
            } else {
                setSelectedEquipmentId(null);
            }
        }

        updateActiveProject(project => {
            const newList = project.equipmentList.filter(eq => eq.id !== id);
            const calculatedList = runFullCalculation(newList, project.acInletAir, project.airflow, project.altitude);
            return { equipmentList: calculatedList };
        });
    };

    const deleteAllEquipment = () => {
        updateActiveProject(() => ({ equipmentList: [] }));
        setSelectedEquipmentId(null);
    };

    const handleAcInletTempChange = (value: number | null) => { if (activeProject) handleGlobalChange({ acInletAir: { ...activeProject.acInletAir, temp: value } })};
    const handleAcInletRHChange = (value: number | null) => { if (activeProject) handleGlobalChange({ acInletAir: { ...activeProject.acInletAir, rh: value } })};
    const handleAcOutletTempChange = (value: number | null) => { if (activeProject) handleGlobalChange({ acOutletAir: { ...activeProject.acOutletAir, temp: value } })};
    const handleAcOutletRHChange = (value: number | null) => { if (activeProject) handleGlobalChange({ acOutletAir: { ...activeProject.acOutletAir, rh: value } })};
    const handleAirflowChange = (value: number | null) => handleGlobalChange({ airflow: value });
    const handleAltitudeChange = (value: number | null) => handleGlobalChange({ altitude: value ?? 0 });
    
    const equipmentForChart = useMemo(() => activeProject?.equipmentList.filter(eq =>
        ![EquipmentType.FILTER].includes(eq.type) &&
        eq.inletAir.temp !== null && eq.outletAir.temp !== null
    ) || [], [activeProject]);
    
    const totalPressureLoss = useMemo(() => activeProject?.equipmentList.reduce((sum, eq) => {
        if (eq.type !== EquipmentType.FAN) {
            return sum + (eq.pressureLoss || 0);
        }
        return sum;
    }, 0) || 0, [activeProject]);
    
    const equipmentButtons = Object.values(EquipmentType).map(type => (
        <button key={type} onClick={() => addEquipment(type)} className="px-4 h-20 text-white rounded-md shadow-md transition-colors text-center font-medium bg-blue-600 hover:bg-blue-700 flex items-center justify-center">
            {t(`equipmentNames.${type}`)}
        </button>
    ));

    const acInletAbsHumidityTooltip = useMemo(() => {
        if (!activeProject || activeProject.acInletAir.temp === null || activeProject.acInletAir.rh === null) return null;
        const { temp, rh } = activeProject.acInletAir;
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh';
        const P_sat = calculatePsat(temp), P_v = P_sat * (rh / 100); 
        const values = unitSystem === UnitSystem.IMPERIAL ? {
            't_f': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
            'rh': { value: rh, unit: '%' },
            'P_v': { value: P_v, unit: 'Pa' } 
        } : {
            't': { value: temp, unit: '°C' },
            'rh': { value: rh, unit: '%' },
            'P_sat': { value: P_sat, unit: 'Pa' },
            'P_v': { value: P_v, unit: 'Pa' }
        };
        return <FormulaTooltipContent title={t(formulaPath + '.title')} formula={t(formulaPath + '.' + unitSystem + '.formula')} legend={t(formulaPath + '.' + unitSystem + '.legend')} values={values} />;
    }, [activeProject?.acInletAir, locale, unitSystem, t]);

    const acInletEnthalpyTooltip = useMemo(() => {
        if (!activeProject) return null;
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const values = unitSystem === UnitSystem.IMPERIAL ? {
            't': { value: convertValue(activeProject.acInletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
            'x': { value: convertValue(activeProject.acInletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' }
        } : {
            't': { value: activeProject.acInletAir.temp, unit: '°C' },
            'x': { value: activeProject.acInletAir.absHumidity, unit: 'g/kg(DA)' }
        };
        return <FormulaTooltipContent title={t(formulaPath + '.title')} formula={t(formulaPath + '.' + unitSystem + '.formula')} legend={t(formulaPath + '.' + unitSystem + '.legend')} values={values} />;
    }, [activeProject?.acInletAir, locale, unitSystem, t]);
    
    const acOutletCalculated = useMemo(() => {
        if (!activeProject) return { temp: null, rh: null, absHumidity: null, enthalpy: null, density: null };
        const atmPressure = calculateAtmosphericPressure(activeProject.altitude);
        return calculateAirProperties(activeProject.acOutletAir.temp, activeProject.acOutletAir.rh, atmPressure);
    }, [activeProject]);

    const acOutletAbsHumidityTooltip = useMemo(() => {
        if (!activeProject || activeProject.acOutletAir.temp === null || activeProject.acOutletAir.rh === null) return null;
        const { temp, rh } = activeProject.acOutletAir;
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh';
        const P_sat = calculatePsat(temp), P_v = P_sat * (rh / 100);
        const values = unitSystem === UnitSystem.IMPERIAL ? {
            't_f': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
            'rh': { value: rh, unit: '%' },
            'P_v': { value: P_v, unit: 'Pa' }
        } : {
            't': { value: temp, unit: '°C' },
            'rh': { value: rh, unit: '%' },
            'P_sat': { value: P_sat, unit: 'Pa' },
            'P_v': { value: P_v, unit: 'Pa' }
        };
        return <FormulaTooltipContent title={t(formulaPath + '.title')} formula={t(formulaPath + '.' + unitSystem + '.formula')} legend={t(formulaPath + '.' + unitSystem + '.legend')} values={values} />;
    }, [activeProject?.acOutletAir, locale, unitSystem, t]);

    const acOutletEnthalpyTooltip = useMemo(() => {
        if (!activeProject) return null;
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX';
        const values = unitSystem === UnitSystem.IMPERIAL ? {
            't': { value: convertValue(activeProject.acOutletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' },
            'x': { value: convertValue(acOutletCalculated.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' }
        } : {
            't': { value: activeProject.acOutletAir.temp, unit: '°C' },
            'x': { value: acOutletCalculated.absHumidity, unit: 'g/kg(DA)' }
        };
        return <FormulaTooltipContent title={t(formulaPath + '.title')} formula={t(formulaPath + '.' + unitSystem + '.formula')} legend={t(formulaPath + '.' + unitSystem + '.legend')} values={values} />;
    }, [activeProject?.acOutletAir, acOutletCalculated.absHumidity, locale, unitSystem, t]);

    const selectedEquipment = useMemo(() => activeProject?.equipmentList.find(eq => eq.id === selectedEquipmentId), [activeProject, selectedEquipmentId]);

    const psychrometricChartSection = activeProject && (
        <div id="psychrometric-chart" className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">{t('app.psychrometricChart')}</h2>
            <PsychrometricChart 
                airConditionsData={equipmentForChart} 
                globalInletAir={activeProject.acInletAir}
                globalOutletAir={acOutletCalculated}
                unitSystem={unitSystem}
                isSplitViewActive={isTwoColumnLayout}
                altitude={activeProject.altitude}
                onUpdate={handleChartUpdate}
            />
        </div>
    );

    const disclaimerContent = t('app.disclaimerContent');

    return (
        <div className="min-h-screen p-4 font-sans text-slate-800 bg-slate-100">
            <div className="max-w-screen-2xl mx-auto p-6 rounded-lg shadow-xl bg-slate-50">
                <header className="mb-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <h1 className="text-3xl font-bold text-slate-900">{t('app.title')}</h1>
                         <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={triggerFileSelect} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                {t('app.importConfig')}
                            </button>
                            <button onClick={handleExport} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                {t('app.exportConfig')}
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="application/json" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <p className="text-slate-600">{t('app.description')}</p>
                        <details className="mt-2 text-sm text-slate-500">
                            <summary className="cursor-pointer font-medium hover:text-slate-700">{t('app.instructionsTitle')}</summary>
                            <p className="mt-1 whitespace-pre-wrap">{t('app.instructions')}</p>
                        </details>
                    </div>
                </header>

                <div className="p-4 bg-white rounded-lg shadow-md mb-6">
                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                        <fieldset><legend className="block text-lg font-semibold mb-2">{t('app.language')}</legend>
                            <div className="flex flex-wrap gap-2">
                                <div><input type="radio" id="lang-ja" name="language" value="ja" checked={locale === 'ja'} onChange={e => setLocale(e.target.value)} className="sr-only" aria-labelledby="lang-ja-label"/><label id="lang-ja-label" htmlFor="lang-ja" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ locale === 'ja' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}>日本語</label></div>
                                <div><input type="radio" id="lang-en" name="language" value="en" checked={locale === 'en'} onChange={e => setLocale(e.target.value)} className="sr-only" aria-labelledby="lang-en-label"/><label id="lang-en-label" htmlFor="lang-en" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ locale === 'en' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}>English</label></div>
                            </div>
                        </fieldset>
                        <fieldset><legend className="block text-lg font-semibold mb-2">{t('app.unitSystem')}</legend>
                            <div className="flex flex-wrap gap-2">
                                <div><input type="radio" id="unit-si" name="unitSystem" value={UnitSystem.SI} checked={unitSystem === UnitSystem.SI} onChange={e => setUnitSystem(e.target.value as UnitSystem)} className="sr-only" aria-labelledby="unit-si-label" /><label id="unit-si-label" htmlFor="unit-si" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ unitSystem === UnitSystem.SI ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}>{t('app.siUnits')}</label></div>
                                <div><input type="radio" id="unit-imperial" name="unitSystem" value={UnitSystem.IMPERIAL} checked={unitSystem === UnitSystem.IMPERIAL} onChange={e => setUnitSystem(e.target.value as UnitSystem)} className="sr-only" aria-labelledby="unit-imperial-label" /><label id="unit-imperial-label" htmlFor="unit-imperial" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ unitSystem === UnitSystem.IMPERIAL ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}>{t('app.imperialUnits')}</label></div>
                            </div>
                        </fieldset>
                    </div>
                </div>

                <ProjectTabs
                    projects={projects}
                    activeProjectId={activeProjectId}
                    onSelectProject={(id) => setState(prev => ({ ...prev, activeProjectId: id }))}
                    onAddProject={handleAddProject}
                    onCloseProject={handleCloseProject}
                    onRenameProject={handleRenameProject}
                    onDuplicateProject={handleDuplicateProject}
                    onMoveProject={handleMoveProject}
                />

                {activeProjectId === SUMMARY_TAB_ID || !activeProject ? (
                    <AllProjectsSummary projects={projects} unitSystem={unitSystem} />
                ) : (
                    <>
                        <FloatingNav isTwoColumnLayout={isTwoColumnLayout} onToggleLayout={toggleLayout} />

                        <div className={`grid gap-6 items-start ${isTwoColumnLayout ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                            {/* Left Column: Settings and Equipment Details */}
                            <div className="space-y-6">
                                <div id="global-settings" className="p-4 bg-white rounded-lg shadow-md">
                                    <h2 className="text-xl font-semibold mb-4">{t('app.configuration')}</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="p-4 bg-slate-50 rounded-lg shadow-inner border border-slate-200 md:col-span-2">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                                <div>
                                                    <h3 className="font-semibold mb-2">{t('app.systemAirflow')}</h3>
                                                    <NumberInputWithControls value={activeProject.airflow} onChange={handleAirflowChange} unitType="airflow" unitSystem={unitSystem} step={10} min={0} />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold mb-2">{t('app.altitude')}</h3>
                                                    <NumberInputWithControls value={activeProject.altitude} onChange={handleAltitudeChange} unitType="altitude" unitSystem={unitSystem} step={100} min={0} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-lg shadow-inner border border-slate-200">
                                            <h3 className="font-semibold mb-2">{t('app.acInletConditions')}</h3>
                                            <div className="space-y-3">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-sm text-slate-700 block">{t('airProperties.temperature')}</label>
                                                    <NumberInputWithControls value={activeProject.acInletAir.temp} onChange={handleAcInletTempChange} unitType="temperature" unitSystem={unitSystem} />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-sm text-slate-700 block">{t('airProperties.rh')}</label>
                                                    <NumberInputWithControls value={activeProject.acInletAir.rh} onChange={handleAcInletRHChange} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                                                </div>
                                                <hr className="my-2 border-slate-300" />
                                                <div className="flex justify-between items-center"><span className="text-sm">{t('airProperties.abs_humidity')}</span><DisplayValueWithUnit value={activeProject.acInletAir.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={acInletAbsHumidityTooltip} /></div>
                                                <div className="flex justify-between items-center"><span className="text-sm">{t('airProperties.enthalpy')}</span><DisplayValueWithUnit value={activeProject.acInletAir.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={acInletEnthalpyTooltip} /></div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-lg shadow-inner border border-slate-200">
                                            <h3 className="font-semibold mb-2">{t('app.acOutletConditions')}</h3>
                                            <div className="space-y-3">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-sm text-slate-700 block">{t('airProperties.temperature')}</label>
                                                    <NumberInputWithControls value={activeProject.acOutletAir.temp} onChange={handleAcOutletTempChange} unitType="temperature" unitSystem={unitSystem} />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-sm text-slate-700 block">{t('airProperties.rh')}</label>
                                                    <NumberInputWithControls value={activeProject.acOutletAir.rh} onChange={handleAcOutletRHChange} unitType="rh" unitSystem={unitSystem} min={0} max={100} />
                                                </div>
                                                <hr className="my-2 border-slate-300" />
                                                <div className="flex justify-between items-center"><span className="text-sm">{t('airProperties.abs_humidity')}</span><DisplayValueWithUnit value={acOutletCalculated.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={acOutletAbsHumidityTooltip}/></div>
                                                <div className="flex justify-between items-center"><span className="text-sm">{t('airProperties.enthalpy')}</span><DisplayValueWithUnit value={acOutletCalculated.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={acOutletEnthalpyTooltip}/></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div id="add-equipment" className="p-4 bg-white rounded-lg shadow-md">
                                    <h2 className="text-xl font-semibold mb-4">{t('app.addEquipment')}</h2>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {equipmentButtons}
                                    </div>
                                    {activeProject.equipmentList.length > 0 && (
                                        <div className="mt-4 text-right">
                                            <button onClick={deleteAllEquipment} className="px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-colors text-sm font-medium">
                                                {t('app.deleteAllEquipment')}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <EquipmentTabs
                                        equipmentList={activeProject.equipmentList}
                                        selectedId={selectedEquipmentId}
                                        onSelect={setSelectedEquipmentId}
                                        onMove={moveEquipment}
                                        onRename={handleRenameEquipment}
                                    />
                                    {selectedEquipment ? (
                                        <>
                                            <AdjacencyInfoPanel equipmentList={activeProject.equipmentList} selectedId={selectedEquipmentId} unitSystem={unitSystem} />
                                            <EquipmentItem
                                                key={selectedEquipment.id}
                                                equipment={selectedEquipment}
                                                index={activeProject.equipmentList.findIndex(e => e.id === selectedEquipment.id)}
                                                totalEquipment={activeProject.equipmentList.length}
                                                airflow={activeProject.airflow}
                                                altitude={activeProject.altitude}
                                                onUpdate={updateEquipment}
                                                onDelete={deleteEquipment}
                                                unitSystem={unitSystem}
                                            />
                                        </>
                                    ) : (
                                        <div className="text-center py-10 text-slate-500 bg-white rounded-lg shadow-md">
                                            {activeProject.equipmentList.length > 0 ? t('app.selectEquipment') : t('app.noEquipmentAdded')}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Chart is shown at the bottom in single-column mode */}
                                {!isTwoColumnLayout && <div>{psychrometricChartSection}</div>}
                            </div>

                            {/* Right Column: Chart (sticky) in two-column mode */}
                            {isTwoColumnLayout && (
                                <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto">
                                    {psychrometricChartSection}
                                </div>
                            )}
                        </div>
                    </>
                )}
                <footer className="mt-8 pt-6 border-t border-slate-300">
                    <details className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <summary className="font-semibold text-slate-800 cursor-pointer">{t('app.disclaimerTitle')}</summary>
                        <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{disclaimerContent}</p>
                    </details>
                </footer>
            </div>
        </div>
    );
};

export default App;