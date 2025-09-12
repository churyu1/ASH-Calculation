import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
    Equipment, UnitSystem, EquipmentType, AirProperties, 
    CoolingCoilConditions, HeatingCoilConditions, FanConditions, 
    DamperConditions, FilterConditions, BurnerConditions, 
    EliminatorConditions, SprayWasherConditions, SteamHumidifierConditions, CustomConditions,
    SteamPressureUnit, Project
} from './types';
import { EQUIPMENT_COLORS } from './constants.ts';
import { calculateAirProperties, calculatePsat } from './services/psychrometrics.ts';
import { useLanguage, enMessages, get } from './i18n/index.ts';
import EquipmentItem from './components/EquipmentItem.tsx';
import NumberInputWithControls from './components/NumberInputWithControls.tsx';
import DisplayValueWithUnit from './components/DisplayValueWithUnit.tsx';
import PsychrometricChart from './components/PsychrometricChart.tsx';
import Summary from './components/Summary.tsx';
import FloatingNav from './components/FloatingNav.tsx';
import FormulaTooltipContent from './components/FormulaTooltipContent.tsx';
import { convertValue } from './utils/conversions.ts';
import ChartDataSummary from './components/ChartDataSummary.tsx';
import ProjectTabs from './components/ProjectTabs.tsx';
import AllProjectsSummary from './components/AllProjectsSummary.tsx';

const getInitialEquipment = (): Equipment[] => {
    const equipmentSetups = [
        { type: EquipmentType.FILTER }, { type: EquipmentType.BURNER },
        { type: EquipmentType.COOLING_COIL, inlet: { temp: 25, rh: 80 } },
        { type: EquipmentType.HEATING_COIL, inlet: { temp: 15, rh: 60 } },
        { type: EquipmentType.ELIMINATOR }, { type: EquipmentType.SPRAY_WASHER, inlet: { temp: 55.2, rh: 4.58 } },
        { type: EquipmentType.STEAM_HUMIDIFIER, inlet: { temp: 30, rh: 30 } },
        { type: EquipmentType.FAN, inlet: { temp: 25, rh: 60 } }, { type: EquipmentType.DAMPER },
    ];
    const acInletAir = calculateAirProperties(0, 50);
    const result = equipmentSetups.reduce<{ list: Equipment[], lastOutlet: AirProperties }>((acc, setup, index) => {
        const { type, inlet: specificInletConfig } = setup;
        const inletAir = specificInletConfig ? calculateAirProperties(specificInletConfig.temp, specificInletConfig.rh) : acc.lastOutlet;
        const inletIsLocked = !!specificInletConfig;
        const defaultName = get(enMessages, `equipmentNames.${type}`) || type;
        let newEquipment: Equipment = {
            id: index, type, name: defaultName, pressureLoss: 50, inletAir: { ...inletAir },
            outletAir: { ...inletAir }, conditions: {}, results: {}, color: EQUIPMENT_COLORS[type], inletIsLocked: inletIsLocked,
        };
        switch (type) {
            case EquipmentType.FILTER: (newEquipment.conditions as FilterConditions) = { width: 500, height: 500, thickness: 50, sheets: 1 }; break;
            case EquipmentType.BURNER: newEquipment.outletAir = calculateAirProperties(55.2, null, newEquipment.inletAir.absHumidity); (newEquipment.conditions as BurnerConditions) = { shf: 0.9 }; break;
            case EquipmentType.COOLING_COIL: newEquipment.outletAir = calculateAirProperties(15, 100); (newEquipment.conditions as CoolingCoilConditions) = { chilledWaterInletTemp: 7, chilledWaterOutletTemp: 14, heatExchangeEfficiency: 85 }; break;
            case EquipmentType.HEATING_COIL: newEquipment.outletAir = calculateAirProperties(30, null, newEquipment.inletAir.absHumidity); (newEquipment.conditions as HeatingCoilConditions) = { hotWaterInletTemp: 80, hotWaterOutletTemp: 50, heatExchangeEfficiency: 85 }; break;
            case EquipmentType.ELIMINATOR: (newEquipment.conditions as EliminatorConditions) = { eliminatorType: '3-fold' }; break;
            case EquipmentType.SPRAY_WASHER: newEquipment.outletAir = calculateAirProperties(25, 70); (newEquipment.conditions as SprayWasherConditions) = { waterToAirRatio: 0.8 }; break;
            case EquipmentType.STEAM_HUMIDIFIER: newEquipment.outletAir = { temp: null, rh: 40, absHumidity: null, enthalpy: null, density: null }; (newEquipment.conditions as SteamHumidifierConditions) = { steamGaugePressure: 100, steamGaugePressureUnit: SteamPressureUnit.KPAG }; break;
            case EquipmentType.FAN: (newEquipment.conditions as FanConditions) = { motorOutput: 0.2, motorEfficiency: 80 }; break;
            case EquipmentType.DAMPER: newEquipment.pressureLoss = 0; (newEquipment.conditions as DamperConditions) = { width: 500, height: 500, lossCoefficientK: 1.0 }; break;
            case EquipmentType.CUSTOM: (newEquipment.conditions as CustomConditions) = {}; break;
        }
        acc.list.push(newEquipment); acc.lastOutlet = newEquipment.outletAir; return acc;
    }, { list: [], lastOutlet: acInletAir });
    return result.list;
};

