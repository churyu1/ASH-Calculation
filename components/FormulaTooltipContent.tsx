
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

  // Function to create a substituted version of the formula string
  const getSubstitutedFormula = (formulaStr: string) => {
    // We only substitute if there is an equals sign
    const equalsIndex = formulaStr.indexOf('=');
    if (equalsIndex === -1) return null;

    let rhs = formulaStr.substring(equalsIndex + 1).trim();
    
    // Sort keys by length descending to avoid partial replacements (e.g. "G" in "G_air")
    const symbols = Object.keys(values).sort((a, b) => b.length - a.length);
    
    let substituted = rhs;
    let hasReplaced = false;

    symbols.forEach(symbol => {
      const data = values[symbol];
      if (data.value !== null && data.value !== undefined) {
        // Use word boundaries or ensure the symbol is not part of another identifier
        // Handle symbols that might contains underscores or other chars
        const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match only if not preceded or followed by an alphanumeric char or underscore
        const regex = new RegExp(`(?<![a-zA-Z0-9_])${escapedSymbol}(?![a-zA-Z0-9_])`, 'g');
        
        const formattedVal = formatNumber(data.value);
        if (regex.test(substituted)) {
          substituted = substituted.replace(regex, formattedVal);
          hasReplaced = true;
        }
      }
    });

    return hasReplaced ? substituted : null;
  };

  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-bold text-base text-blue-300">{title}</h4>
      <div className="font-mono bg-slate-900 p-2 rounded text-left text-base leading-relaxed">
        {formulas.map((f, i) => {
          const sub = getSubstitutedFormula(f);
          const resultSymbol = f.includes('=') ? f.split('=')[0].trim() : '';
          const resultData = values[resultSymbol];
          const isLast = i === formulas.length - 1;

          return (
            <React.Fragment key={i}>
              <div className={i > 0 ? "mt-4 border-t border-slate-800 pt-2" : ""}>
                <p className="text-slate-300">{f}</p>
                {sub && <p className="text-blue-400">= {sub}</p>}
                {resultData && resultData.value !== null && resultData.value !== undefined && (
                  <p className={`${isLast ? 'text-yellow-400 text-lg font-bold' : 'text-yellow-200'} mt-1`}>
                    = {formatNumber(resultData.value)} {resultData.unit}
                  </p>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <hr className="border-slate-600 my-1" />
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {Object.entries(legend).map(([symbol, description]) => (
          <React.Fragment key={symbol}>
            <span className="font-mono font-bold text-right text-slate-300">{symbol}</span>
            <span className="text-slate-400">: {description}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default FormulaTooltipContent;
