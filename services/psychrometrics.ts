
import { AirProperties } from '../types';

export const PSYCH_CONSTANTS = {
    ATM_PRESSURE_PA: 101325,
    SPECIFIC_HEAT_DRY_AIR: 1.006,
    LATENT_HEAT_VAPORIZATION_0C: 2501,
    SPECIFIC_HEAT_WATER_VAPOR: 1.86,
    GAS_CONSTANT_DRY_AIR: 287.058,
    GAS_CONSTANT_WATER_VAPOR: 461.5,
};

export const calculatePsat = (T_celsius: number): number => {
    return 610.78 * Math.exp((17.27 * T_celsius) / (T_celsius + 237.3));
};

export const calculateAbsoluteHumidity = (T_celsius: number, RH_percent: number): number => {
    const Psat = calculatePsat(T_celsius);
    const Pv = (RH_percent / 100) * Psat;
    if (Pv >= PSYCH_CONSTANTS.ATM_PRESSURE_PA) return 0;
    const W_kg_kgDA = (0.622 * Pv) / (PSYCH_CONSTANTS.ATM_PRESSURE_PA - Pv);
    return W_kg_kgDA * 1000;
};

export const calculateRelativeHumidity = (T_celsius: number, W_g_kgDA: number): number => {
    const W_kg_kgDA = W_g_kgDA / 1000;
    const Pv_from_W = (PSYCH_CONSTANTS.ATM_PRESSURE_PA * W_kg_kgDA) / (0.622 + W_kg_kgDA);
    const Psat = calculatePsat(T_celsius);
    if (Psat === 0) return 0;
    const RH = (Pv_from_W / Psat) * 100;
    return Math.min(100, Math.max(0, RH));
};

export const calculateEnthalpy = (T_celsius: number, W_g_kgDA: number): number => {
    const W_kg_kgDA = W_g_kgDA / 1000;
    return (
        PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR * T_celsius +
        W_kg_kgDA * (PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * T_celsius)
    );
};

export const calculateAbsoluteHumidityFromEnthalpy = (T_celsius: number, H_kJ_kgDA: number): number => {
    const numerator = H_kJ_kgDA - PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR * T_celsius;
    const denominator = PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * T_celsius;
    if (denominator === 0) return 0;
    return (numerator / denominator) * 1000;
};

export const calculateDryAirDensity = (T_celsius: number, RH_percent: number): number => {
    const Psat = calculatePsat(T_celsius);
    const Pv = (RH_percent / 100) * Psat;
    const T_kelvin = T_celsius + 273.15;
    const P_dry_air = PSYCH_CONSTANTS.ATM_PRESSURE_PA - Pv;
    return P_dry_air / (PSYCH_CONSTANTS.GAS_CONSTANT_DRY_AIR * T_kelvin);
};

export const calculateAirProperties = (
    temp_celsius: number | null,
    rh_percent: number | null,
    absHumidityOverride_gkgDA: number | null = null
): AirProperties => {
    if (temp_celsius === null || isNaN(temp_celsius)) {
        return { temp: temp_celsius, rh: rh_percent, absHumidity: absHumidityOverride_gkgDA, enthalpy: null, density: null };
    }

    let calculatedAbsHumidity: number | null;
    let calculatedRH: number | null;

    if (absHumidityOverride_gkgDA !== null && !isNaN(absHumidityOverride_gkgDA)) {
        calculatedAbsHumidity = absHumidityOverride_gkgDA;
        calculatedRH = calculateRelativeHumidity(temp_celsius, calculatedAbsHumidity);
    } else if (rh_percent !== null && !isNaN(rh_percent)) {
        calculatedAbsHumidity = calculateAbsoluteHumidity(temp_celsius, rh_percent);
        calculatedRH = rh_percent;
    } else {
        return { temp: temp_celsius, rh: rh_percent, absHumidity: absHumidityOverride_gkgDA, enthalpy: null, density: null };
    }
    
    if (calculatedAbsHumidity === null || calculatedRH === null) {
         return { temp: temp_celsius, rh: rh_percent, absHumidity: absHumidityOverride_gkgDA, enthalpy: null, density: null };
    }

    const enthalpy = calculateEnthalpy(temp_celsius, calculatedAbsHumidity);
    const density = calculateDryAirDensity(temp_celsius, calculatedRH);

    return {
        temp: temp_celsius,
        rh: calculatedRH,
        absHumidity: calculatedAbsHumidity,
        enthalpy: enthalpy,
        density: density,
    };
};