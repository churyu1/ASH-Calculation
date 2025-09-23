

import React from 'react';
import { formatNumber } from '../utils/conversions.ts';

interface FormulaTooltipContentProps {
  title: string;
  formula: string | string[];
  legend: Record<string, string>;
  values: Record<string, { value: number | null | undefined; unit: string }>;
}

const FormulaTooltipContent: React.FC<FormulaTooltipContentProps> = ({ title, formula, legend, values }) => {
  const formulas = Array.isArray(formula) ? formula : [formula];
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-bold text-base text-blue-300">{title}</h4>
      <div className="font-mono bg-slate-900 p-2 rounded text-left text-base">
        {formulas.map((f, i) => <p key={i}>{f}</p>)}
      </div>
      <hr className="border-slate-600 my-1" />
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {Object.entries(legend).map(([symbol, description]) => (
          <React.Fragment key={symbol}>
            <span className="font-mono font-bold text-right">{symbol}</span>
            <span>: {description}</span>
          </React.Fragment>
        ))}
      </div>
      <hr className="border-slate-600 my-1" />
       <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {/* FIX: Reverted to destructuring to correctly infer types for value and unit. */}
        {Object.entries(values).map(([symbol, { value, unit }]) => (
           <React.Fragment key={symbol}>
            <span className="font-mono font-bold text-right">{symbol}</span>
            <span>= {formatNumber(value)} {unit}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default FormulaTooltipContent;
