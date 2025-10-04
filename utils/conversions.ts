

import { UnitSystem, UnitType, SteamPressureUnit } from '../types';
import { MOTOR_OUTPUT_CONVERSIONS } from '../constants.ts';

// Constants for unit conversions
const UNIT_CONVERSIONS = {
    // Conversion from SI base unit to Imperial unit
    toImperial: {
        airflow: (m3min: number) => m3min * 35.3147, // m³/min to CFM
        temperature: (c: number) => (c * 9/5) + 32, // Celsius to Fahrenheit
        temperature_delta: (c: number) => c * 9/5,
        length: (mm: number) => mm * 0.0393701, // mm to inches
        pressure: (pa: number) => pa * 0.00401463, // Pa to in.w.g.
        heat_load: (kw: number) => kw * 3412.142, // kW to BTU/h
        water_flow: (lpm: number) => lpm * 0.264172, // L/min to GPM
        abs_humidity: (gkgDA: number) => gkgDA * 7, // g/kg(DA) to grains/lb(DA) (approx)
        enthalpy: (kjkgDA: number) => kjkgDA * 0.429923, // kJ/kg(DA) to BTU/lb(DA)
        motor_power: (kw: number) => kw * 1.34102, // kW to HP
        velocity: (ms: number) => ms * 3.28084 * 60, // m/s to fpm
        airflow_per_sheet: (m3min_per_sheet: number) => m3min_per_sheet * 35.3147, // m³/min/枚 to CFM/sheet
        area: (m2: number) => m2 * 10.7639, // m² to ft²
        density: (kg_m3: number) => kg_m3 * 0.062428, // kg/m³ to lb/ft³
        steam_pressure: (kpa: number) => kpa / 6.89476, // kPa to psi
        steam_enthalpy: (kcal_kg: number) => kcal_kg * 1.7989, // kcal/kg to BTU/lb
        steam_flow: (kgh: number) => kgh * 2.20462, // kg/h to lb/h
        gas_flow: (m3h: number) => m3h * 35.3147, // m³/h to ft³/h
        lower_heating_value: (mj_m3: number) => mj_m3 * 26.8222, // MJ/m³ to BTU/ft³
        altitude: (m: number) => m * 3.28084, // m to ft
    },
    // Conversion from Imperial unit to SI base unit
    toSI: {
        airflow: (cfm: number) => cfm / 35.3147, // CFM to m³/min
        temperature: (f: number) => (f - 32) * 5/9, // Fahrenheit to Celsius
        temperature_delta: (f: number) => f * 5/9,
        length: (inch: number) => inch / 0.0393701, // inches to mm
        pressure: (inwg: number) => inwg / 0.00401463, // in.w.g. to Pa
        heat_load: (btuh: number) => btuh / 3412.142, // BTU/h to kW
        water_flow: (gpm: number) => gpm / 0.264172, // GPM to L/min
        abs_humidity: (grains_lbDA: number) => grains_lbDA / 7, // grains/lb(DA) to g/kg(DA) (approx)
        enthalpy: (btu_lbDA: number) => btu_lbDA / 0.429923, // BTU/lb(DA) to kJ/kg(DA)
        motor_power: (hp: number) => hp / 1.34102, // HP to kW
        velocity: (fpm: number) => (fpm / 60) / 3.28084, // fpm to m/s
        airflow_per_sheet: (cfm_per_sheet: number) => cfm_per_sheet / 35.3147, // CFM/sheet to m³/min/枚
        area: (ft2: number) => ft2 / 10.7639, // ft² to m²
        density: (lb_ft3: number) => lb_ft3 / 0.062428, // lb/ft³ to kg/m³
        steam_pressure: (psi: number) => psi * 6.89476, // psi to kPa
        steam_enthalpy: (btu_lb: number) => btu_lb / 1.7989, // BTU/lb to kcal/kg
        steam_flow: (lbh: number) => lbh / 2.20462, // lb/h to kg/h
        gas_flow: (ft3h: number) => ft3h / 35.3147, // ft³/h to m³/h
        lower_heating_value: (btu_ft3: number) => btu_ft3 / 26.8222, // BTU/ft³ to MJ/m³
        altitude: (ft: number) => ft / 3.28084, // ft to m
    },
};

