import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
// FIX: Changed d3 import from namespace to named functions to fix module resolution errors.
import { select, scaleLinear, axisBottom, axisLeft, line, Selection } from 'd3';
import { Equipment, AirProperties, UnitSystem, ChartPoint } from '../types';
import { convertValue, getPrecisionForUnitType } from '../utils/conversions';
import { calculateAbsoluteHumidity, calculateAbsoluteHumidityFromEnthalpy } from '../services/psychrometrics';
import { useLanguage } from '../i18n';
import { EQUIPMENT_HEX_COLORS } from '../constants';

interface PsychrometricChartProps {
    airConditionsData: Equipment[];
    globalInletAir: AirProperties;
    globalOutletAir: AirProperties;
    unitSystem: UnitSystem;
}

const PsychrometricChart: React.FC<PsychrometricChartProps> = ({ airConditionsData, globalInletAir, globalOutletAir, unitSystem }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { t } = useLanguage();
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const parentWidth = containerRef.current.clientWidth;
                if (parentWidth > 0) {
                    setDimensions({
                        width: parentWidth,
                        height: parentWidth * (2 / 3), // Maintain aspect ratio
                    });
                }
            }
        };

        const resizeObserver = new ResizeObserver(updateSize);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        
        updateSize();

        return () => {
            if (containerRef.current) {
                // eslint-disable-next-line react-hooks/exhaustive-deps
                resizeObserver.unobserve(containerRef.current);
            }
        };
    }, []);

    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const width = dimensions.width > (margin.left + margin.right) ? dimensions.width - margin.left - margin.right : 0;
    const height = dimensions.height > (margin.top + margin.bottom) ? dimensions.height - margin.top - margin.bottom : 0;


    useEffect(() => {
        if (!svgRef.current || width <= 0 || height <= 0) return;

        const temperatureUnit = t(`units.${unitSystem}.temperature`);
        const absHumidityUnit = t(`units.${unitSystem}.abs_humidity`);
        const enthalpyUnit = t(`units.${unitSystem}.enthalpy`);

        // FIX: Use 'select' directly instead of 'd3.select'
        select(svgRef.current).selectAll("*").remove();

        // FIX: Use 'select' directly instead of 'd3.select'
        const svg = select(svgRef.current)
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // FIX: Use 'scaleLinear' directly instead of 'd3.scaleLinear'
        const xScale = scaleLinear().domain([-20, 60]).range([0, width]);
        // FIX: Use 'scaleLinear' directly instead of 'd3.scaleLinear'
        const yScale = scaleLinear().domain([0, 30]).range([height, 0]);

        const xAxis = svg.append("g")
            .attr("transform", `translate(0,${height})`)
            // FIX: Use 'axisBottom' directly instead of 'd3.axisBottom'
            .call(axisBottom(xScale).ticks(10).tickFormat(d => `${convertValue(d as number, 'temperature', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('temperature', unitSystem))}`))
        
        xAxis.selectAll("path").style("stroke", "#64748b");
        xAxis.selectAll("line").style("stroke", "#64748b");
        xAxis.selectAll("text").style("fill", "#475569").style("font-size", "12px");
        xAxis.append("text")
            .attr("y", 40).attr("x", width / 2).attr("fill", "#334155").attr("font-size", "14px").attr("text-anchor", "middle")
            .text(`${t('chart.xAxisLabel')} (${temperatureUnit})`);

        const yAxis = svg.append("g")
            // FIX: Use 'axisLeft' directly instead of 'd3.axisLeft'
            // FIX: Corrected function call from getPrecisionForType to getPrecisionForUnitType
            .call(axisLeft(yScale).ticks(6).tickFormat(d => `${convertValue(d as number, 'abs_humidity', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('abs_humidity', unitSystem))}`))
            
        yAxis.selectAll("path").style("stroke", "#64748b");
        yAxis.selectAll("line").style("stroke", "#64748b");
        yAxis.selectAll("text").style("fill", "#475569").style("font-size", "12px");
        yAxis.append("text")
            .attr("transform", "rotate(-90)").attr("y", -45).attr("x", -height / 2).attr("fill", "#334155").attr("font-size", "14px").attr("text-anchor", "middle")
            .text(`${t('chart.yAxisLabel')} (${absHumidityUnit})`);
            
        // FIX: Use 'axisBottom' directly instead of 'd3.axisBottom'
        svg.append("g").attr("class", "grid x-grid").attr("transform", `translate(0,${height})`).call(axisBottom(xScale).ticks(10).tickSize(-height).tickFormat(() => "")).selectAll("line").style("stroke", "#e2e8f0");
        // FIX: Use 'axisLeft' directly instead of 'd3.axisLeft'
        svg.append("g").attr("class", "grid y-grid").call(axisLeft(yScale).ticks(6).tickSize(-width).tickFormat(() => "")).selectAll("line").style("stroke", "#e2e8f0");

        const defs = svg.append("defs");
        const defaultColor = '#2563eb';

        airConditionsData.forEach(eq => {
            const color = EQUIPMENT_HEX_COLORS[eq.type] || defaultColor;
            defs.append("marker")
                .attr("id", `arrow-${eq.id}`)
                .attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("refY", 0)
                .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse")
                .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", color);
        });

        const rhLines = [20, 40, 60, 80, 100];
        rhLines.forEach(rh => {
            const lineData: ChartPoint[] = [];
            for (let T = -20; T <= 60; T += 1) {
                const absHumidity = calculateAbsoluteHumidity(T, rh);
                if (absHumidity >= yScale.domain()[0] && absHumidity <= yScale.domain()[1]) {
                    lineData.push({ temp: T, absHumidity });
                }
            }
            // FIX: Use 'line' directly instead of 'd3.line'
            const lineGenerator = line<ChartPoint>().x(d => xScale(d.temp)).y(d => yScale(d.absHumidity));
            svg.append("path").datum(lineData).attr("fill", "none").attr("stroke", "#94a3b8").attr("stroke-width", 0.5)
               .attr("stroke-dasharray", rh === 100 ? "0" : "2,2").attr("d", lineGenerator);
            if (lineData.length > 0) {
                const lastPoint = lineData[lineData.length - 1];
                svg.append("text").attr("x", xScale(lastPoint.temp) + 5).attr("y", yScale(lastPoint.absHumidity) - 5)
                   .text(`${rh}%`).attr("font-size", "11px").attr("fill", "#64748b");
            }
        });

        const enthalpyLines = [0, 20, 40, 60, 80, 100, 120];
        enthalpyLines.forEach(h => {
            const lineData: ChartPoint[] = [];
            for (let T = -20; T <= 60; T += 1) {
                const absHumidity = calculateAbsoluteHumidityFromEnthalpy(T, h);
                if (!isNaN(absHumidity) && absHumidity >= yScale.domain()[0] && absHumidity <= yScale.domain()[1]) {
                    lineData.push({ temp: T, absHumidity });
                }
            }
            const filteredLineData = lineData.filter(d => d.temp >= xScale.domain()[0] && d.temp <= xScale.domain()[1]);
            // FIX: Use 'line' directly instead of 'd3.line'
            const lineGenerator = line<ChartPoint>().x(d => xScale(d.temp)).y(d => yScale(d.absHumidity));
            if (filteredLineData.length > 1) {
                svg.append("path").datum(filteredLineData).attr("fill", "none").attr("stroke", "#f59e0b").attr("stroke-width", 0.5)
                   .attr("stroke-dasharray", "4,4").attr("d", lineGenerator);
                const labelPoint = filteredLineData[Math.floor(filteredLineData.length / 2)];
                if(labelPoint) {
                    svg.append("text").attr("x", xScale(labelPoint.temp) + 5).attr("y", yScale(labelPoint.absHumidity) - 5)
                       .text(`${convertValue(h, 'enthalpy', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('enthalpy', unitSystem))} ${enthalpyUnit}`)
                       .attr("font-size", "11px").attr("fill", "#b45309");
                }
            }
        });
        
        const formatPointLabel = (airProps: AirProperties, labelKey: string) => {
            if (!airProps || airProps.temp === null || airProps.rh === null) return '';
            const temp = convertValue(airProps.temp, 'temperature', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('temperature', unitSystem)) ?? '';
            const rh = airProps.rh.toFixed(getPrecisionForUnitType('rh', unitSystem));
            return `${t(labelKey)} (${temp}${temperatureUnit}, ${rh}%)`;
        };
        
        const addLabelWithHalo = (
            selection: Selection<SVGTextElement, unknown, null, undefined>,
            text: string, 
            color: string
        ) => {
            selection
                .text(text)
                .attr("font-size", "12px")
                .attr("font-weight", "bold")
                .attr("fill", color)
                .attr("stroke", "white")
                .attr("stroke-width", "3px")
                .attr("stroke-linejoin", "round")
                .style("paint-order", "stroke");
        };

        if (globalInletAir && globalInletAir.temp !== null && globalInletAir.absHumidity !== null) {
            svg.append("circle").attr("cx", xScale(globalInletAir.temp)).attr("cy", yScale(globalInletAir.absHumidity))
               .attr("r", 7).attr("fill", "#16a34a").attr("stroke", "#1f2937").attr("stroke-width", 1.5);
            addLabelWithHalo(
                svg.append("text").attr("x", xScale(globalInletAir.temp) + 10).attr("y", yScale(globalInletAir.absHumidity) - 10),
                formatPointLabel(globalInletAir, 'chart.acInlet'),
                "#16a34a"
            );
        }

        if (globalOutletAir && globalOutletAir.temp !== null && globalOutletAir.absHumidity !== null) {
            svg.append("circle").attr("cx", xScale(globalOutletAir.temp)).attr("cy", yScale(globalOutletAir.absHumidity))
               .attr("r", 7).attr("fill", "#dc2626").attr("stroke", "#1f2937").attr("stroke-width", 1.5);
             addLabelWithHalo(
                svg.append("text").attr("x", xScale(globalOutletAir.temp) + 10).attr("y", yScale(globalOutletAir.absHumidity) + 20),
                formatPointLabel(globalOutletAir, 'chart.acOutlet'),
                "#dc2626"
            );
        }

        airConditionsData.forEach(eq => {
            if (!eq.inletAir || !eq.outletAir || eq.inletAir.temp === null || eq.inletAir.absHumidity === null || eq.outletAir.temp === null || eq.outletAir.absHumidity === null) return;
            
            const [inletTempSI, inletAbsHumiditySI] = [eq.inletAir.temp, eq.inletAir.absHumidity];
            const [outletTempSI, outletAbsHumiditySI] = [eq.outletAir.temp, eq.outletAir.absHumidity];
            const color = EQUIPMENT_HEX_COLORS[eq.type] || defaultColor;

            svg.append("circle").attr("cx", xScale(inletTempSI)).attr("cy", yScale(inletAbsHumiditySI)).attr("r", 5).attr("fill", "#16a34a").attr("stroke", "#1f2937");
            svg.append("circle").attr("cx", xScale(outletTempSI)).attr("cy", yScale(outletAbsHumiditySI)).attr("r", 5).attr("fill", "#dc2626").attr("stroke", "#1f2937");
            svg.append("line").attr("x1", xScale(inletTempSI)).attr("y1", yScale(inletAbsHumiditySI)).attr("x2", xScale(outletTempSI)).attr("y2", yScale(outletAbsHumiditySI))
               .attr("stroke", color).attr("stroke-width", 2).attr("marker-end", `url(#arrow-${eq.id})`);
            // Individual labels removed to declutter the chart. Info is in the summary table.
        });

    }, [airConditionsData, globalInletAir, globalOutletAir, unitSystem, width, height, t]);

    return (
        <div ref={containerRef} className="w-full min-h-[400px]">
            <svg ref={svgRef}></svg>
        </div>
    );
};

export default PsychrometricChart;