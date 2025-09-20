

export enum UnitSystem {
    SI = 'si',
    IMPERIAL = 'imperial',
}

export enum EquipmentType {
    FILTER = 'filter',
    BURNER = 'burner',
    COOLING_COIL = 'cooling_coil',
    HEATING_COIL = 'heating_coil',
    SPRAY_WASHER = 'spray_washer',
    STEAM_HUMIDIFIER = 'steam_humidifier',
    FAN = 'fan',
    CUSTOM = 'custom',
}

export enum SteamPressureUnit {
    PAG = 'pag',
    KPAG = 'kpag',
    MPAG = 'mpag',
    PSIG = 'psig',
    BARG = 'barg',
    KGFCM2G = 'kgfcm2g',
}

export interface AirProperties {
    temp: number | null;
    rh: number | null;
    absHumidity: number | null;
    enthalpy: number | null;
    density: number | null;
}

// Base interfaces for conditions and results
interface BaseConditions {}
interface BaseResults {}

// Specific condition interfaces
export interface FilterConditions extends BaseConditions {
    width?: number;
    height?: number;
    thickness?: number;
    sheets?: number;
}

export interface BurnerConditions extends BaseConditions {
    shf?: number;
}

export interface CoolingCoilConditions extends BaseConditions {
    chilledWaterInletTemp?: number;
    chilledWaterOutletTemp?: number;
    bypassFactor?: number;
}

export interface HeatingCoilConditions extends BaseConditions {
    hotWaterInletTemp?: number;
    hotWaterOutletTemp?: number;
    heatExchangeEfficiency?: number;
}

export interface SprayWasherConditions extends BaseConditions {
    waterToAirRatio?: number;
}

export interface SteamHumidifierConditions extends BaseConditions {
    steamGaugePressure?: number; // Always stored in kPaG
    steamGaugePressureUnit?: SteamPressureUnit;
}

export interface FanConditions extends BaseConditions {
    motorOutput?: number;
    motorEfficiency?: number;
    totalPressure?: number;
    fanEfficiency?: number;
    marginFactor?: number;
}

export interface CustomConditions extends BaseConditions {}

export type EquipmentConditions = FilterConditions | BurnerConditions | CoolingCoilConditions | HeatingCoilConditions | SprayWasherConditions | SteamHumidifierConditions | FanConditions | CustomConditions;

// Specific result interfaces
export interface FilterResults extends BaseResults {
    faceVelocity?: number;
    treatedAirflowPerSheet?: number;
}

export interface BurnerResults extends BaseResults {
    heatLoad_kW?: number;
}

export interface CoolingCoilResults extends BaseResults {
    airSideHeatLoad_kW?: number;
    coldWaterSideHeatLoad_kW?: number;
    chilledWaterFlow_L_min?: number;
    dehumidification_L_min?: number;
    bypassFactor?: number;
    contactFactor?: number;
    apparatusDewPointTemp?: number;
}

export interface HeatingCoilResults extends BaseResults {
    airSideHeatLoad_kW?: number;
    hotWaterSideHeatLoad_kW?: number;
    hotWaterFlow_L_min?: number;
}

export interface SprayWasherResults extends BaseResults {
    humidification_L_min?: number;
    sprayAmount_L_min?: number;
    humidificationEfficiency?: number;
}

export interface SteamHumidifierResults extends BaseResults {
    steamAbsolutePressure?: number;
    steamTemperature?: number;
    steamEnthalpy?: number;
    requiredSteamAmount?: number;
}

export interface FanResults extends BaseResults {
    heatGeneration_kW?: number;
    tempRise_deltaT_celsius?: number;
    requiredMotorPower?: number;
}

export interface CustomResults extends BaseResults {
    pressureLoss?: number;
}

export type EquipmentResults = FilterResults | BurnerResults | CoolingCoilResults | HeatingCoilResults | SprayWasherResults | SteamHumidifierResults | FanResults | CustomResults;

// Main Equipment interface
export interface Equipment {
    id: number;
    type: EquipmentType;
    pressureLoss: number | null;
    inletAir: AirProperties;
    outletAir: AirProperties;
    conditions: EquipmentConditions;
    results: EquipmentResults;
    color: string;
    inletIsLocked?: boolean;
}

export type UnitType = 
    | 'airflow' | 'temperature' | 'length' | 'pressure' | 'heat_load' | 'water_flow'
    | 'abs_humidity' | 'enthalpy' | 'motor_power' | 'velocity' | 'airflow_per_sheet'
    | 'rh' | 'sheets' | 'shf' | 'efficiency' | 'k_value' | 'water_to_air_ratio'
    | 'area' | 'density' | 'steam_pressure' | 'steam_enthalpy' | 'steam_flow';

export interface ChartPoint {
    temp: number;
    absHumidity: number;
}

export interface Project {
    id: string;
    name: string;
    airflow: number | null;
    equipmentList: Equipment[];
    acInletAir: AirProperties;
    acOutletAir: AirProperties;
}