// Conversion factors FROM kPaG
const KPA_CONVERSIONS = {
    [SteamPressureUnit.PAG]: 1000,
    [SteamPressureUnit.KPAG]: 1,
    [SteamPressureUnit.MPAG]: 0.001,
    [SteamPressureUnit.PSIG]: 0.145038,
    [SteamPressureUnit.BARG]: 0.01,
    [SteamPressureUnit.KGFCM2G]: 0.0101972,
};

export const convertSteamPressure = (value: number, fromUnit: SteamPressureUnit, toUnit: SteamPressureUnit): number => {
    if (fromUnit === toUnit) return value;
    // First, convert from the 'fromUnit' to the base unit (kPaG)
    const valueInKpa = value / KPA_CONVERSIONS[fromUnit];
    // Then, convert from the base unit to the 'toUnit'
    return valueInKpa * KPA_CONVERSIONS[toUnit];
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

export const getPrecisionForUnitType = (unitType: UnitType | SteamPressureUnit, unitSystem: UnitSystem): number => {
    if (Object.values(SteamPressureUnit).includes(unitType as SteamPressureUnit)) {
        switch (unitType as SteamPressureUnit) {
            case SteamPressureUnit.PAG: return 0;
            case SteamPressureUnit.KPAG: return 1;
            case SteamPressureUnit.MPAG: return 4;
            case SteamPressureUnit.PSIG: return 2;
            case SteamPressureUnit.BARG: return 3;
            case SteamPressureUnit.KGFCM2G: return 3;
            default: return 2;
        }
    }

    if (unitSystem === UnitSystem.IMPERIAL) {
        switch (unitType) {
            case 'temperature':
            case 'temperature_delta': return 1;
            case 'length': return 3;
            case 'airflow': return 0;
            case 'pressure': return 2;
            case 'heat_load': return 0;
            case 'water_flow': return 2;
            case 'abs_humidity': return 2;
            case 'enthalpy': return 2;
            case 'motor_power': return 1;
            case 'velocity': return 0;
            case 'airflow_per_sheet': return 0;
            case 'area': return 2;
            case 'density': return 4;
            case 'steam_pressure': return 1;
            case 'steam_enthalpy': return 1;
            case 'steam_flow': return 1;
            case 'gas_flow': return 1;
            case 'lower_heating_value': return 0;
            case 'altitude': return 0;
            default: return 2;
        }
    } else { // SI system
        switch (unitType) {
            case 'temperature':
            case 'temperature_delta': return 1;
            case 'length': return 0;
            case 'airflow': return 0;
            case 'pressure': return 1;
            case 'heat_load': return 2;
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
            case 'steam_pressure': return 0;
            case 'steam_enthalpy': return 1;
            case 'steam_flow': return 1;
            case 'gas_flow': return 3;
            case 'lower_heating_value': return 1;
            case 'altitude': return 0;
            default: return 2;
        }
    }
};

export const findMotorHp = (kw: number): string | null => {
    // Find an exact match first for performance and precision
    const exactMatch = MOTOR_OUTPUT_CONVERSIONS.find(o => o.kw === kw);
    if (exactMatch) return exactMatch.hp;

    // If no exact match, try with a small tolerance for floating point issues
    const tolerance = 0.001;
    const match = MOTOR_OUTPUT_CONVERSIONS.find(o => Math.abs(o.kw - kw) < tolerance);
    return match ? match.hp : null;
};

export const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(num)) return '';
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

export const formatNumberForInput = (num: number, unitType: UnitType | SteamPressureUnit, unitSystem: UnitSystem): string => {
    if (isNaN(num)) return '';
    const precision = getPrecisionForUnitType(unitType, unitSystem);
    return parseFloat(num.toFixed(precision)).toString();
};