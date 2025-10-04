import { AirProperties } from '../types';

export const PSYCH_CONSTANTS = {
    SPECIFIC_HEAT_DRY_AIR: 1.006,
    LATENT_HEAT_VAPORIZATION_0C: 2501,
    SPECIFIC_HEAT_WATER_VAPOR: 1.86,
    GAS_CONSTANT_DRY_AIR: 287.058,
    GAS_CONSTANT_WATER_VAPOR: 461.5,
};

// Data points for saturated steam (Pressure in kPa, Temp in °C, Enthalpy of vapor in kJ/kg)
const STEAM_TABLE: [number, number, number][] = [
    [101.325, 100, 2676.1], // Atmospheric pressure
    [150, 111.4, 2693.6],
    [200, 120.2, 2706.7],
    [300, 133.5, 2725.3],
    [400, 143.6, 2738.6],
    [500, 151.8, 2748.7],
    [600, 158.8, 2756.8],
    [800, 170.4, 2769.1],
    [1000, 179.9, 2778.1]
];

export const calculateAtmosphericPressure = (altitude_m: number): number => {
    if (altitude_m < 0) altitude_m = 0;
    // Standard atmosphere model formula (simplified for troposphere)
    return 101325 * Math.pow(1 - 0.0000225577 * altitude_m, 5.25588);
};

export const calculateSteamProperties = (gaugePressure_kPa: number, atmPressure_Pa: number): { temp: number, enthalpy: number, absPressure: number } => {
    const absPressure_kPa = gaugePressure_kPa + atmPressure_Pa / 1000;
    
    if (absPressure_kPa <= STEAM_TABLE[0][0]) {
        return { temp: STEAM_TABLE[0][1], enthalpy: STEAM_TABLE[0][2], absPressure: absPressure_kPa };
    }
    if (absPressure_kPa >= STEAM_TABLE[STEAM_TABLE.length - 1][0]) {
        return { temp: STEAM_TABLE[STEAM_TABLE.length - 1][1], enthalpy: STEAM_TABLE[STEAM_TABLE.length - 1][2], absPressure: absPressure_kPa };
    }

    let lowerBound: [number, number, number] | null = null;
    let upperBound: [number, number, number] | null = null;
    
    for (let i = 0; i < STEAM_TABLE.length - 1; i++) {
        if (absPressure_kPa >= STEAM_TABLE[i][0] && absPressure_kPa < STEAM_TABLE[i + 1][0]) {
            lowerBound = STEAM_TABLE[i];
            upperBound = STEAM_TABLE[i + 1];
            break;
        }
    }

    if (!lowerBound || !upperBound) {
        // Fallback, should not be reached due to checks above
        return { temp: 100, enthalpy: 2676.1, absPressure: absPressure_kPa };
    }
    
    const [p1, t1, h1] = lowerBound;
    const [p2, t2, h2] = upperBound;
    
    const ratio = (absPressure_kPa - p1) / (p2 - p1);
    
    const interpolatedTemp = t1 + ratio * (t2 - t1);
    const interpolatedEnthalpy = h1 + ratio * (h2 - h1);
    
    return { temp: interpolatedTemp, enthalpy: interpolatedEnthalpy, absPressure: absPressure_kPa };
};

export const calculatePsat = (T_celsius: number): number => {
    return 610.78 * Math.exp((17.27 * T_celsius) / (T_celsius + 237.3));
};

export const calculateAbsoluteHumidity = (T_celsius: number, RH_percent: number, atmPressure_Pa: number): number => {
    const Psat = calculatePsat(T_celsius);
    const Pv = (RH_percent / 100) * Psat;
    if (Pv >= atmPressure_Pa) return 0;
    const W_kg_kgDA = (0.622 * Pv) / (atmPressure_Pa - Pv);
    return W_kg_kgDA * 1000;
};

