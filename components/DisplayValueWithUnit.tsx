
import React from 'react';
import { UnitSystem, UnitType } from '../types';
import { convertValue, formatNumber } from '../utils/conversions';
import { useLanguage } from '../i18n';
import Tooltip from './Tooltip';

interface DisplayValueWithUnitProps {
    value: number | null | undefined;
    unitType: UnitType;
    unitSystem: UnitSystem;
    valueClassName?: string;
    tooltipContent?: React.ReactNode;
    compact?: boolean;
}

const DisplayValueWithUnit: React.FC<DisplayValueWithUnitProps> = ({ value, unitType, unitSystem, valueClassName = '', tooltipContent, compact = false }) => {
    const { t } = useLanguage();
    const needsConversion = unitType !== 'rh' && unitType !== 'sheets' && unitType !== 'shf' && unitType !== 'efficiency' && unitType !== 'k_value' && unitType !== 'water_to_air_ratio';
    
    const displayValue = needsConversion ? convertValue(value ?? null, unitType, UnitSystem.SI, unitSystem) : value;
    const displayUnit = t(`units.${unitSystem}.${unitType}`);

    const otherUnitSystem = unitSystem === UnitSystem.SI ? UnitSystem.IMPERIAL : UnitSystem.SI;
    const secondaryDisplayValue = needsConversion ? convertValue(value ?? null, unitType, UnitSystem.SI, otherUnitSystem) : value;
    const secondaryDisplayUnit = t(`units.${otherUnitSystem}.${unitType}`);

    const mainDisplay = (
        <div className={`flex items-center justify-end ${compact ? 'gap-0.5' : 'gap-1'}`}>
            <span className={`${valueClassName} ${compact ? 'text-xs' : 'font-bold'}`}>{formatNumber(displayValue)}</span>
            {displayUnit && <span className={`${compact ? 'text-[10px] w-auto' : 'text-sm w-24'} text-left pl-1`}>{displayUnit}</span>}
        </div>
    );

    return (
        <div className="flex flex-col items-end gap-0">
            {tooltipContent ? <Tooltip content={tooltipContent}>{mainDisplay}</Tooltip> : mainDisplay}
            {needsConversion && !compact && secondaryDisplayValue !== null && !isNaN(secondaryDisplayValue) && (
                <div className="w-full text-xs text-slate-500 text-right pr-[6.5rem] pt-0.5">
                    ({formatNumber(secondaryDisplayValue)} {secondaryDisplayUnit})
                </div>
            )}
        </div>
    );
};

export default DisplayValueWithUnit;