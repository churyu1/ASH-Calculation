
import { UnitSystem, UnitType } from '../types';

// Constants for unit conversions
const UNIT_CONVERSIONS = {
    // Conversion from SI base unit to Imperial unit
    toImperial: {
        airflow: (m3min: number) => m3min * 35.3147, // m³/min to CFM
        temperature: (c: number) => (c * 9/5) + 32, // Celsius to Fahrenheit
        length: (mm: number) => mm * 0.0393701, // mm to inches
        pressure: (pa: number) => pa * 0.00401463, // Pa to in.w.g.
        heat_load: (kcalh: number) => kcalh * 3.96832, // kcal/h to BTU/h
        water_flow: (lpm: number) => lpm * 0.264172, // L/min to GPM
        abs_humidity: (gkgDA: number) => gkgDA * 7, // g/kg(DA) to grains/lb(DA) (approx)
        enthalpy: (kjkgDA: number) => kjkgDA * 0.429923, // kJ/kg(DA) to BTU/lb(DA)
        motor_power: (kw: number) => kw * 1.34102, // kW to HP
        velocity: (ms: number) => ms * 3.28084, // m/s to ft/s
        airflow_per_sheet: (m3min_per_sheet: number) => m3min_per_sheet * 35.3147, // m³/min/枚 to CFM/sheet
        area: (m2: number) => m2 * 10.7639, // m² to ft²
        density: (kg_m3: number) => kg_m3 * 0.062428, // kg/m³ to lb/ft³
    },
    // Conversion from Imperial unit to SI base unit
    toSI: {
        airflow: (cfm: number) => cfm / 35.3147, // CFM to m³/min
        temperature: (f: number) => (f - 32) * 5/9, // Fahrenheit to Celsius
        length: (inch: number) => inch / 0.0393701, // inches to mm
        pressure: (inwg: number) => inwg / 0.00401463, // in.w.g. to Pa
        heat_load: (btuh: number) => btuh / 3.96832, // BTU/h to kcal/h
        water_flow: (gpm: number) => gpm / 0.264172, // GPM to L/min
        abs_humidity: (grains_lbDA: number) => grains_lbDA / 7, // grains/lb(DA) to g/kg(DA) (approx)
        enthalpy: (btu_lbDA: number) => btu_lbDA / 0.429923, // BTU/lb(DA) to kJ/kg(DA)
        motor_power: (hp: number) => hp / 1.34102, // HP to kW
        velocity: (fts: number) => fts / 3.28084, // ft/s to m/s
        airflow_per_sheet: (cfm_per_sheet: number) => cfm_per_sheet / 35.3147, // CFM/sheet to m³/min/枚
        area: (ft2: number) => ft2 / 10.7639, // ft² to m²
        density: (lb_ft3: number) => lb_ft3 / 0.062428, // lb/ft³ to kg/m³
    },
};

export const convertValue = (value: number | null, unitType: UnitType, fromSystem: UnitSystem, toSystem: UnitSystem): number | null => {
    if (value === null || isNaN(value) || fromSystem === toSystem) return value;

    if (fromSystem === UnitSystem.SI && toSystem === UnitSystem.IMPERIAL) {
        const convertFn = UNIT_CONVERSIONS.toImperial[unitType as keyof typeof UNIT_CONVERSIONS.toImperial];
        if (typeof convertFn === 'function') {
            return convertFn(value);
        }
    } else if (fromSystem === UnitSystem.IMPERIAL && toSystem === UnitSystem.SI) {
        const convertFn = UNIT_CONVERSIONS.toSI[unitType as keyof typeof UNIT_CONVERSIONS.toSI];
        if (typeof convertFn === 'function') {
            return convertFn(value);
        }
    }
    return value;
};

export const getPrecisionForUnitType = (unitType: UnitType, unitSystem: UnitSystem): number => {
    if (unitSystem === UnitSystem.IMPERIAL) {
        switch (unitType) {
            case 'temperature': return 1;
            case 'length': return 3;
            case 'airflow': return 0;
            case 'pressure': return 2;
            case 'heat_load': return 0;
            case 'water_flow': return 2;
            case 'abs_humidity': return 2;
            case 'enthalpy': return 2;
            case 'motor_power': return 1;
            case 'velocity': return 2;
            case 'airflow_per_sheet': return 0;
            case 'area': return 2;
            case 'density': return 4;
            default: return 2;
        }
    } else { // SI system
        switch (unitType) {
            case 'temperature': return 1;
            case 'length': return 0;
            case 'airflow': return 0;
            case 'pressure': return 0;
            case 'heat_load': return 0;
            case 'water_flow': return 2;
            case 'abs_humidity': return 2;
            case 'enthalpy': return 2;
            case 'motor_power': return 1;
            case 'velocity': return 2;
            case 'shf': return 2;
            case 'efficiency': return 0;
            case 'k_value': return 2;
            case 'airflow_per_sheet': return 0;
            case 'area': return 2;
            case 'density': return 4;
            default: return 2;
        }
    }
};

export const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(num)) return '';
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

export const formatNumberForInput = (num: number, unitType: UnitType, unitSystem: UnitSystem): string => {
    if (isNaN(num)) return '';
    const precision = getPrecisionForUnitType(unitType, unitSystem);
    return parseFloat(num.toFixed(precision)).toString();
};