export const calculateRelativeHumidity = (T_celsius: number, W_g_kgDA: number, atmPressure_Pa: number): number => {
    const W_kg_kgDA = W_g_kgDA / 1000;
    const Pv_from_W = (atmPressure_Pa * W_kg_kgDA) / (0.622 + W_kg_kgDA);
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

export const calculateDewPoint = (W_g_kgDA: number, atmPressure_Pa: number): number => {
    if (W_g_kgDA <= 0) return -100; // Return a very low temp for dry air
    const W_kg_kgDA = W_g_kgDA / 1000;
    const Pv_from_W = (atmPressure_Pa * W_kg_kgDA) / (0.622 + W_kg_kgDA);
    
    // Using inverse of Magnus formula used in calculatePsat
    const C = Math.log(Pv_from_W / 610.78);
    const Tdp = (237.3 * C) / (17.27 - C);
    
    return Tdp;
};

export const calculateTempFromRhAndAbsHumidity = (RH_percent: number, W_g_kgDA: number, atmPressure_Pa: number): number | null => {
    if (RH_percent === null || W_g_kgDA === null || RH_percent <= 0) return null;

    const W_kg_kgDA = W_g_kgDA / 1000;
    const Pv_from_W = (atmPressure_Pa * W_kg_kgDA) / (0.622 + W_kg_kgDA);

    const Psat = (Pv_from_W / (RH_percent / 100));
    if (Psat <= 0) return null;

    // Using inverse of Magnus formula used in calculatePsat
    const C = Math.log(Psat / 610.78);
    if ((17.27 - C) === 0) return null; // Avoid division by zero
    const T = (237.3 * C) / (17.27 - C);

    return T;
};

export const calculateDryAirDensity = (T_celsius: number, RH_percent: number, atmPressure_Pa: number): number => {
    const Psat = calculatePsat(T_celsius);
    const Pv = (RH_percent / 100) * Psat;
    const T_kelvin = T_celsius + 273.15;
    const P_dry_air = atmPressure_Pa - Pv;
    return P_dry_air / (PSYCH_CONSTANTS.GAS_CONSTANT_DRY_AIR * T_kelvin);
};

export const calculateAirProperties = (
    temp_celsius: number | null,
    rh_percent: number | null,
    atmPressure_Pa: number,
    absHumidityOverride_gkgDA: number | null = null
): AirProperties => {
    if (temp_celsius === null || isNaN(temp_celsius)) {
        return { temp: temp_celsius, rh: rh_percent, absHumidity: absHumidityOverride_gkgDA, enthalpy: null, density: null };
    }

    let calculatedAbsHumidity: number | null;
    let calculatedRH: number | null;

    if (absHumidityOverride_gkgDA !== null && !isNaN(absHumidityOverride_gkgDA)) {
        calculatedAbsHumidity = absHumidityOverride_gkgDA;
        calculatedRH = calculateRelativeHumidity(temp_celsius, calculatedAbsHumidity, atmPressure_Pa);
    } else if (rh_percent !== null && !isNaN(rh_percent)) {
        calculatedAbsHumidity = calculateAbsoluteHumidity(temp_celsius, rh_percent, atmPressure_Pa);
        calculatedRH = rh_percent;
    } else {
        return { temp: temp_celsius, rh: rh_percent, absHumidity: absHumidityOverride_gkgDA, enthalpy: null, density: null };
    }
    
    if (calculatedAbsHumidity === null || calculatedRH === null) {
         return { temp: temp_celsius, rh: rh_percent, absHumidity: absHumidityOverride_gkgDA, enthalpy: null, density: null };
    }

    const enthalpy = calculateEnthalpy(temp_celsius, calculatedAbsHumidity);
    const density = calculateDryAirDensity(temp_celsius, calculatedRH, atmPressure_Pa);

    return {
        temp: temp_celsius,
        rh: calculatedRH,
        absHumidity: calculatedAbsHumidity,
        enthalpy: enthalpy,
        density: density,
    };
};