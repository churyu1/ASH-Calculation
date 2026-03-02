
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UnitSystem, UnitType } from '../types';
import { convertValue, getPrecisionForUnitType, formatNumber, formatNumberForInput } from '../utils/conversions.ts';
import { useLanguage } from '../i18n/index.ts';

interface NumberInputWithControlsProps {
    value: number | null;
    onChange: (value: number | null) => void;
    step?: number;
    min?: number;
    max?: number;
    unitType: UnitType;
    unitSystem: UnitSystem;
    inputClassName?: string;
    containerClassName?: string;
}

const NumberInputWithControls: React.FC<NumberInputWithControlsProps> = ({
    value, onChange, step = 1, min, max, unitType, unitSystem, inputClassName = '', containerClassName = ''
}) => {
    const { t } = useLanguage();
    const needsConversion = unitType !== 'rh' && unitType !== 'sheets' && unitType !== 'shf' && unitType !== 'efficiency' && unitType !== 'k_value' && unitType !== 'water_to_air_ratio';

    const [inputValue, setInputValue] = useState('');
    const isFocused = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);
    
    const valueRef = useRef(value);

    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    const displayValue = needsConversion ? convertValue(value, unitType, UnitSystem.SI, unitSystem) : value;
    const displayUnit = t(`units.${unitSystem}.${unitType}`);

    const otherUnitSystem = unitSystem === UnitSystem.SI ? UnitSystem.IMPERIAL : UnitSystem.SI;
    const secondaryDisplayValue = needsConversion ? convertValue(value, unitType, UnitSystem.SI, otherUnitSystem) : value;
    const secondaryDisplayUnit = t(`units.${otherUnitSystem}.${unitType}`);

    const mmAqValue = (unitType === 'pressure' && value !== null) 
        ? value / 9.80665 
        : null;

    const getStepInDisplayUnits = () => {
        if (!needsConversion) return step;

        if (unitType === 'temperature') {
            return step;
        }

        const zeroInDisplay = convertValue(0, unitType, UnitSystem.SI, unitSystem);
        const stepInDisplay = convertValue(step, unitType, UnitSystem.SI, unitSystem);

        if (zeroInDisplay !== null && stepInDisplay !== null) {
            return stepInDisplay - zeroInDisplay;
        }

        return step;
    };
    const stepInDisplayUnits = getStepInDisplayUnits();

    const minInDisplayUnits = (min !== undefined && needsConversion) ? convertValue(min, unitType, UnitSystem.SI, unitSystem) : min;
    const maxInDisplayUnits = (max !== undefined && needsConversion) ? convertValue(max, unitType, UnitSystem.SI, unitSystem) : max;

    useEffect(() => {
        if (!isFocused.current) {
            if (displayValue !== null && !isNaN(displayValue)) {
                setInputValue(formatNumberForInput(displayValue, unitType, unitSystem));
            } else {
                setInputValue('');
            }
        }
    }, [displayValue, unitType, unitSystem]);
    
    const commitValueToParent = useCallback((valString: string) => {
        if (valString === '') {
            onChange(null);
        } else {
            let parsedVal = parseFloat(valString);
            if (!isNaN(parsedVal)) {
                // Do not round the value here. Let the parent component receive the full-precision value
                // so that small decimal changes trigger re-calculations. Formatting for display
                // is handled separately in useEffect and onBlur.
                let limitedVal = parsedVal;
                if (maxInDisplayUnits !== undefined && maxInDisplayUnits !== null) limitedVal = Math.min(maxInDisplayUnits, limitedVal);
                if (minInDisplayUnits !== undefined && minInDisplayUnits !== null) limitedVal = Math.max(minInDisplayUnits, limitedVal);

                onChange(needsConversion ? convertValue(limitedVal, unitType, unitSystem, UnitSystem.SI) : limitedVal);
            } else {
                onChange(null);
            }
        }
    }, [onChange, needsConversion, unitType, unitSystem, minInDisplayUnits, maxInDisplayUnits]);
    
    // Wrapped change handlers for continuous press
    const handleChange = useCallback((direction: 'inc' | 'dec', updateLocalInput: boolean = false) => {
        const currentPropValue = valueRef.current;
        const currentVal = needsConversion ? convertValue(currentPropValue, unitType, UnitSystem.SI, unitSystem) : currentPropValue;

        let newValue: number;
        if (direction === 'inc') {
            if (currentVal === null || isNaN(currentVal)) {
                 newValue = minInDisplayUnits ?? stepInDisplayUnits;
            } else {
                newValue = currentVal + stepInDisplayUnits;
            }
             if (maxInDisplayUnits !== undefined && maxInDisplayUnits !== null) {
                newValue = Math.min(maxInDisplayUnits, newValue);
            }
        } else { // 'dec'
            if (currentVal === null || isNaN(currentVal)) {
                newValue = minInDisplayUnits ?? 0;
            } else {
                newValue = currentVal - stepInDisplayUnits;
            }
             if (minInDisplayUnits !== undefined && minInDisplayUnits !== null) {
                newValue = Math.max(minInDisplayUnits, newValue);
            }
        }
        
        const formatted = formatNumberForInput(newValue, unitType, unitSystem);
        if (updateLocalInput) {
            setInputValue(formatted);
        }
        commitValueToParent(formatted);

    }, [commitValueToParent, maxInDisplayUnits, minInDisplayUnits, needsConversion, stepInDisplayUnits, unitSystem, unitType]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        commitValueToParent(e.target.value);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        isFocused.current = true;
        e.target.select();
    };

    const handleBlur = () => {
        isFocused.current = false;
        if (displayValue !== null && !isNaN(displayValue)) {
            setInputValue(formatNumberForInput(displayValue, unitType, unitSystem));
        } else {
            setInputValue('');
        }
    };

    return (
        <div className={`flex flex-col items-end gap-1 ${containerClassName}`}>
            <div className="flex items-center gap-1 justify-end">
                <input
                    ref={inputRef}
                    type="number"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    step={stepInDisplayUnits}
                    min={minInDisplayUnits}
                    max={maxInDisplayUnits}
                    className={`w-20 px-2 py-1 border border-slate-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName}`}
                />
                <span className="text-sm w-auto text-left pl-1">{displayUnit}</span>
            </div>
            {needsConversion && secondaryDisplayValue !== null && !isNaN(secondaryDisplayValue) && (
                <div className="text-xs text-slate-500 text-right pt-0.5">
                    {unitType === 'pressure' && mmAqValue !== null ? (
                        <div className="flex flex-col items-end">
                           <span>({formatNumber(secondaryDisplayValue)} {secondaryDisplayUnit})</span>
                           <span>({formatNumber(mmAqValue)} mmAq)</span>
                        </div>
                    ) : (
                        <span>({formatNumber(secondaryDisplayValue)} {secondaryDisplayUnit})</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default NumberInputWithControls;