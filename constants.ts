import { EquipmentType } from './types';

export const EQUIPMENT_COLORS: Record<EquipmentType, string> = {
    [EquipmentType.FILTER]: 'border-slate-400',
    [EquipmentType.BURNER]: 'border-amber-500',
    [EquipmentType.COOLING_COIL]: 'border-blue-600',
    [EquipmentType.HEATING_COIL]: 'border-red-500',
    [EquipmentType.SPRAY_WASHER]: 'border-cyan-400',
    [EquipmentType.STEAM_HUMIDIFIER]: 'border-pink-500',
    [EquipmentType.FAN]: 'border-purple-500',
    [EquipmentType.CUSTOM]: 'border-indigo-500',
};

export const EQUIPMENT_HEX_COLORS: Record<EquipmentType, string> = {
    [EquipmentType.FILTER]: '#94a3b8',
    [EquipmentType.BURNER]: '#f59e0b',
    [EquipmentType.COOLING_COIL]: '#2563eb',
    [EquipmentType.HEATING_COIL]: '#ef4444',
    [EquipmentType.SPRAY_WASHER]: '#22d3ee',
    [EquipmentType.STEAM_HUMIDIFIER]: '#ec4899',
    [EquipmentType.FAN]: '#a855f7',
    [EquipmentType.CUSTOM]: '#6366f1',
};

export const MOTOR_OUTPUT_CONVERSIONS: { hp: string; kw: number }[] = [
    { hp: '1/8', kw: 0.1 },
    { hp: '1/6', kw: 0.125 },
    { hp: '1/5', kw: 0.15 },
    { hp: '1/4', kw: 0.2 },
    { hp: '1/3', kw: 0.25 },
    { hp: '1/2', kw: 0.4 },
    { hp: '2/3', kw: 0.5 },
    { hp: '3/4', kw: 0.55 },
    { hp: '1', kw: 0.75 },
    { hp: '1.5', kw: 1.1 },
    { hp: '2', kw: 1.5 },
    { hp: '3', kw: 2.2 },
    { hp: '4.0', kw: 3.0 },
    { hp: '5.0', kw: 3.7 },
    { hp: '7.5', kw: 5.5 },
    { hp: '10', kw: 7.5 },
    { hp: '15', kw: 11 },
    { hp: '20', kw: 15 },
    { hp: '25', kw: 19 },
    { hp: '30', kw: 22 },
    { hp: '35', kw: 26 },
    { hp: '40', kw: 30 },
    { hp: '45', kw: 33 },
    { hp: '50', kw: 37 },
    { hp: '60', kw: 45 },
    { hp: '75', kw: 55 },
    { hp: '80', kw: 60 },
    { hp: '100', kw: 75 },
    { hp: '125', kw: 95 },
    { hp: '150', kw: 110 },
    { hp: '200', kw: 150 },
    { hp: '250', kw: 190 },
    { hp: '300', kw: 220 },
    { hp: '350', kw: 260 },
    { hp: '400', kw: 300 },
    { hp: '500', kw: 370 },
];

// Conversion factor from MJ/m³ to BTU/ft³ is approx 26.8222
export const MAJOR_GAS_HEATING_VALUES = {
    si: [
        { name: 'natural_gas', hhv: 50.0, lhv: 45.0 },
        { name: 'city_gas', hhv: 19.3, lhv: 17.2 },
        { name: 'lpg', hhv: 101.0, lhv: 93.2 },
    ],
    imperial: [
        { name: 'natural_gas', hhv: 1341, lhv: 1207 },
        { name: 'city_gas', hhv: 518, lhv: 461 },
        { name: 'lpg', hhv: 2709, lhv: 2500 },
    ]
};