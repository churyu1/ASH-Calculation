import { EquipmentType } from './types';

export const EQUIPMENT_COLORS: Record<EquipmentType, string> = {
    [EquipmentType.FILTER]: 'border-slate-400',
    [EquipmentType.BURNER]: 'border-amber-500',
    [EquipmentType.COOLING_COIL]: 'border-blue-600',
    [EquipmentType.HEATING_COIL]: 'border-red-500',
    [EquipmentType.ELIMINATOR]: 'border-teal-400',
    [EquipmentType.SPRAY_WASHER]: 'border-cyan-400',
    [EquipmentType.STEAM_HUMIDIFIER]: 'border-pink-500',
    [EquipmentType.FAN]: 'border-purple-500',
    [EquipmentType.DAMPER]: 'border-orange-500',
    [EquipmentType.CUSTOM]: 'border-indigo-500',
};

export const EQUIPMENT_HEX_COLORS: Record<EquipmentType, string> = {
    [EquipmentType.FILTER]: '#94a3b8',
    [EquipmentType.BURNER]: '#f59e0b',
    [EquipmentType.COOLING_COIL]: '#2563eb',
    [EquipmentType.HEATING_COIL]: '#ef4444',
    [EquipmentType.ELIMINATOR]: '#2dd4bf',
    [EquipmentType.SPRAY_WASHER]: '#22d3ee',
    [EquipmentType.STEAM_HUMIDIFIER]: '#ec4899',
    [EquipmentType.FAN]: '#a855f7',
    [EquipmentType.DAMPER]: '#f97316',
    [EquipmentType.CUSTOM]: '#6366f1',
};

export const MOTOR_OUTPUT_OPTIONS: number[] = [
    0.2, 0.4, 0.75, 1.5, 2.2, 3.7, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 185, 220, 250, 280, 315, 355
];