const createNewProject = (id: string, name: string): Project => ({
    id,
    name,
    airflow: 100,
    equipmentList: [],
    acInletAir: calculateAirProperties(0, 50),
    acOutletAir: calculateAirProperties(27, 70),
});

const SUMMARY_TAB_ID = 'summary-tab';

interface AppState {
    projects: Project[];
    activeProjectId: string;
}

const App: React.FC = () => {
    const { t, locale, setLocale } = useLanguage();
    const [unitSystem, setUnitSystem] = useState<UnitSystem>(UnitSystem.SI);
    
    const [state, setState] = useState<AppState>(() => {
        const firstProjectId = `proj-${Date.now()}`;
        const initialProjects = [{
            id: firstProjectId,
            name: `ASH 1`,
            airflow: 100,
            equipmentList: getInitialEquipment(),
            acInletAir: calculateAirProperties(0, 50),
            acOutletAir: calculateAirProperties(27, 70),
        }];
        return {
            projects: initialProjects,
            activeProjectId: firstProjectId
        };
    });
    
    const { projects, activeProjectId } = state;
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isTwoColumnLayout, setIsTwoColumnLayout] = useState(false);

    const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);
    
    const updateActiveProject = useCallback((updates: Partial<Omit<Project, 'id' | 'name'>>) => {
        setState(prevState => {
            if (!prevState.activeProjectId || prevState.activeProjectId === SUMMARY_TAB_ID) return prevState;
            return {
                ...prevState,
                projects: prevState.projects.map(p =>
                    p.id === prevState.activeProjectId ? { ...p, ...updates } : p
                )
            };
        });
    }, []);

    const toggleLayout = () => setIsTwoColumnLayout(prev => !prev);

    const handleExport = () => {
        const dataToSave = {
            version: '2.0.0',
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
                if (data.version === '2.0.0' && data.projects && data.activeProjectId && data.unitSystem) {
                    setState({ projects: data.projects, activeProjectId: data.activeProjectId });
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

    const addEquipment = (type: EquipmentType) => {
        if (!activeProject) return;
        const { equipmentList, acInletAir } = activeProject;
        const newId = equipmentList.reduce((maxId, eq) => Math.max(eq.id, maxId), -1) + 1;
        const defaultInlet = equipmentList.length > 0 ? (equipmentList[equipmentList.length - 1].outletAir) : { ...acInletAir };
        const defaultName = get(enMessages, `equipmentNames.${type}`) || type;
        let newEquipment: Equipment = {
            id: newId, type, name: defaultName, pressureLoss: 50, inletAir: defaultInlet, outletAir: { ...defaultInlet },
            conditions: {}, results: {}, color: EQUIPMENT_COLORS[type], inletIsLocked: false,
        };
        // Set type-specific defaults
        switch (type) {
             case EquipmentType.FILTER: (newEquipment.conditions as FilterConditions) = { width: 500, height: 500, thickness: 50, sheets: 1 }; break;
             case EquipmentType.BURNER: newEquipment.outletAir = calculateAirProperties(55.2, null, defaultInlet.absHumidity); (newEquipment.conditions as BurnerConditions) = { shf: 0.9 }; break;
             case EquipmentType.COOLING_COIL: newEquipment.outletAir = calculateAirProperties(15, 95); (newEquipment.conditions as CoolingCoilConditions) = { chilledWaterInletTemp: 7, chilledWaterOutletTemp: 14, heatExchangeEfficiency: 85 }; break;
             case EquipmentType.HEATING_COIL: newEquipment.outletAir = calculateAirProperties(40, 30); (newEquipment.conditions as HeatingCoilConditions) = { hotWaterInletTemp: 80, hotWaterOutletTemp: 50, heatExchangeEfficiency: 85 }; break;
             case EquipmentType.ELIMINATOR: (newEquipment.conditions as EliminatorConditions) = { eliminatorType: '3-fold' }; break;
             case EquipmentType.SPRAY_WASHER: newEquipment.outletAir = calculateAirProperties(25, 70); (newEquipment.conditions as SprayWasherConditions) = { waterToAirRatio: 0.8 }; break;
             case EquipmentType.STEAM_HUMIDIFIER: newEquipment.outletAir = { temp: null, rh: 40, absHumidity: null, enthalpy: null, density: null }; (newEquipment.conditions as SteamHumidifierConditions) = { steamGaugePressure: 100, steamGaugePressureUnit: SteamPressureUnit.KPAG, }; break;
             case EquipmentType.FAN: (newEquipment.conditions as FanConditions) = { motorOutput: 0.2, motorEfficiency: 80 }; break;
             case EquipmentType.DAMPER: newEquipment.pressureLoss = 0; (newEquipment.conditions as DamperConditions) = { width: 500, height: 500, lossCoefficientK: 1.0 }; break;
             case EquipmentType.CUSTOM: (newEquipment.conditions as CustomConditions) = {}; break;
        }
        updateActiveProject({ equipmentList: [...equipmentList, newEquipment] });
    };

    const updateEquipment = useCallback((id: number, updatedEquipment: Equipment) => {
        if (!activeProject) return;
        const { equipmentList } = activeProject;
        const index = equipmentList.findIndex(eq => eq.id === id);
        if (index === -1) return;
        const newList = [...equipmentList];
        const oldOutletAir = newList[index].outletAir;
        newList[index] = updatedEquipment;
        if (JSON.stringify(oldOutletAir) !== JSON.stringify(updatedEquipment.outletAir)) {
            if (index + 1 < newList.length && !newList[index + 1].inletIsLocked) {
                const nextEq = newList[index + 1];
                newList[index + 1] = { ...nextEq, inletAir: { ...updatedEquipment.outletAir } };
            }
        }
        updateActiveProject({ equipmentList: newList });
    }, [activeProject, updateActiveProject]);
    
    const handleChartUpdate = useCallback((id: number, updates: { inlet?: AirProperties, outlet?: AirProperties }) => {
        if (!activeProject) return;
        const { equipmentList } = activeProject;
        const index = equipmentList.findIndex(eq => eq.id === id);
        if (index === -1) return;
        const newList = [...equipmentList];
        const originalEquipment = newList[index];
        const updatedEquipment = { ...originalEquipment };
        if (updates.inlet) { updatedEquipment.inletAir = updates.inlet; updatedEquipment.inletIsLocked = true; }
        if (updates.outlet) {
            if (updatedEquipment.type === EquipmentType.COOLING_COIL && updates.outlet.temp !== null && updatedEquipment.inletAir.temp !== null && updates.outlet.temp > updatedEquipment.inletAir.temp) { updates.outlet.temp = updatedEquipment.inletAir.temp; }
            if ((updatedEquipment.type === EquipmentType.HEATING_COIL || updatedEquipment.type === EquipmentType.BURNER) && updates.outlet.temp !== null && updatedEquipment.inletAir.temp !== null && updates.outlet.temp < updatedEquipment.inletAir.temp) { updates.outlet.temp = updatedEquipment.inletAir.temp; }
            updatedEquipment.outletAir = updates.outlet;
        }
        const oldOutletAir = originalEquipment.outletAir;
        newList[index] = updatedEquipment;
        if (updates.outlet && JSON.stringify(oldOutletAir) !== JSON.stringify(updates.outlet)) {
            if (index + 1 < newList.length && !newList[index + 1].inletIsLocked) { newList[index + 1] = { ...newList[index + 1], inletAir: { ...updates.outlet } }; }
        }
        updateActiveProject({ equipmentList: newList });
    }, [activeProject, updateActiveProject]);

    const deleteEquipment = (id: number) => {
        if (!activeProject) return;
        updateActiveProject({ equipmentList: activeProject.equipmentList.filter(eq => eq.id !== id) });
    };
    const deleteAllEquipment = () => {
        if (!activeProject) return;
        updateActiveProject({ equipmentList: [] });
    };

    const moveEquipment = (id: number, direction: 'up' | 'down') => {
        if (!activeProject) return;
        const { equipmentList } = activeProject;
        const index = equipmentList.findIndex(eq => eq.id === id);
        if (index === -1) return;
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= equipmentList.length) return;
        const newList = [...equipmentList];
        const [movedItem] = newList.splice(index, 1);
        newList.splice(newIndex, 0, movedItem);
        updateActiveProject({ equipmentList: newList });
    };
    
    const reflectUpstreamConditions = useCallback((id: number, currentIndex: number) => {
        if (!activeProject) return;
        const { equipmentList, acInletAir } = activeProject;
        let sourceAir: AirProperties | undefined = undefined;
        for (let i = currentIndex - 1; i >= 0; i--) {
            const upstreamEq = equipmentList[i];
            const isPassThrough = [EquipmentType.FILTER, EquipmentType.ELIMINATOR, EquipmentType.DAMPER, EquipmentType.CUSTOM].includes(upstreamEq.type);
            if (!isPassThrough) { if (upstreamEq.outletAir && upstreamEq.outletAir.temp !== null) { sourceAir = upstreamEq.outletAir; } break; }
        }
        if (sourceAir === undefined) { sourceAir = acInletAir; }
        const newList = [...equipmentList];
        const targetEqIndex = newList.findIndex(eq => eq.id === id);
        if (targetEqIndex === -1 || !sourceAir) return;
        const currentEq = newList[targetEqIndex];
        let updatedEq: Equipment = { ...currentEq, inletAir: { ...sourceAir }, inletIsLocked: false };
        const calculatedOutletTypes = [EquipmentType.FAN, EquipmentType.FILTER, EquipmentType.DAMPER, EquipmentType.ELIMINATOR, EquipmentType.CUSTOM];
        if (calculatedOutletTypes.includes(currentEq.type)) { updatedEq.outletAir = { ...sourceAir }; } 
        else if (currentEq.type === EquipmentType.SPRAY_WASHER || currentEq.type === EquipmentType.STEAM_HUMIDIFIER) { updatedEq.outletAir = { temp: null, rh: currentEq.outletAir.rh, absHumidity: null, enthalpy: null, density: null }; }
        newList[targetEqIndex] = updatedEq;
        updateActiveProject({ equipmentList: newList });
    }, [activeProject, updateActiveProject]);

    const reflectDownstreamConditions = useCallback((id: number, currentIndex: number) => {
        if (!activeProject) return;
        const { equipmentList, acOutletAir } = activeProject;
        let sourceAir: AirProperties | null = null;
        if (currentIndex === equipmentList.length - 1) { sourceAir = acOutletAir; } 
        else { const nextEq = equipmentList[currentIndex + 1]; if (nextEq?.inletAir) { sourceAir = nextEq.inletAir; } }
        if (sourceAir === null) return;
        const finalSourceAir = sourceAir;
        const newList = equipmentList.map(eq => {
            if (eq.id === id) {
                let newOutletAir = { ...eq.outletAir };
                if (eq.type === EquipmentType.SPRAY_WASHER || eq.type === EquipmentType.STEAM_HUMIDIFIER) {
                    if (finalSourceAir.rh !== null) { newOutletAir.rh = finalSourceAir.rh; }
                } else {
                    if (finalSourceAir.temp !== null) { newOutletAir.temp = finalSourceAir.temp; }
                }
                return { ...eq, outletAir: newOutletAir };
            }
            return eq;
        });
        updateActiveProject({ equipmentList: newList });
    }, [activeProject, updateActiveProject]);

    const handleAcInletTempChange = (value: number | null) => { if (activeProject) updateActiveProject({ acInletAir: calculateAirProperties(value, activeProject.acInletAir.rh) })};
    const handleAcInletRHChange = (value: number | null) => { if (activeProject) updateActiveProject({ acInletAir: calculateAirProperties(activeProject.acInletAir.temp, value) })};
    const handleAcOutletTempChange = (value: number | null) => { if (activeProject) updateActiveProject({ acOutletAir: calculateAirProperties(value, activeProject.acOutletAir.rh) })};
    const handleAcOutletRHChange = (value: number | null) => { if (activeProject) updateActiveProject({ acOutletAir: calculateAirProperties(activeProject.acOutletAir.temp, value) })};
    
    const equipmentForChart = useMemo(() => activeProject?.equipmentList.filter(eq =>
        ![EquipmentType.FILTER, EquipmentType.ELIMINATOR, EquipmentType.DAMPER, EquipmentType.CUSTOM].includes(eq.type) &&
        eq.inletAir.temp !== null && eq.outletAir.temp !== null
    ) || [], [activeProject]);
    
    const totalPressureLoss = useMemo(() => activeProject?.equipmentList.reduce((sum, eq) => sum + (eq.pressureLoss || 0), 0) || 0, [activeProject]);
    
    const equipmentButtons = Object.values(EquipmentType).map(type => (
        <button key={type} onClick={() => addEquipment(type)} className="px-4 py-3 text-white rounded-md shadow-md transition-colors text-center font-medium bg-blue-600 hover:bg-blue-700">
            {t(`equipmentNames.${type}`)}
        </button>
    ));

    const acInletAbsHumidityTooltip = useMemo(() => {
        if (!activeProject || activeProject.acInletAir.temp === null || activeProject.acInletAir.rh === null) return null;
        const { temp, rh } = activeProject.acInletAir;
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh', title = t(`${formulaPath}.title`), formula = t(`${formulaPath}.${unitSystem}.formula`), legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};
        if (unitSystem === UnitSystem.IMPERIAL) { const P_sat = calculatePsat(temp), P_v = P_sat * (rh / 100); values = { 't_f': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' }, 'rh': { value: rh, unit: '%' }, 'P_v': { value: P_v, unit: 'Pa' } }; } 
        else { const P_sat = calculatePsat(temp), P_v = P_sat * (rh / 100); values = { 't': { value: temp, unit: '°C' }, 'rh': { value: rh, unit: '%' }, 'P_sat': { value: P_sat, unit: 'Pa' }, 'P_v': { value: P_v, unit: 'Pa' } }; }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [activeProject?.acInletAir, locale, unitSystem, t]);

    const acInletEnthalpyTooltip = useMemo(() => {
        if (!activeProject) return null;
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX', title = t(`${formulaPath}.title`), formula = t(`${formulaPath}.${unitSystem}.formula`), legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};
        if (unitSystem === UnitSystem.IMPERIAL) { values = { 't': { value: convertValue(activeProject.acInletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' }, 'x': { value: convertValue(activeProject.acInletAir.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' } }; }
        else { values = { 't': { value: activeProject.acInletAir.temp, unit: '°C' }, 'x': { value: activeProject.acInletAir.absHumidity, unit: 'g/kg(DA)' } }; }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [activeProject?.acInletAir, locale, unitSystem, t]);
    
    const acOutletCalculated = useMemo(() => calculateAirProperties(activeProject?.acOutletAir.temp ?? null, activeProject?.acOutletAir.rh ?? null), [activeProject?.acOutletAir]);

    const acOutletAbsHumidityTooltip = useMemo(() => {
        if (!activeProject || activeProject.acOutletAir.temp === null || activeProject.acOutletAir.rh === null) return null;
        const { temp, rh } = activeProject.acOutletAir;
        const formulaPath = 'tooltips.airProperties.absHumidityFromTRh', title = t(`${formulaPath}.title`), formula = t(`${formulaPath}.${unitSystem}.formula`), legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};
        if (unitSystem === UnitSystem.IMPERIAL) { const P_sat = calculatePsat(temp), P_v = P_sat * (rh / 100); values = { 't_f': { value: convertValue(temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' }, 'rh': { value: rh, unit: '%' }, 'P_v': { value: P_v, unit: 'Pa' } }; }
        else { const P_sat = calculatePsat(temp), P_v = P_sat * (rh / 100); values = { 't': { value: temp, unit: '°C' }, 'rh': { value: rh, unit: '%' }, 'P_sat': { value: P_sat, unit: 'Pa' }, 'P_v': { value: P_v, unit: 'Pa' } }; }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [activeProject?.acOutletAir, locale, unitSystem, t]);

    const acOutletEnthalpyTooltip = useMemo(() => {
        if (!activeProject) return null;
        const formulaPath = 'tooltips.airProperties.enthalpyFromTX', title = t(`${formulaPath}.title`), formula = t(`${formulaPath}.${unitSystem}.formula`), legend = t(`${formulaPath}.${unitSystem}.legend`);
        let values: Record<string, { value: number | null | undefined; unit: string; }> = {};
        if (unitSystem === UnitSystem.IMPERIAL) { values = { 't': { value: convertValue(activeProject.acOutletAir.temp, 'temperature', UnitSystem.SI, UnitSystem.IMPERIAL), unit: '°F' }, 'x': { value: convertValue(acOutletCalculated.absHumidity, 'abs_humidity', UnitSystem.SI, UnitSystem.IMPERIAL), unit: 'gr/lb' } }; }
        else { values = { 't': { value: activeProject.acOutletAir.temp, unit: '°C' }, 'x': { value: acOutletCalculated.absHumidity, unit: 'g/kg(DA)' } }; }
        return <FormulaTooltipContent title={title} formula={formula} legend={legend} values={values} />;
    }, [activeProject?.acOutletAir, acOutletCalculated.absHumidity, locale, unitSystem, t]);

    const psychrometricChartSection = activeProject && (
        <div id="psychrometric-chart" className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">{t('app.psychrometricChart')}</h2>
             {isTwoColumnLayout && (
                <ChartDataSummary
                    equipmentList={equipmentForChart}
                    globalInletAir={activeProject.acInletAir}
                    globalOutletAir={acOutletCalculated}
                    unitSystem={unitSystem}
                />
            )}
            <PsychrometricChart 
                airConditionsData={equipmentForChart} 
                globalInletAir={activeProject.acInletAir}
                globalOutletAir={acOutletCalculated}
                unitSystem={unitSystem}
                isSplitViewActive={isTwoColumnLayout}
                onUpdate={handleChartUpdate}
            />
        </div>
    );

    const disclaimerContent = t('app.disclaimerContent');

    return (
        <div className="min-h-screen p-4 font-sans text-slate-800 bg-slate-100">
            <div className="max-w-7xl mx-auto p-6 rounded-lg shadow-xl bg-slate-50">
                <header className="mb-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <h1 className="text-3xl font-bold text-slate-900">{t('app.title')}</h1>
                         <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={triggerFileSelect} className="flex-1 px-3 py-1.5 bg-green-500 text-white rounded-md shadow-sm hover:bg-green-600 transition-colors text-xs font-medium flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                {t('app.importConfig')}
                            </button>
                            <button onClick={handleExport} className="flex-1 px-3 py-1.5 bg-indigo-600 text-white rounded-md shadow-sm hover:bg-indigo-700 transition-colors text-xs font-medium flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.293a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
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
                                <div><input type="radio" id="lang-ja" name="language" value="ja" checked={locale === 'ja'} onChange={e => setLocale(e.target.value)} className="sr-only" aria-labelledby="lang-ja-label"/><label id="lang-ja-label" htmlFor="lang-ja" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ locale === 'ja' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50' }`}>日本語</label></div>
                                <div><input type="radio" id="lang-en" name="language" value="en" checked={locale === 'en'} onChange={e => setLocale(e.target.value)} className="sr-only" aria-labelledby="lang-en-label"/><label id="lang-en-label" htmlFor="lang-en" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ locale === 'en' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50' }`}>English</label></div>
                            </div>
                        </fieldset>
                        <fieldset><legend className="block text-lg font-semibold mb-2">{t('app.unitSystem')}</legend>
                            <div className="flex flex-wrap gap-2">
                                <div><input type="radio" id="unit-si" name="unitSystem" value={UnitSystem.SI} checked={unitSystem === UnitSystem.SI} onChange={e => setUnitSystem(e.target.value as UnitSystem)} className="sr-only" aria-labelledby="unit-si-label"/><label id="unit-si-label" htmlFor="unit-si" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ unitSystem === UnitSystem.SI ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50' }`}>{t('app.siUnits')}</label></div>
                                <div><input type="radio" id="unit-imperial" name="unitSystem" value={UnitSystem.IMPERIAL} checked={unitSystem === UnitSystem.IMPERIAL} onChange={e => setUnitSystem(e.target.value as UnitSystem)} className="sr-only" aria-labelledby="unit-imperial-label"/><label id="unit-imperial-label" htmlFor="unit-imperial" className={`cursor-pointer rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${ unitSystem === UnitSystem.IMPERIAL ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50' }`}>{t('app.imperialUnits')}</label></div>
                            </div>
                        </fieldset>
                    </div>
                </div>

                <ProjectTabs 
                    projects={projects}
                    activeProjectId={activeProjectId}
                    onSelectProject={(id: string) => setState(prev => ({...prev, activeProjectId: id}))}
                    onAddProject={handleAddProject}
                    onCloseProject={handleCloseProject}
                    onRenameProject={handleRenameProject}
                    onDuplicateProject={handleDuplicateProject}
                    onMoveProject={handleMoveProject}
                />

                {activeProjectId === SUMMARY_TAB_ID ? (
                    <AllProjectsSummary projects={projects} unitSystem={unitSystem} />
                ) : !activeProject ? (
                    <div className="text-center py-10 text-slate-500">{t('app.noEquipmentAdded')}</div>
                ) : (
                <div className={`lg:grid lg:gap-6 transition-all duration-500 ease-in-out ${isTwoColumnLayout ? 'lg:grid-cols-5' : 'lg:grid-cols-1'}`}>
                    <div className={`space-y-6 ${isTwoColumnLayout ? 'lg:col-span-3' : 'lg:col-span-1'}`}>
                        <div className="grid grid-cols-1 gap-6">
                            <div className="p-4 bg-white rounded-lg shadow-md">
                                <h2 className="text-lg font-semibold mb-2">{t('app.systemAirflow')}</h2>
                                <div className="flex justify-start">
                                    <NumberInputWithControls value={activeProject.airflow} onChange={(val) => updateActiveProject({ airflow: val })} unitType="airflow" unitSystem={unitSystem} />
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div id="ac-inlet-conditions">
                                <h2 className="text-xl font-semibold mb-4">{t('app.acInletConditions')}</h2>
                                <div className="p-4 bg-white rounded-lg shadow-md grid grid-cols-1 gap-4">
                                    <div className="p-4 bg-slate-100 rounded-lg">
                                        <h3 className="font-semibold mb-2">{t('equipment.inletAir')}</h3>
                                        <div className="flex justify-between items-center py-1"><span className="text-sm">{t('airProperties.temperature')}</span><NumberInputWithControls value={activeProject.acInletAir.temp} onChange={handleAcInletTempChange} unitType="temperature" unitSystem={unitSystem} /></div>
                                        <div className="flex justify-between items-center py-1"><span className="text-sm">{t('airProperties.rh')}</span><NumberInputWithControls value={activeProject.acInletAir.rh} onChange={handleAcInletRHChange} unitType="rh" unitSystem={unitSystem} min={0} max={100} /></div>
                                    </div>
                                    <div className="p-4 bg-slate-100 rounded-lg">
                                        <h3 className="font-semibold mb-2">{t('equipment.results')}</h3>
                                        <div className="flex justify-between items-center py-1"><span className="text-sm">{t('airProperties.abs_humidity')}</span><DisplayValueWithUnit value={activeProject.acInletAir.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={acInletAbsHumidityTooltip} /></div>
                                        <div className="flex justify-between items-center py-1"><span className="text-sm">{t('airProperties.enthalpy')}</span><DisplayValueWithUnit value={activeProject.acInletAir.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={acInletEnthalpyTooltip} /></div>
                                    </div>
                                </div>
                            </div>
                            <div id="ac-outlet-conditions">
                                <h2 className="text-xl font-semibold mb-4">{t('app.acOutletConditions')}</h2>
                                <div className="p-4 bg-white rounded-lg shadow-md grid grid-cols-1 gap-4">
                                    <div className="p-4 bg-slate-100 rounded-lg">
                                        <h3 className="font-semibold mb-2">{t('equipment.outletAir')}</h3>
                                        <div className="flex justify-between items-center py-1"><span className="text-sm">{t('airProperties.temperature')}</span><NumberInputWithControls value={activeProject.acOutletAir.temp} onChange={handleAcOutletTempChange} unitType="temperature" unitSystem={unitSystem} /></div>
                                        <div className="flex justify-between items-center py-1"><span className="text-sm">{t('airProperties.rh')}</span><NumberInputWithControls value={activeProject.acOutletAir.rh} onChange={handleAcOutletRHChange} unitType="rh" unitSystem={unitSystem} min={0} max={100} /></div>
                                    </div>
                                    <div className="p-4 bg-slate-100 rounded-lg">
                                        <h3 className="font-semibold mb-2">{t('equipment.results')}</h3>
                                        <div className="flex justify-between items-center py-1"><span className="text-sm">{t('airProperties.abs_humidity')}</span><DisplayValueWithUnit value={acOutletCalculated.absHumidity} unitType="abs_humidity" unitSystem={unitSystem} tooltipContent={acOutletAbsHumidityTooltip} /></div>
                                        <div className="flex justify-between items-center py-1"><span className="text-sm">{t('airProperties.enthalpy')}</span><DisplayValueWithUnit value={acOutletCalculated.enthalpy} unitType="enthalpy" unitSystem={unitSystem} tooltipContent={acOutletEnthalpyTooltip} /></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {!isTwoColumnLayout && (<div className="space-y-6">{psychrometricChartSection}</div>)}
                        <div>
                            <Summary
                                equipmentList={activeProject.equipmentList}
                                totalPressureLoss={totalPressureLoss}
                                unitSystem={unitSystem}
                                acInletAir={activeProject.acInletAir}
                                acOutletAir={acOutletCalculated}
                            />
                        </div>
                        <div id="add-equipment-section">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold">{t('app.addEquipment')}</h2>
                                {activeProject.equipmentList.length > 0 && (<button onClick={deleteAllEquipment} className="px-4 py-2 bg-red-600 text-white rounded-md shadow-sm hover:bg-red-700 transition-colors text-sm font-medium">{t('app.deleteAllEquipment')}</button>)}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">{equipmentButtons}</div>
                        </div>
                        <div className="space-y-6">
                            {activeProject.equipmentList.map((eq, index) => (
                                <EquipmentItem key={eq.id} equipment={eq} index={index} totalEquipment={activeProject.equipmentList.length} airflow={activeProject.airflow} onUpdate={updateEquipment} onDelete={deleteEquipment} onMove={moveEquipment} onReflectUpstream={reflectUpstreamConditions} onReflectDownstream={reflectDownstreamConditions} unitSystem={unitSystem} />
                            ))}
                        </div>
                    </div>
                    {isTwoColumnLayout && (<div className="lg:col-span-2 space-y-6 hidden lg:block"><div className="sticky top-6 space-y-6">{psychrometricChartSection}</div></div>)}
                </div>
                )}
                <footer className="mt-12 pt-6 border-t border-slate-200 text-slate-500 text-xs text-left">
                    <h3 className="font-semibold text-sm text-slate-600 mb-2 text-center">{t('app.disclaimerTitle')}</h3>
                    <ol className="list-decimal list-inside space-y-2">
                         {Array.isArray(disclaimerContent) && disclaimerContent.map((item, index) => (
                            <li key={index}>{item}</li>
                        ))}
                    </ol>
                </footer>
            </div>
            <FloatingNav isTwoColumnLayout={isTwoColumnLayout} onToggleLayout={toggleLayout} />
        </div>
    );
};
export default App;