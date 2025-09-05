import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
// FIX: Changed d3 import from namespace to named functions to fix module resolution errors.
import { select, scaleLinear, axisBottom, axisLeft, line, Selection, pointer } from 'd3';
import { Equipment, AirProperties, UnitSystem, ChartPoint } from '../types';
import { convertValue, getPrecisionForUnitType } from '../utils/conversions';
import { calculateAbsoluteHumidity, calculateAbsoluteHumidityFromEnthalpy, PSYCH_CONSTANTS } from '../services/psychrometrics';
import { useLanguage } from '../i18n';
import { EQUIPMENT_HEX_COLORS } from '../constants';

interface PsychrometricChartProps {
    airConditionsData: Equipment[];
    globalInletAir: AirProperties;
    globalOutletAir: AirProperties;
    unitSystem: UnitSystem;
    isSplitViewActive: boolean;
}

const PsychrometricChart: React.FC<PsychrometricChartProps> = ({ airConditionsData, globalInletAir, globalOutletAir, unitSystem, isSplitViewActive }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { t } = useLanguage();
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
    const [hoveredEnthalpy, setHoveredEnthalpy] = useState<number | null>(null);
    const [hoveredAbsHumidity, setHoveredAbsHumidity] = useState<number | null>(null);


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

    const margin = { top: 20, right: 50, bottom: 60, left: 60 };
    const width = dimensions.width > (margin.left + margin.right) ? dimensions.width - margin.left - margin.right : 0;
    const height = dimensions.height > (margin.top + margin.bottom) ? dimensions.height - margin.top - margin.bottom : 0;


    useEffect(() => {
        if (!svgRef.current || width <= 0 || height <= 0) return;

        const temperatureUnit = t(`units.${unitSystem}.temperature`);
        const absHumidityUnit = t(`units.${unitSystem}.abs_humidity`);
        const enthalpyUnit = t(`units.${unitSystem}.enthalpy`);

        const svgSelection = select(svgRef.current);
        svgSelection.selectAll("*").remove();

        // Add a mouseleave event to the entire SVG container to ensure the tooltip is cleared
        // when the mouse leaves the chart area. This prevents "sticky" tooltips.
        svgSelection.on('mouseleave', () => {
            setHoveredEnthalpy(null);
            setHoveredAbsHumidity(null);
            setTooltip(null);
        });

        const svg = svgSelection
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const xScale = scaleLinear().domain([-20, 60]).range([0, width]);
        const yScale = scaleLinear().domain([0, 30]).range([height, 0]);

        const xAxis = svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(axisBottom(xScale).ticks(10).tickFormat(d => `${convertValue(d as number, 'temperature', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('temperature', unitSystem))}`))
        
        xAxis.selectAll("path").style("stroke", "#64748b");
        xAxis.selectAll("line").style("stroke", "#64748b");
        xAxis.selectAll("text").style("fill", "#475569").style("font-size", "12px");
        xAxis.append("text")
            .attr("y", 40).attr("x", width / 2).attr("fill", "#334155").attr("font-size", "14px").attr("text-anchor", "middle")
            .text(`${t('chart.xAxisLabel')} (${temperatureUnit})`);

        const yAxis = svg.append("g")
            .call(axisLeft(yScale).ticks(6).tickFormat(d =>
                isSplitViewActive
                    ? ''
                    : `${convertValue(d as number, 'abs_humidity', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('abs_humidity', unitSystem))}`
            ));
            
        yAxis.selectAll("path").style("stroke", "#64748b");
        yAxis.selectAll("line").style("stroke", "#64748b");
        yAxis.selectAll("text").style("fill", "#475569").style("font-size", "12px");

        if (!isSplitViewActive) {
             yAxis.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", -margin.left + 15)
                .attr("x", -height / 2)
                .attr("fill", "#334155")
                .attr("font-size", "14px")
                .attr("text-anchor", "middle")
                .text(`${t('chart.yAxisLabel')} (${absHumidityUnit})`);
        }

        svg.append("g").attr("class", "grid x-grid").attr("transform", `translate(0,${height})`).call(axisBottom(xScale).ticks(10).tickSize(-height).tickFormat(() => "")).selectAll("line").style("stroke", "#e2e8f0");
        
        const yGridTicks = yScale.ticks(6);
        const yGrid = svg.append("g").attr("class", "grid y-grid");
        
        yGrid.selectAll("line")
            .data(yGridTicks)
            .join("line")
            .attr("x1", 0)
            .attr("x2", width)
            .attr("y1", d => yScale(d))
            .attr("y2", d => yScale(d))
            .style("stroke", d => (isSplitViewActive && hoveredAbsHumidity === d) ? "#94a3b8" : "#e2e8f0")
            .style("stroke-width", d => (isSplitViewActive && hoveredAbsHumidity === d) ? 1.5 : 1);

        if (isSplitViewActive) {
            yGrid.selectAll("rect")
                 .data(yGridTicks)
                 .join("rect")
                 .attr("x", 0)
                 .attr("y", d => yScale(d) - 5)
                 .attr("width", width)
                 .attr("height", 10)
                 .attr("fill", "transparent")
                 .style("cursor", "pointer")
                 .on('mouseover', (event, d) => {
                     setHoveredAbsHumidity(d);
                 })
                 .on('mousemove', (event, d) => {
                     const [x, y] = pointer(event, svg.node());
                     const formattedValue = `${convertValue(d as number, 'abs_humidity', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('abs_humidity', unitSystem))} ${absHumidityUnit}`;
                     setTooltip({ x: x + margin.left, y: y + margin.top, content: formattedValue });
                 })
                 .on('mouseout', () => {
                     setHoveredAbsHumidity(null);
                     setTooltip(null);
                 });
        }


        const defs = svg.append("defs");
        const defaultColor = '#2563eb';

        const rhLines = [20, 40, 60, 80, 100];
        rhLines.forEach(rh => {
            const lineData: ChartPoint[] = [];
            for (let T = -20; T <= 60; T += 1) {
                const absHumidity = calculateAbsoluteHumidity(T, rh);
                if (absHumidity >= yScale.domain()[0] && absHumidity <= yScale.domain()[1]) {
                    lineData.push({ temp: T, absHumidity });
                }
            }
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
        const enthalpyGroup = svg.append("g");
        
        const hForAngle = 60;
        const p1_temp_angle = -20;
        const p1_hum_angle = calculateAbsoluteHumidityFromEnthalpy(p1_temp_angle, hForAngle);
        const p2_hum_angle = 0;
        const p2_temp_angle = hForAngle / PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR;
        const p1_screen = { x: xScale(p1_temp_angle), y: yScale(p1_hum_angle) };
        const p2_screen = { x: xScale(p2_temp_angle), y: yScale(p2_hum_angle) };
        const angleRad = Math.atan2(p2_screen.y - p1_screen.y, p2_screen.x - p1_screen.x);
        const angleDeg = angleRad * 180 / Math.PI;

        enthalpyLines.forEach(h => {
            const lineData: ChartPoint[] = [];
            for (let T = -20; T <= 60; T += 1) {
                const absHumidity = calculateAbsoluteHumidityFromEnthalpy(T, h);
                if (!isNaN(absHumidity) && absHumidity >= yScale.domain()[0] && absHumidity <= yScale.domain()[1]) {
                    lineData.push({ temp: T, absHumidity });
                }
            }
            const filteredLineData = lineData.filter(d => d.temp >= xScale.domain()[0] && d.temp <= xScale.domain()[1]);
            const lineGenerator = line<ChartPoint>().x(d => xScale(d.temp)).y(d => yScale(d.absHumidity));
            if (filteredLineData.length > 1) {
                enthalpyGroup.append("path").datum(filteredLineData)
                   .attr("fill", "none")
                   .attr("stroke", (isSplitViewActive && hoveredEnthalpy === h) ? "#f97316" : "#f59e0b")
                   .attr("stroke-width", (isSplitViewActive && hoveredEnthalpy === h) ? 2 : 0.5)
                   .attr("stroke-dasharray", "4,4")
                   .attr("d", lineGenerator)
                   .style("pointer-events", "none");

                if (isSplitViewActive) {
                     enthalpyGroup.append("path").datum(filteredLineData)
                        .attr("fill", "none")
                        .attr("stroke", "transparent")
                        .attr("stroke-width", 10)
                        .attr("d", lineGenerator)
                        .style("cursor", "pointer")
                        .on('mouseover', () => {
                            setHoveredEnthalpy(h);
                        })
                        .on('mousemove', (event) => {
                            const [x, y] = pointer(event, svg.node());
                            const formattedValue = `${convertValue(h, 'enthalpy', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('enthalpy', unitSystem))} ${enthalpyUnit}`;
                            setTooltip({ x: x + margin.left, y: y + margin.top, content: formattedValue });
                        })
                        .on('mouseout', () => {
                            setHoveredEnthalpy(null);
                            setTooltip(null);
                        });
                } else {
                    const [tempDomainMin, tempDomainMax] = xScale.domain();
                    const [humDomainMin, humDomainMax] = yScale.domain();
                    
                    let xPos, yPos;
                    let foundPosition = false;
                    let onLeftBorder = false;

                    const humAtMinTemp = calculateAbsoluteHumidityFromEnthalpy(tempDomainMin, h);
                    if (humAtMinTemp >= humDomainMin && humAtMinTemp <= humDomainMax) {
                        xPos = xScale(tempDomainMin);
                        yPos = yScale(humAtMinTemp);
                        foundPosition = true;
                        onLeftBorder = true;
                    }

                    if (!foundPosition) {
                         const tempAtMaxHum = (h - (humDomainMax/1000) * PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C) / (PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + (humDomainMax/1000) * PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR);
                         if (tempAtMaxHum >= tempDomainMin && tempAtMaxHum <= tempDomainMax) {
                            xPos = xScale(tempAtMaxHum);
                            yPos = yScale(humDomainMax);
                            foundPosition = true;
                         }
                    }

                    if (foundPosition) {
                        const textElement = svg.append("text")
                           .attr("transform", `translate(${xPos}, ${yPos}) rotate(${angleDeg})`)
                           .attr("dominant-baseline", "middle")
                           .attr("fill", "#f97316")
                           .attr("font-size", "11px")
                           .text(`${convertValue(h, 'enthalpy', UnitSystem.SI, unitSystem)?.toFixed(0)} ${enthalpyUnit}`);
                        
                        if (onLeftBorder) {
                            textElement.attr("text-anchor", "start").attr("dy", "-0.5em");
                        } else {
                            textElement.attr("text-anchor", "start").attr("dy", "-0.7em");
                        }
                    }
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
            
            const marker = defs.append("marker")
                .attr("id", `arrow-${eq.id}`)
                .attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("refY", 0)
                .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse");
            marker.append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", color);

            svg.append("circle").attr("cx", xScale(inletTempSI)).attr("cy", yScale(inletAbsHumiditySI)).attr("r", 5).attr("fill", "#16a34a").attr("stroke", "#1f2937");
            svg.append("circle").attr("cx", xScale(outletTempSI)).attr("cy", yScale(outletAbsHumiditySI)).attr("r", 5).attr("fill", "#dc2626").attr("stroke", "#1f2937");
            svg.append("line").attr("x1", xScale(inletTempSI)).attr("y1", yScale(inletAbsHumiditySI)).attr("x2", xScale(outletTempSI)).attr("y2", yScale(outletAbsHumiditySI))
               .attr("stroke", color).attr("stroke-width", 2.5).attr("marker-end", `url(#arrow-${eq.id})`);
        });

    }, [airConditionsData, globalInletAir, globalOutletAir, unitSystem, width, height, t, isSplitViewActive, hoveredEnthalpy, hoveredAbsHumidity]);

    return (
        <div ref={containerRef} className="w-full min-h-[400px] relative">
            {isSplitViewActive && tooltip && (
                <div
                    className="absolute z-10 p-2 bg-slate-800 text-white text-xs rounded-md shadow-lg pointer-events-none"
                    style={{
                        left: `${tooltip.x}px`,
                        top: `${tooltip.y}px`,
                        transform: 'translate(10px, -28px)',
                    }}
                >
                    {tooltip.content}
                </div>
            )}
            <svg ref={svgRef}></svg>
        </div>
    );
};

export default PsychrometricChart;