
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
    
    // Refs for continuous change
    const intervalRef = useRef<number | null>(null);
    const timeoutRef = useRef<number | null>(null);
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
    const handleChange = useCallback((direction: 'inc' | 'dec') => {
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

        const formattedNewValue = formatNumberForInput(newValue, unitType, unitSystem);
        setInputValue(formattedNewValue);
        commitValueToParent(formattedNewValue);

    }, [commitValueToParent, maxInDisplayUnits, minInDisplayUnits, needsConversion, stepInDisplayUnits, unitSystem, unitType]);


    const stopContinuousChange = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const startContinuousChange = useCallback((direction: 'inc' | 'dec') => {
        stopContinuousChange(); // Ensure no timers are running
        handleChange(direction); // Immediate change on first click

        timeoutRef.current = window.setTimeout(() => {
            intervalRef.current = window.setInterval(() => {
                handleChange(direction);
            }, 100); // Speed of continuous change
        }, 400); // Delay before continuous change starts
    }, [handleChange, stopContinuousChange]);
    
    const handleMouseDown = (direction: 'inc' | 'dec') => (e: React.MouseEvent) => {
        e.preventDefault();
        startContinuousChange(direction);
    };
    
    const handleTouchStart = (direction: 'inc' | 'dec') => (e: React.TouchEvent) => {
        e.preventDefault();
        startContinuousChange(direction);
    };

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
    
    const isDecrementDisabled = minInDisplayUnits !== undefined && displayValue !== null && displayValue <= minInDisplayUnits;
    const isIncrementDisabled = maxInDisplayUnits !== undefined && displayValue !== null && displayValue >= maxInDisplayUnits;

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            stopContinuousChange();
        };
    }, [stopContinuousChange]);

    return (
        <div className={`flex flex-col items-end gap-1 ${containerClassName}`}>
            <div className="flex items-center gap-1 w-full justify-end">
                <button 
                    type="button" 
                    onMouseDown={handleMouseDown('dec')}
                    onMouseUp={stopContinuousChange}
                    onMouseLeave={stopContinuousChange}
                    onTouchStart={handleTouchStart('dec')}
                    onTouchEnd={stopContinuousChange}
                    disabled={isDecrementDisabled} 
                    className="px-2 py-1 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
                >
                    -
                </button>
                <button 
                    type="button" 
                    onMouseDown={handleMouseDown('inc')}
                    onMouseUp={stopContinuousChange}
                    onMouseLeave={stopContinuousChange}
                    onTouchStart={handleTouchStart('inc')}
                    onTouchEnd={stopContinuousChange}
                    disabled={isIncrementDisabled} 
                    className="px-2 py-1 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
                >
                    +
                </button>
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    className={`w-24 px-2 py-1 border border-slate-300 rounded-md bg-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName}`}
                />
                <span className="text-sm w-24 text-left pl-1">{displayUnit}</span>
            </div>
            {needsConversion && secondaryDisplayValue !== null && !isNaN(secondaryDisplayValue) && (
                <div className="w-full text-xs text-slate-500 text-right pr-[8rem] pt-0.5">
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