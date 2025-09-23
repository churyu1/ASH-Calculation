


import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';
import { select, scaleLinear, axisBottom, axisLeft, line, Selection, pointer, drag } from 'd3';
import { Equipment, AirProperties, UnitSystem, ChartPoint, EquipmentType, BurnerConditions, SteamHumidifierConditions, CoolingCoilConditions, HeatingCoilConditions } from '../types';
import { convertValue, getPrecisionForUnitType } from '../utils/conversions.ts';
import { calculateAirProperties, calculateAbsoluteHumidity, calculateAbsoluteHumidityFromEnthalpy, calculateEnthalpy, PSYCH_CONSTANTS, calculateSteamProperties, calculateDewPoint, calculateRelativeHumidity } from '../services/psychrometrics.ts';
import { useLanguage } from '../i18n/index.ts';
import { EQUIPMENT_HEX_COLORS } from '../constants.ts';

interface PsychrometricChartProps {
    airConditionsData: Equipment[];
    globalInletAir: AirProperties;
    globalOutletAir: AirProperties;
    unitSystem: UnitSystem;
    isSplitViewActive: boolean;
    onUpdate: (id: number, updates: { inlet?: AirProperties, outlet?: AirProperties }) => void;
}

export const PsychrometricChart: React.FC<PsychrometricChartProps> = ({ airConditionsData, globalInletAir, globalOutletAir, unitSystem, isSplitViewActive, onUpdate }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { t } = useLanguage();
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const snapTargetsRef = useRef<{ points: any[]; lines: any[] }>({ points: [], lines: [] });
    const dragInProgress = useRef(false);

    useLayoutEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                if (clientWidth > 0 && clientHeight > 0) {
                    setDimensions({
                        width: clientWidth,
                        height: clientHeight,
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

    const findAnalyticalIntersection = (
        lineEq: { type: EquipmentType; fixedPoint: AirProperties; conditions: any; },
        curveEq: { type: EquipmentType; enthalpy: number | null; },
        projectedTemp: number // To choose the right solution
    ): { temp: number; absHumidity: number } | null => {
    
        const burner = lineEq.type === EquipmentType.BURNER ? lineEq : null;
        const washer = curveEq.type === EquipmentType.SPRAY_WASHER && curveEq.enthalpy !== null ? curveEq : null;
    
        if (!burner || !washer || burner.fixedPoint.temp === null || burner.fixedPoint.absHumidity === null) return null;
    
        const { shf = 1.0 } = burner.conditions as BurnerConditions;
    
        // Effective SHF calculation at drag start
        let m: number; // slope dx/dt in data units
        if (shf >= 1.0) {
            m = 0;
        } else {
            const Cpa = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR;
            const L = PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C;
            m = (1 / shf - 1) * (Cpa / (L / 1000));
        }

        // Line equation: x = m*t + c
        const c = burner.fixedPoint.absHumidity - m * burner.fixedPoint.temp;
    
        // From h = 1.006*t + (x/1000)*(2501 + 1.86*t), substitute x = m*t + c
        // This gives the quadratic equation: A*t^2 + B*t + C = 0
        const A = 1.86 * m;
        const B = 1006 + 2501 * m + 1.86 * c;
        const C_quad = 2501 * c - 1000 * washer.enthalpy!;
    
        // If m is 0 (SHF=1), it's a linear equation, not quadratic.
        if (Math.abs(A) < 1e-9) {
            if (Math.abs(B) < 1e-9) return null; // No solution
            const t = -C_quad / B;
            return { temp: t, absHumidity: c };
        }
    
        const discriminant = B * B - 4 * A * C_quad;
        if (discriminant < 0) return null; // No real intersection
    
        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t1 = (-B + sqrtDiscriminant) / (2 * A);
        const t2 = (-B - sqrtDiscriminant) / (2 * A);
    
        if (isNaN(t1) && isNaN(t2)) return null;

        // Choose solution closer to the projected mouse temperature
        let chosenT;
        if (isNaN(t1)) {
            chosenT = t2;
        } else if (isNaN(t2)) {
            chosenT = t1;
        } else {
            const dist1 = Math.abs(t1 - projectedTemp);
            const dist2 = Math.abs(t2 - projectedTemp);
            chosenT = dist1 < dist2 ? t1 : t2;
        }
    
        if (isNaN(chosenT)) return null;
    
        return { temp: chosenT, absHumidity: m * chosenT + c };
    };


    useEffect(() => {
        const { width: containerWidth, height: containerHeight } = dimensions;
        if (!svgRef.current || !containerRef.current || containerWidth <= 0 || containerHeight <= 0) return;

        const uniqueSuffix = Math.random().toString(36).substring(2, 9);
        const uniqueEquipmentTypesOnChart = Array.from(new Set(
            airConditionsData
                .filter(eq =>
                    ![EquipmentType.FILTER].includes(eq.type) &&
                    eq.inletAir.temp !== null &&
                    eq.outletAir.temp !== null
                )
                .map(eq => eq.type)
        ));

        const fixedHorizontalMargin = { left: 60, right: 50 };
        const chartAreaWidth = containerWidth - fixedHorizontalMargin.left - fixedHorizontalMargin.right;
        
        let legendHeight = 0;
        if (uniqueEquipmentTypesOnChart.length > 0 && chartAreaWidth > 0) {
            const legendLineHeight = 18;
            const legendItemSpacing = 15;
            let legendXOffset = 0;
            let legendLines = 1;

            const tempSvg = select(document.body).append('svg').attr('class', 'temp-text-measurement').style('position', 'absolute').style('visibility', 'hidden');

            uniqueEquipmentTypesOnChart.forEach(type => {
                const name = t(`equipmentNames.${type}`);
                const textEl = tempSvg.append('text').style('font-size', '12px').text(name);
                const textWidth = textEl.node()?.getBBox().width ?? 0;
                textEl.remove();
                
                const itemWidth = 15 + 5 + textWidth; // rect width + padding + text width

                if (legendXOffset > 0 && legendXOffset + itemWidth + legendItemSpacing > chartAreaWidth) {
                    legendXOffset = 0;
                    legendLines++;
                }
                legendXOffset += itemWidth + legendItemSpacing;
            });

            tempSvg.remove();
            legendHeight = legendLines * legendLineHeight;
        }

        const calculatedMarginTop = 15 + legendHeight + 15; // top padding + legend height + bottom padding
        const margin = {
            top: Math.max(60, calculatedMarginTop),
            right: fixedHorizontalMargin.right,
            bottom: 60,
            left: fixedHorizontalMargin.left
        };

        const width = chartAreaWidth;
        const height = containerHeight - margin.top - margin.bottom;

        const svgSelection = select(svgRef.current);
        svgSelection.selectAll("*").remove();

        if (width <= 0 || height <= 0) return;
        
        const isNarrow = width < 500;
        const numTicksX = Math.max(4, Math.round(width / 80));
        const showYAxisMeta = !isNarrow;
        const rhLinesToLabel = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const showEnthalpyLabels = width > 600;
        const enthalpyLines = width < 400 ? [20, 60, 100] : (width < 600 ? [0, 20, 40, 60, 80, 100, 120] : [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);


        const themeColors = {
            axis: '#64748b',
            axisText: '#475569',
            axisLabel: '#334155',
            grid: '#e2e8f0',
            rhLine: '#94a3b8',
            rhLabel: '#64748b',
            enthalpyLine: '#f59e0b',
            enthalpyLabel: '#f97316',
            halo: 'rgba(255, 255, 255, 0.8)',
            pointStroke: '#1f2937'
        };

        const temperatureUnit = t(`units.${unitSystem}.temperature`);
        const absHumidityUnit = t(`units.${unitSystem}.abs_humidity`);
        const enthalpyUnit = t(`units.${unitSystem}.enthalpy`);

        select(containerRef.current).select(".chart-tooltip").remove();

        const tooltip = select(containerRef.current)
            .append("div")
            .attr("class", "chart-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background", "rgba(31, 41, 55, 0.9)")
            .style("color", "white")
            .style("padding", "4px 8px")
            .style("border-radius", "4px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "10");

        const svg = svgSelection
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        const previewGroup = svg.append("g").attr("class", "drag-preview-group");
        const tempIndicatorGroup = svg.append("g").attr("class", "temp-indicator-group");

        if (uniqueEquipmentTypesOnChart.length > 0) {
            const legendGroup = svg.append("g")
                .attr("class", "chart-legend")
                .attr("transform", `translate(0, -${margin.top - 15})`);
        
            let legendXOffset = 0;
            let legendYOffset = 0;
            const legendLineHeight = 18;
            const legendItemSpacing = 15;
        
            uniqueEquipmentTypesOnChart.forEach(type => {
                const color = EQUIPMENT_HEX_COLORS[type];
                const name = t(`equipmentNames.${type}`);
        
                // Create a dummy text element to measure its width
                const tempText = svg.append("text").text(name).style("font-size", "12px").style("opacity", 0);
                const textWidth = tempText.node()?.getBBox().width ?? 0;
                tempText.remove(); // Remove the dummy element
        
                // Calculate the full width of the legend item (rect + padding + text)
                const itemWidth = 15 + 5 + textWidth; 
        
                // Check if the item needs to wrap to the next line
                if (legendXOffset > 0 && legendXOffset + itemWidth + legendItemSpacing > width) {
                    legendXOffset = 0;
                    legendYOffset += legendLineHeight;
                }
        
                const itemGroup = legendGroup.append("g")
                    .attr("transform", `translate(${legendXOffset}, ${legendYOffset})`);
        
                itemGroup.append("rect")
                    .attr("width", 15)
                    .attr("height", 10)
                    .attr("y", -5)
                    .attr("fill", color)
                    .attr("rx", 2);
        
                itemGroup.append("text")
                    .attr("x", 20)
                    .attr("y", 4)
                    .text(name)
                    .style("font-size", "12px")
                    .attr("fill", themeColors.axisLabel)
                    .attr("text-anchor", "start");
                
                // Update the x-offset for the next item
                legendXOffset += itemWidth + legendItemSpacing;
            });
        }

        const xScale = scaleLinear().domain([-20, 60]).range([0, width]);
        const yScale = scaleLinear().domain([0, 30]).range([height, 0]);

        const xAxis = svg.append("g")
            .attr("transform", `translate(0,${height})`)
            // FIX: Explicitly type 'd' to avoid potential TypeScript errors with d3's complex types.
            .call(axisBottom(xScale).ticks(numTicksX).tickFormat((d: number | { valueOf(): number }) => `${convertValue(Number(d), 'temperature', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('temperature', unitSystem))}`))
        
        xAxis.selectAll("path").style("stroke", themeColors.axis);
        xAxis.selectAll("line").style("stroke", themeColors.axis);
        xAxis.selectAll("text").style("fill", themeColors.axisText).style("font-size", "12px");
        xAxis.append("text")
            .attr("y", 40).attr("x", width / 2).attr("fill", themeColors.axisLabel).attr("font-size", "14px").attr("text-anchor", "middle")
            .text(`${t('chart.xAxisLabel')} (${temperatureUnit})`);

        const yAxis = svg.append("g")
            .call(axisLeft(yScale).ticks(6).tickFormat((d: number | { valueOf(): number }) =>
                showYAxisMeta
                    ? `${convertValue(Number(d), 'abs_humidity', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('abs_humidity', unitSystem))}`
                    : ''
            ));
            
        yAxis.selectAll("path").style("stroke", themeColors.axis);
        yAxis.selectAll("line").style("stroke", themeColors.axis);
        yAxis.selectAll("text").style("fill", themeColors.axisText).style("font-size", "12px");

        if (showYAxisMeta) {
             yAxis.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", -margin.left + 15)
                .attr("x", -height / 2)
                .attr("fill", themeColors.axisLabel)
                .attr("font-size", "14px")
                .attr("text-anchor", "middle")
                .text(`${t('chart.yAxisLabel')} (${absHumidityUnit})`);
        }
        
        const SNAP_RADIUS = 15;

        const snapHighlight = svg.append("circle")
            .attr("class", "snap-highlight")
            .attr("r", 12)
            .attr("fill", "rgba(0, 123, 255, 0.3)")
            .attr("stroke", "rgba(0, 123, 255, 0.8)")
            .attr("stroke-width", 2)
            .style("pointer-events", "none")
            .style("display", "none");
        
        const showWaterTempIndicator = (equipment: Equipment) => {
            tempIndicatorGroup.selectAll("*").remove();
        
            let temp: number | undefined;
            let label: string | undefined;
            let color: string | undefined;
        
            if (equipment.type === EquipmentType.COOLING_COIL) {
                const conditions = equipment.conditions as CoolingCoilConditions;
                temp = conditions.chilledWaterInletTemp;
                label = t('conditions.chilledWaterInletTemp');
                color = '#3b82f6'; // blue-500
            } else if (equipment.type === EquipmentType.HEATING_COIL) {
                const conditions = equipment.conditions as HeatingCoilConditions;
                temp = conditions.hotWaterInletTemp;
                label = t('conditions.hotWaterInletTemp');
                color = '#ef4444'; // red-500
            }
        
            if (temp !== undefined && temp !== null && label && color) {
                const xPos = xScale(temp);
                if (xPos >= 0 && xPos <= width) {
                    tempIndicatorGroup.append("line")
                        .attr("x1", xPos).attr("y1", 0)
                        .attr("x2", xPos).attr("y2", height)
                        .attr("stroke", color).attr("stroke-width", 1.5)
                        .attr("stroke-dasharray", "4,4").style("pointer-events", "none");
        
                    const textEl = tempIndicatorGroup.append("text")
                        .attr("x", xPos).attr("y", -5)
                        .attr("text-anchor", "middle").attr("fill", color)
                        .style("font-size", "12px").style("font-weight", "500").text(label);
                    
                    textEl.clone(true).lower()
                          .attr('stroke', themeColors.halo)
                          .attr('stroke-width', 3)
                          .attr('stroke-linejoin', 'round');
                }
            }
        };

        const hideWaterTempIndicator = () => {
            tempIndicatorGroup.selectAll("*").remove();
        };

        const findClosestSnapPoint = (x: number, y: number, targets: any[], radius: number) => {
            let closestPoint = null;
            let minDistance = radius;
            for (const target of targets) {
                const dx = target.x - x;
                const dy = target.y - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPoint = { ...target, distance: minDistance };
                }
            }
            return closestPoint;
        };
        
        const findRaySegmentIntersection = (
            rayOriginX: number, rayOriginY: number, 
            rayPointX: number, rayPointY: number, 
            segP1X: number, segP1Y: number, 
            segP2X: number, segP2Y: number
        ): { x: number; y: number } | null => {
            const v1x = rayPointX - rayOriginX;
            const v1y = rayPointY - rayOriginY;
            const v2x = segP2X - segP1X;
            const v2y = segP2Y - segP1Y;
            
            // Check if ray has zero length
            if (Math.abs(v1x) < 1e-9 && Math.abs(v1y) < 1e-9) {
                return null;
            }
        
            const den = v1x * v2y - v1y * v2x;
            if (Math.abs(den) < 1e-9) {
                return null; // Parallel or collinear
            }
        
            const t = ((segP1X - rayOriginX) * v2y - (segP1Y - rayOriginY) * v2x) / den;
            const u = ((segP1X - rayOriginX) * v1y - (segP1Y - rayOriginY) * v1x) / den;
        
            if (t >= 0 && u >= 0 && u <= 1) { // t>=0 for ray, 0<=u<=1 for segment
                return {
                    x: rayOriginX + t * v1x,
                    y: rayOriginY + t * v1y,
                };
            }
        
            return null;
        };

        const generateSnapTargets = (excludeId: number) => {
            const pointTargets: any[] = [];
            const lineTargets: any[] = [];

            if (globalInletAir.temp !== null && globalInletAir.absHumidity !== null) {
                pointTargets.push({ id: 'global-inlet', type: 'point', x: xScale(globalInletAir.temp), y: yScale(globalInletAir.absHumidity), ...globalInletAir });
            }
            if (globalOutletAir.temp !== null && globalOutletAir.absHumidity !== null) {
                pointTargets.push({ id: 'global-outlet', type: 'point', x: xScale(globalOutletAir.temp), y: yScale(globalOutletAir.absHumidity), ...globalOutletAir });
            }
            airConditionsData.forEach(eq => {
                if (eq.id === excludeId) return;
                
                const hasInlet = eq.inletAir.temp !== null && eq.inletAir.absHumidity !== null;
                const hasOutlet = eq.outletAir.temp !== null && eq.outletAir.absHumidity !== null;

                if (hasInlet) {
                    pointTargets.push({ id: `${eq.id}-inlet`, type: 'point', x: xScale(eq.inletAir.temp), y: yScale(eq.inletAir.absHumidity), ...eq.inletAir });
                }
                if (hasOutlet) {
                    pointTargets.push({ id: `${eq.id}-outlet`, type: 'point', x: xScale(eq.outletAir.temp), y: yScale(eq.outletAir.absHumidity), ...eq.outletAir });
                }
                if(hasInlet && hasOutlet) {
                    lineTargets.push({
                        id: `${eq.id}-line`,
                        type: 'line',
                        p1: { x: xScale(eq.inletAir.temp!), y: yScale(eq.inletAir.absHumidity!) },
                        p2: { x: xScale(eq.outletAir.temp!), y: yScale(eq.outletAir.absHumidity!) },
                        equipment: eq
                    });
                }
            });
            snapTargetsRef.current = { points: pointTargets, lines: lineTargets };
        };

        svg.append("g").attr("class", "grid x-grid").attr("transform", `translate(0,${height})`).call(axisBottom(xScale).ticks(numTicksX).tickSize(-height).tickFormat(() => "")).selectAll("line").style("stroke", themeColors.grid);
        
        const yGridTicks = yScale.ticks(6);
        const yGrid = svg.append("g").attr("class", "grid y-grid");
        
        yGrid.selectAll("line")
            .data(yGridTicks)
            .join("line")
            .attr("x1", 0)
            .attr("x2", width)
            .attr("y1", d => yScale(d))
            .attr("y2", d => yScale(d))
            .style("stroke", themeColors.grid)
            .style("stroke-width", 1);

        const defs = svg.append("defs");
        const defaultColor = '#2563eb';

        const rhLines = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        
        rhLines.forEach(rh => {
            const lineData: ChartPoint[] = [];
            for (let T = -20; T <= 60; T += 1) {
                const absHumidity = calculateAbsoluteHumidity(T, rh);
                if (absHumidity >= yScale.domain()[0] && absHumidity <= yScale.domain()[1]) {
                    lineData.push({ temp: T, absHumidity });
                }
            }
            const lineGenerator = line<ChartPoint>().x(d => xScale(d.temp)).y(d => yScale(d.absHumidity));
            svg.append("path").datum(lineData).attr("fill", "none").attr("stroke", themeColors.rhLine).attr("stroke-width", 0.5)
               .attr("stroke-dasharray", rh === 100 ? "0" : "2,2").attr("d", lineGenerator);
            
            if (lineData.length > 0 && rhLinesToLabel.includes(rh)) {
                let labelPoint: ChartPoint | null = null;
                let labelPointIndex = -1;
                for (let i = lineData.length - 1; i >= 0; i--) {
                    const point = lineData[i];
                    if (xScale(point.temp) < width - 10) { 
                        labelPoint = point;
                        labelPointIndex = i;
                        break;
                    }
                }
                 if (!labelPoint && lineData.length > 0) {
                    labelPoint = lineData[lineData.length - 1];
                    labelPointIndex = lineData.length - 1;
                 }

                if (labelPoint) {
                    let angleDeg = 0;
                    if (labelPointIndex > 0) {
                        const prevPoint = lineData[labelPointIndex - 1];
                        const p_label = { x: xScale(labelPoint.temp), y: yScale(labelPoint.absHumidity) };
                        const p_prev = { x: xScale(prevPoint.temp), y: yScale(prevPoint.absHumidity) };
                        const angleRad = Math.atan2(p_label.y - p_prev.y, p_label.x - p_prev.x);
                        angleDeg = angleRad * 180 / Math.PI;
                    }

                    const labelX = xScale(labelPoint.temp);
                    const labelY = yScale(labelPoint.absHumidity);
                    
                    const textEl = svg.append("text")
                       .attr("transform", `translate(${labelX}, ${labelY}) rotate(${angleDeg})`)
                       .attr("dx", "5")
                       .attr("dy", "-3")
                       .attr("text-anchor", "start")
                       .attr("dominant-baseline", "middle")
                       .text(`${rh}%`)
                       .attr("font-size", "11px")
                       .attr("fill", themeColors.rhLabel);
                    
                    textEl.clone(true).lower()
                          .attr('stroke', themeColors.halo)
                          .attr('stroke-width', 3)
                          .attr('stroke-linejoin', 'round');
                }
            }
        });

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
                   .attr("stroke", themeColors.enthalpyLine)
                   .attr("stroke-width", 0.5)
                   .attr("stroke-dasharray", "4,4")
                   .attr("d", lineGenerator)
                   .style("pointer-events", "none");

                if (showEnthalpyLabels) {
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
                        // Hide labels for 110 and 120 to prevent overlap
                        if (h < 110) {
                            const textElement = svg.append("text")
                               .attr("transform", `translate(${xPos}, ${yPos}) rotate(${angleDeg})`)
                               .attr("dominant-baseline", "middle")
                               .attr("fill", themeColors.enthalpyLabel)
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
                .attr("stroke", themeColors.halo)
                .attr("stroke-width", "3px")
                .attr("stroke-linejoin", "round")
                .style("paint-order", "stroke");
        };

        if (globalInletAir && globalInletAir.temp !== null && globalInletAir.absHumidity !== null) {
            svg.append("circle").attr("cx", xScale(globalInletAir.temp)).attr("cy", yScale(globalInletAir.absHumidity))
               .attr("r", 7).attr("fill", "#16a34a").attr("stroke", themeColors.pointStroke).attr("stroke-width", 1.5);
            addLabelWithHalo(
                svg.append("text").attr("x", xScale(globalInletAir.temp) + 10).attr("y", yScale(globalInletAir.absHumidity) - 10),
                formatPointLabel(globalInletAir, 'chart.acInlet'),
                "#16a34a"
            );
        }

        if (globalOutletAir && globalOutletAir.temp !== null && globalOutletAir.absHumidity !== null) {
            svg.append("circle").attr("cx", xScale(globalOutletAir.temp)).attr("cy", yScale(globalOutletAir.absHumidity))
               .attr("r", 7).attr("fill", "#dc2626").attr("stroke", themeColors.pointStroke).attr("stroke-width", 1.5);
             addLabelWithHalo(
                svg.append("text").attr("x", xScale(globalOutletAir.temp) + 10).attr("y", yScale(globalOutletAir.absHumidity) + 20),
                formatPointLabel(globalOutletAir, 'chart.acOutlet'),
                "#dc2626"
            );
        }

        const generatePreviewPath = (equipment: Equipment, handleType: 'inlet' | 'outlet'): ChartPoint[] | null => {
            const [tempDomainMin, tempDomainMax] = xScale.domain();
            const path: ChartPoint[] = [];

            const startPoint = handleType === 'inlet' ? equipment.outletAir : equipment.inletAir;
            
            if (startPoint.temp === null || startPoint.absHumidity === null) return null;

            switch (equipment.type) {
                case EquipmentType.HEATING_COIL: {
                    const { hotWaterInletTemp = 80 } = equipment.conditions as HeatingCoilConditions;
                    if (handleType === 'outlet') {
                        const maxOutletTemp = Math.min(tempDomainMax, hotWaterInletTemp);
                        path.push({ temp: startPoint.temp, absHumidity: startPoint.absHumidity });
                        path.push({ temp: maxOutletTemp, absHumidity: startPoint.absHumidity });
                    } else { // inlet drag
                        path.push({ temp: tempDomainMin, absHumidity: startPoint.absHumidity });
                        path.push({ temp: startPoint.temp, absHumidity: startPoint.absHumidity });
                    }
                    break;
                }
                case EquipmentType.COOLING_COIL:
                    if (handleType === 'outlet') {
                        const { bypassFactor = 5, chilledWaterInletTemp = 7 } = equipment.conditions as CoolingCoilConditions;
                        const BF = bypassFactor / 100;
                        const { temp: T_in, absHumidity: x_in } = startPoint;
                        
                        const minOutletTemp = Math.max(tempDomainMin, chilledWaterInletTemp);
                        const inletDewPoint = calculateDewPoint(x_in);

                        for (let t_out = T_in; t_out >= minOutletTemp; t_out -= 0.5) {
                            let x_out: number;
                            
                            let t_adp: number | undefined;
                            if (BF < 1.0 && (T_in - t_out) > 0.01) {
                                t_adp = (t_out - T_in * BF) / (1 - BF);
                            }
                
                            if (t_adp !== undefined && t_adp < inletDewPoint) {
                                // Dehumidification process
                                const x_adp = calculateAbsoluteHumidity(t_adp, 100);
                                x_out = x_adp * (1 - BF) + x_in * BF;
                            } else {
                                // Sensible cooling only
                                x_out = x_in;
                            }

                            const saturationHumidity = calculateAbsoluteHumidity(t_out, 100);
                            if (x_out > saturationHumidity) {
                                x_out = saturationHumidity;
                            }
                            path.push({ temp: t_out, absHumidity: x_out });
                        }
                    } else { // Inlet hover
                        path.push({ temp: startPoint.temp, absHumidity: startPoint.absHumidity });
                        path.push({ temp: tempDomainMax, absHumidity: startPoint.absHumidity });
                    }
                    break;
                case EquipmentType.BURNER: {
                    const { shf = 1.0 } = equipment.conditions as BurnerConditions;
                    let slope = 0;
                    if (shf > 0 && shf < 1.0) {
                        slope = (1 / shf - 1) * (PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR / (PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C / 1000));
                    }
                    const t1 = tempDomainMin;
                    const x1 = startPoint.absHumidity + slope * (t1 - startPoint.temp);
                    path.push({ temp: t1, absHumidity: x1 });

                    const t2 = tempDomainMax;
                    const x2 = startPoint.absHumidity + slope * (t2 - startPoint.temp);
                    path.push({ temp: t2, absHumidity: x2 });
                    break;
                }
                case EquipmentType.SPRAY_WASHER: {
                    const h = calculateEnthalpy(startPoint.temp, startPoint.absHumidity);
                    for (let t = tempDomainMax; t >= tempDomainMin; t -= 1) {
                        const x = calculateAbsoluteHumidityFromEnthalpy(t, h);
                        if (x >= yScale.domain()[0] && x <= yScale.domain()[1]) {
                           path.push({ temp: t, absHumidity: x });
                        }
                    }
                    break;
                }
                case EquipmentType.STEAM_HUMIDIFIER: {
                    const steamCond = equipment.conditions as SteamHumidifierConditions;
                    const steamProps = calculateSteamProperties(steamCond.steamGaugePressure ?? 100);
                    const h_steam = steamProps.enthalpy;
                    const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * (startPoint.absHumidity / 1000);
                    const h_vapor = PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * startPoint.temp;
                    const denominator = h_steam - h_vapor;
                    let slope = 0;
                    if (Math.abs(denominator) > 0.1) {
                         slope = (1000 * c_pa_moist) / denominator;
                    }

                    const t1 = tempDomainMin;
                    const x1 = startPoint.absHumidity + slope * (t1 - startPoint.temp);
                    path.push({ temp: t1, absHumidity: x1 });

                    const t2 = tempDomainMax;
                    const x2 = startPoint.absHumidity + slope * (t2 - startPoint.temp);
                    path.push({ temp: t2, absHumidity: x2 });
                    break;
                }
                default:
                    return null;
            }
            return path;
        };

        const showPreview = (equipment: Equipment, handleType: 'inlet' | 'outlet' | 'line') => {
            previewGroup.selectAll('*').remove();
            const pathData = generatePreviewPath(equipment, handleType === 'line' ? 'outlet' : handleType);
            if (pathData && pathData.length > 1) {
                const color = EQUIPMENT_HEX_COLORS[equipment.type] || defaultColor;
                const lineGenerator = line<ChartPoint>().x(d => xScale(d.temp)).y(d => yScale(d.absHumidity));
                previewGroup.append("path")
                    .datum(pathData)
                    .attr("fill", "none")
                    .attr("stroke", color)
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", "6,6")
                    .style("opacity", 0.6)
                    .style("pointer-events", "none")
                    .attr("d", lineGenerator);
            }
        };

        const hidePreview = () => {
            previewGroup.selectAll('*').remove();
        };

        const showPointTooltip = (event: MouseEvent, equipment: Equipment, handleType: 'inlet' | 'outlet') => {
            const airProps = handleType === 'inlet' ? equipment.inletAir : equipment.outletAir;
            if (airProps && airProps.temp !== null && airProps.rh !== null) {
                const temp = convertValue(airProps.temp, 'temperature', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('temperature', unitSystem)) ?? '';
                const rh = airProps.rh.toFixed(getPrecisionForUnitType('rh', unitSystem));
                const pointTypeLabel = handleType === 'inlet' ? t('chart.inlet') : t('chart.outlet');
        
                const equipmentName = equipment.name || t(`equipmentNames.${equipment.type}`);
                const line1 = `${equipmentName} ${pointTypeLabel}:`;
                const line2 = `${temp}${temperatureUnit}, ${rh}%`;
                const label = `<div>${line1}</div><div>${line2}</div>`;
                
                const [x, y] = pointer(event, containerRef.current);
                tooltip.style("visibility", "visible")
                        .html(label)
                        .style("top", `${y + 20}px`)
                        .style("left", `${x + 20}px`)
                        .style("transform", "translateX(0)");
            }
        };

        const hideTooltip = () => {
            tooltip.style("visibility", "hidden");
        };

        const moveTooltip = (event: MouseEvent) => {
            const [x, y] = pointer(event, containerRef.current);
            tooltip.style("top", `${y + 20}px`).style("left", `${x + 20}px`);
        };


        airConditionsData.forEach(eq => {
            if (!eq.inletAir || !eq.outletAir || eq.inletAir.temp === null || eq.inletAir.absHumidity === null || eq.outletAir.temp === null || eq.outletAir.absHumidity === null) return;
            
            const [inletTempSI, inletAbsHumiditySI] = [eq.inletAir.temp, eq.inletAir.absHumidity];
            const [outletTempSI, outletAbsHumiditySI] = [eq.outletAir.temp, eq.outletAir.absHumidity];
            const color = EQUIPMENT_HEX_COLORS[eq.type] || defaultColor;
            
            const handleDefaultOpacity = 0.4;
            const lineDefaultOpacity = 1.0;
            const hoverOpacity = 1.0;

            const marker = defs.append("marker")
                .attr("id", `arrow-${eq.id}-${uniqueSuffix}`)
                .attr("viewBox", "0 -5 10 10").attr("refX", 8).attr("refY", 0)
                .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse");
            
            const markerPath = marker.append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", color).style("opacity", lineDefaultOpacity);

            const inletDot = svg.append("circle").attr("class", `inlet-dot-${eq.id}`).attr("cx", xScale(inletTempSI)).attr("cy", yScale(inletAbsHumiditySI)).attr("r", 4).attr("fill", "#16a34a").attr("stroke", themeColors.pointStroke).style("transition", "r 0.15s ease-in-out, opacity 0.15s ease-in-out").style("opacity", handleDefaultOpacity).style("pointer-events", "none");
            const outletDot = svg.append("circle").attr("class", `outlet-dot-${eq.id}`).attr("cx", xScale(outletTempSI)).attr("cy", yScale(outletAbsHumiditySI)).attr("r", 4).attr("fill", "#dc2626").attr("stroke", themeColors.pointStroke).style("transition", "r 0.15s ease-in-out, opacity 0.15s ease-in-out").style("opacity", handleDefaultOpacity).style("pointer-events", "none");
            const processLine = svg.append("line").attr("class", `process-line-${eq.id}`).attr("x1", xScale(inletTempSI)).attr("y1", yScale(inletAbsHumiditySI)).attr("x2", xScale(outletTempSI)).attr("y2", yScale(outletAbsHumiditySI))
               .attr("stroke", color).attr("stroke-width", 2.5).attr("marker-end", `url(#arrow-${eq.id}-${uniqueSuffix})`).style("transition", "stroke-width 0.15s ease-in-out, opacity 0.15s ease-in-out").style("opacity", lineDefaultOpacity);
            
            const getCoolingCoilOutletHumidity = (t_out: number, inlet: AirProperties, conditions: CoolingCoilConditions): number => {
                const { temp: t_in, absHumidity: x_in } = inlet;
                const { bypassFactor = 5 } = conditions;
                const BF = bypassFactor / 100;
            
                if (t_in === null || x_in === null) return 0;
            
                const inletDewPoint = calculateDewPoint(x_in);
            
                let outletAbsHum: number;
                let t_adp: number | undefined;
            
                if (BF < 1.0 && (t_in - t_out) > 0.01) {
                    t_adp = (t_out - t_in * BF) / (1 - BF);
                }
                
                if (t_adp !== undefined && t_adp < inletDewPoint) {
                    // Dehumidification process
                    const x_adp = calculateAbsoluteHumidity(t_adp, 100);
                    outletAbsHum = x_adp * (1 - BF) + x_in * BF;
                } else {
                    // Sensible cooling only
                    outletAbsHum = x_in;
                }
            
                // Correct for supersaturation which can occur due to the linear mixing model approximation
                const saturationHumidityAtOutlet = calculateAbsoluteHumidity(t_out, 100);
                if (outletAbsHum > saturationHumidityAtOutlet) {
                    return saturationHumidityAtOutlet;
                }
            
                return outletAbsHum;
            };

            const pointHandleRadius = 12;
            
            const processDrag = drag<SVGElement, unknown>()
                .on("start", function (event) {
                    dragInProgress.current = true;
                    const dragMode = select(this).attr('data-drag-mode') as 'inlet' | 'outlet' | 'line';
                    select(this).property('__drag_mode__', dragMode);
                    generateSnapTargets(eq.id);
                    showWaterTempIndicator(eq);
                    
                    hideTooltip();
                    previewGroup.selectAll('*').remove();
                    
                    showPreview(eq, dragMode);

                    if (dragMode === 'inlet') {
                        inletDot.raise().attr('r', 8).style('opacity', hoverOpacity);
                    } else if (dragMode === 'outlet') {
                        outletDot.raise().attr('r', 8).style('opacity', hoverOpacity);
                    } else if (dragMode === 'line') {
                        processLine.raise().attr("stroke-width", 4.5).style("opacity", hoverOpacity);
                        markerPath.style("opacity", hoverOpacity);
                        inletDot.raise().style('opacity', hoverOpacity);
                        outletDot.raise().style('opacity', hoverOpacity);
                        
                        const x1 = xScale(inletTempSI), y1 = yScale(inletAbsHumiditySI);
                        const x2 = xScale(outletTempSI), y2 = yScale(outletAbsHumiditySI);
                        
                        const [startX, startY] = pointer(event, svg.node());
                        select(this).property('__start_pointer__', { x: startX, y: startY });
                        select(this).property('__start_pos__', { inletX: x1, inletY: y1, outletX: x2, outletY: y2 });
                        
                        if (eq.type === EquipmentType.BURNER) {
                            const delta_t = outletTempSI - inletTempSI;
                            const delta_x = outletAbsHumiditySI - inletAbsHumiditySI;
                            let effectiveShf;
                            if (Math.abs(delta_t) < 1e-9) {
                                effectiveShf = 0;
                            } else {
                                const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * (inletAbsHumiditySI / 1000);
                                const sensible_h = c_pa_moist * delta_t;
                                const latent_h = (PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * outletTempSI) * (delta_x / 1000);
                                const total_h = sensible_h + latent_h;
                                effectiveShf = Math.abs(total_h) < 1e-9 ? 1.0 : sensible_h / total_h;
                            }
                                select(this).property('__effective_shf__', effectiveShf);
                        }
                    }
                })
                .on("drag", function (event) {
                    const dragMode = select(this).property('__drag_mode__');
                    const [mx, my] = pointer(event, svg.node());
                    
                    svg.selectAll(".snap-line-highlight").remove();

                    if (dragMode === 'line') {
                        const startPointer = select(this).property('__start_pointer__');
                        const startPos = select(this).property('__start_pos__');
                        if (!startPointer || !startPos) return;

                        const [currentX, currentY] = pointer(event, svg.node());
                        const dx = currentX - startPointer.x;
                        const dy = currentY - startPointer.y;
                        let finalDx = dx, finalDy = dy;
                        
                        const proposedInletX = startPos.inletX + dx, proposedInletY = startPos.inletY + dy;
                        const proposedOutletX = startPos.outletX + dx, proposedOutletY = startPos.outletY + dy;
                        
                        const snapForInlet = findClosestSnapPoint(proposedInletX, proposedInletY, snapTargetsRef.current.points, SNAP_RADIUS);
                        const snapForOutlet = findClosestSnapPoint(proposedOutletX, proposedOutletY, snapTargetsRef.current.points, SNAP_RADIUS);
                        
                        let winningSnapPoint = snapForInlet && (!snapForOutlet || snapForInlet.distance < snapForOutlet.distance) ? snapForInlet : snapForOutlet;

                        if (winningSnapPoint) {
                            if (winningSnapPoint === snapForInlet) {
                                finalDx = winningSnapPoint.x - startPos.inletX;
                                finalDy = winningSnapPoint.y - startPos.inletY;
                            } else {
                                finalDx = winningSnapPoint.x - startPos.outletX;
                                finalDy = winningSnapPoint.y - startPos.outletY;
                            }
                            snapHighlight.style("display", "block").attr("cx", winningSnapPoint.x).attr("cy", winningSnapPoint.y);
                        } else {
                            snapHighlight.style("display", "none");
                        }

                        if ([EquipmentType.HEATING_COIL, EquipmentType.BURNER, EquipmentType.COOLING_COIL, EquipmentType.STEAM_HUMIDIFIER].includes(eq.type)) {
                            const proposedInletXAfterSnap = startPos.inletX + finalDx;
                            const proposedInletTemp = xScale.invert(proposedInletXAfterSnap);

                            const [tempDomainMin, tempDomainMax] = xScale.domain();
                            const clampedTemp = Math.max(tempDomainMin, Math.min(tempDomainMax, proposedInletTemp));

                            const saturationHumidity = calculateAbsoluteHumidity(clampedTemp, 100);
                            const saturationY = yScale(saturationHumidity);
                            
                            const proposedInletYAfterSnap = startPos.inletY + finalDy;

                            if (proposedInletYAfterSnap < saturationY) {
                                finalDy = saturationY - startPos.inletY;
                            }
                        }

                        const newInletX = startPos.inletX + finalDx, newInletY = startPos.inletY + finalDy;
                        const newOutletX = startPos.outletX + finalDx, newOutletY = startPos.outletY + finalDy;

                        inletDot.attr("cx", newInletX).attr("cy", newInletY);
                        outletDot.attr("cx", newOutletX).attr("cy", newOutletY);
                        processLine.attr("x1", newInletX).attr("y1", newInletY).attr("x2", newOutletX).attr("y2", newOutletY);
                        
                        select(this).attr("x1", newInletX).attr("y1", newInletY).attr("x2", newOutletX).attr("y2", newOutletY);

                        previewGroup.selectAll('*').remove();
                        const tempEqForPreview: Equipment = {
                            ...eq,
                            inletAir: calculateAirProperties(xScale.invert(newInletX), null, yScale.invert(newInletY)),
                        };
                        const pathData = generatePreviewPath(tempEqForPreview, 'outlet');
                        if (pathData && pathData.length > 1) {
                            const lineGenerator = line<ChartPoint>().x(d => xScale(d.temp)).y(d => yScale(d.absHumidity));
                            previewGroup.append("path")
                                .datum(pathData)
                                .attr("fill", "none")
                                .attr("stroke", color)
                                .attr("stroke-width", 2)
                                .attr("stroke-dasharray", "6,6")
                                .style("opacity", 0.6)
                                .style("pointer-events", "none")
                                .attr("d", lineGenerator);
                        }

                        select(this).property('__latest_drag_pos__', {
                            inlet: { temp: xScale.invert(newInletX), absHumidity: yScale.invert(newInletY) },
                            outlet: { temp: xScale.invert(newOutletX), absHumidity: yScale.invert(newOutletY) }
                        });
                    } else { // Inlet or Outlet drag
                        const fixedDot = dragMode === 'outlet' ? inletDot : outletDot;
                        const fixedPointX = parseFloat(fixedDot.attr("cx"));
                        const fixedPointY = parseFloat(fixedDot.attr("cy"));
                        
                        let projectedMx: number, projectedMy: number;
                        let projectedTemp: number;

                        if (eq.type === EquipmentType.CUSTOM) {
                            projectedMx = mx;
                            projectedMy = my;
                            projectedTemp = xScale.invert(mx);
                        } else if (eq.type === EquipmentType.COOLING_COIL && dragMode === 'outlet') {
                            const inletProps = {
                                temp: xScale.invert(fixedPointX),
                                absHumidity: yScale.invert(fixedPointY)
                            } as AirProperties;
                            
                            let mouseTemp = xScale.invert(mx);
                            if (mouseTemp > inletProps.temp!) mouseTemp = inletProps.temp!;

                            projectedMx = xScale(mouseTemp);
                            const projectedHum = getCoolingCoilOutletHumidity(mouseTemp, inletProps, eq.conditions as CoolingCoilConditions);
                            projectedMy = yScale(projectedHum);

                            projectedTemp = mouseTemp;
                        } else {
                            // 1. Calculate the IDEAL projected point on the unconstrained process line.
                            projectedTemp = xScale.invert(mx);
                            let projectedAbsHumidity = yScale.invert(my);

                            const getProjectedPoint = (lineP1_s: {x:number, y:number}, lineVec_s: {x:number, y:number}) => {
                                const v_len_sq = lineVec_s.x * lineVec_s.x + lineVec_s.y * lineVec_s.y;
                                if (v_len_sq < 1e-9) return lineP1_s;
                                
                                const ap = { x: mx - lineP1_s.x, y: my - lineP1_s.y };
                                const t = (ap.x * lineVec_s.x + ap.y * lineVec_s.y) / v_len_sq;
                                return { x: lineP1_s.x + t * lineVec_s.x, y: lineP1_s.y + t * lineVec_s.y };
                            };

                            const getProcessLineVector = (
                                equipmentType: EquipmentType, 
                                startTemp: number, 
                                startHum: number, 
                                conds: any, 
                                reverse: boolean = false
                            ) => {
                                let endTemp = startTemp + 10;
                                let endHum = startHum;

                                switch (equipmentType) {
                                    case EquipmentType.COOLING_COIL:
                                    case EquipmentType.HEATING_COIL:
                                        break;
                                    case EquipmentType.BURNER: {
                                        const shf = select(this).property('__effective_shf__') ?? (conds as BurnerConditions).shf ?? 1.0;
                                        if (shf >= 1.0) { /* remains horizontal */ }
                                        else if (shf > 0) {
                                            const slope_data = (1 / shf - 1) * (PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR / (PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C / 1000));
                                            endHum = startHum + slope_data * 10;
                                        }
                                        break;
                                    }
                                    case EquipmentType.STEAM_HUMIDIFIER: {
                                        const steamCond = conds as SteamHumidifierConditions;
                                        const steamProps = calculateSteamProperties(steamCond.steamGaugePressure ?? 100);
                                        const h_steam = steamProps.enthalpy;
                                        const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * (startHum / 1000);
                                        const h_vapor = PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * startTemp;
                                        const denominator = h_steam - h_vapor;
                                        if (Math.abs(denominator) > 0.1) {
                                            const slope_data = (1000 * c_pa_moist) / denominator;
                                            endHum = startHum + slope_data * 10;
                                        }
                                        break;
                                    }
                                    case EquipmentType.SPRAY_WASHER: {
                                        const h = calculateEnthalpy(startTemp, startHum);
                                        endHum = calculateAbsoluteHumidityFromEnthalpy(endTemp, h);
                                        break;
                                    }
                                }

                                const p1_s = { x: xScale(startTemp), y: yScale(startHum) };
                                const p2_s = { x: xScale(endTemp), y: yScale(endHum) };
                                
                                return reverse 
                                    ? { x: p1_s.x - p2_s.x, y: p1_s.y - p2_s.y }
                                    : { x: p2_s.x - p1_s.x, y: p2_s.y - p1_s.y };
                            };

                            const startPoint_s = { x: fixedPointX, y: fixedPointY };
                            const startPoint_d = { 
                                temp: xScale.invert(fixedPointX), 
                                absHumidity: yScale.invert(fixedPointY) 
                            };

                            const lineVec_s = getProcessLineVector(
                                eq.type, 
                                startPoint_d.temp, 
                                startPoint_d.absHumidity, 
                                eq.conditions, 
                                dragMode === 'inlet'
                            );
                            
                            const {x: new_mx, y: new_my} = getProjectedPoint(startPoint_s, lineVec_s);
                            projectedTemp = xScale.invert(new_mx);
                            projectedAbsHumidity = yScale.invert(new_my);
                            
                            projectedMx = xScale(projectedTemp);
                            projectedMy = yScale(projectedAbsHumidity);
                        }
                        
                        // 2. Now find snaps based on the IDEAL projected position.
                        const closestPointSnap = findClosestSnapPoint(projectedMx, projectedMy, snapTargetsRef.current.points, SNAP_RADIUS);
                        
                        let closestIntersectionSnap: { x: number; y: number; distance: number; line: any } | null = null;
                        let minIntersectionDist = SNAP_RADIUS;

                        snapTargetsRef.current.lines.forEach(line => {
                            let intersection: { x: number; y: number } | null = null;
                            const targetEquipment = line.equipment as Equipment;

                            const isDraggedBurner = eq.type === EquipmentType.BURNER;
                            const isTargetWasher = targetEquipment.type === EquipmentType.SPRAY_WASHER;

                            // Analytical intersection for Burner <-> Spray Washer
                            if (isDraggedBurner && isTargetWasher) {
                                const burnerLineEq = {
                                    type: eq.type,
                                    fixedPoint: dragMode === 'outlet' ? eq.inletAir : eq.outletAir,
                                    conditions: { shf: select(this).property('__effective_shf__') ?? (eq.conditions as BurnerConditions).shf ?? 1.0 }
                                };
                                const washerCurveEq = {
                                    type: targetEquipment.type,
                                    enthalpy: targetEquipment.inletAir.enthalpy
                                };
                                
                                const intersectionPointData = findAnalyticalIntersection(burnerLineEq, washerCurveEq, projectedTemp);
                                
                                if (intersectionPointData) {
                                    const washerInletTemp = targetEquipment.inletAir.temp!;
                                    const washerOutletTemp = targetEquipment.outletAir.temp!;
                                    const minT = Math.min(washerInletTemp, washerOutletTemp);
                                    const maxT = Math.max(washerInletTemp, washerOutletTemp);
                                    
                                    if (intersectionPointData.temp >= minT && intersectionPointData.temp <= maxT) {
                                        intersection = {
                                            x: xScale(intersectionPointData.temp),
                                            y: yScale(intersectionPointData.absHumidity)
                                        };
                                    }
                                }
                            } else {
                                // Default geometric line-segment intersection
                                intersection = findRaySegmentIntersection(
                                    fixedPointX, fixedPointY,
                                    projectedMx, projectedMy,
                                    line.p1.x, line.p1.y,
                                    line.p2.x, line.p2.y
                                );
                            }
                        
                            if (intersection) {
                                const dist = Math.hypot(intersection.x - projectedMx, intersection.y - projectedMy);
                                if (dist < minIntersectionDist) {
                                    minIntersectionDist = dist;
                                    closestIntersectionSnap = {
                                        x: intersection.x,
                                        y: intersection.y,
                                        distance: dist,
                                        line: line
                                    };
                                }
                            }
                        });
                        
                        let winningSnap: any = null;
                        if (closestPointSnap && (!closestIntersectionSnap || closestPointSnap.distance <= closestIntersectionSnap.distance)) {
                            winningSnap = { type: 'point', ...closestPointSnap };
                        } else if (closestIntersectionSnap) {
                            winningSnap = { type: 'line', ...closestIntersectionSnap };
                        }

                        // 3. Determine the final ideal position (snapped or projected)
                        let idealFinalX: number, idealFinalY: number;

                        if (winningSnap) {
                            idealFinalX = winningSnap.x;
                            idealFinalY = winningSnap.y;
                            if (winningSnap.type === 'point') {
                                snapHighlight.style("display", "block").attr("cx", idealFinalX).attr("cy", idealFinalY);
                            } else { // line snap
                                const snapColor = EQUIPMENT_HEX_COLORS[winningSnap.line.equipment.type] || defaultColor;
                                snapHighlight.style("display", "none");
                                svg.append("line")
                                    .attr("class", "snap-line-highlight")
                                    .attr("x1", winningSnap.line.p1.x).attr("y1", winningSnap.line.p1.y)
                                    .attr("x2", winningSnap.line.p2.x).attr("y2", winningSnap.line.p2.y)
                                    .attr("stroke", snapColor)
                                    .attr("stroke-opacity", 0.6)
                                    .attr("stroke-width", 8)
                                    .style("pointer-events", "none");
                                
                                    svg.append("circle")
                                    .attr("class", "snap-line-highlight") // use same class for cleanup
                                    .attr("cx", idealFinalX).attr("cy", idealFinalY)
                                    .attr("r", 7)
                                    .attr("fill", "none")
                                    .attr("stroke", snapColor)
                                    .attr("stroke-width", 3)
                                    .style("pointer-events", "none");
                            }
                        } else {
                            idealFinalX = projectedMx;
                            idealFinalY = projectedMy;
                            snapHighlight.style("display", "none");
                        }

                        // 4. ONLY NOW, apply physical constraints to the final ideal point
                        let finalTemp = xScale.invert(idealFinalX);
                        let finalAbsHumidity = yScale.invert(idealFinalY);
                        
                        const startPoint_d = { temp: xScale.invert(fixedPointX), absHumidity: yScale.invert(fixedPointY) };

                        if (dragMode === 'inlet' && (eq.type === EquipmentType.HEATING_COIL || (eq.type === EquipmentType.BURNER && (eq.conditions as BurnerConditions).shf >= 1.0))) {
                            const dewPointTemp = calculateDewPoint(outletAbsHumiditySI);
                            if (finalTemp < dewPointTemp) {
                                finalTemp = dewPointTemp;
                            }
                        }

                        if (eq.type === EquipmentType.COOLING_COIL) {
                            const inletProps = { temp: startPoint_d.temp, absHumidity: startPoint_d.absHumidity } as AirProperties;
                            if (dragMode === 'outlet') {
                                const { chilledWaterInletTemp = 7 } = eq.conditions as CoolingCoilConditions;
                                if (finalTemp > inletProps.temp!) finalTemp = inletProps.temp!;
                                if (finalTemp < chilledWaterInletTemp) finalTemp = chilledWaterInletTemp;
                                finalAbsHumidity = getCoolingCoilOutletHumidity(finalTemp, inletProps, eq.conditions as CoolingCoilConditions);
                            } else { // inlet drag
                                const outletTemp = startPoint_d.temp;
                                if (finalTemp < outletTemp) finalTemp = outletTemp;
                            }
                        } else if (eq.type === EquipmentType.HEATING_COIL) {
                            if (dragMode === 'outlet') {
                                const { hotWaterInletTemp = 80 } = eq.conditions as HeatingCoilConditions;
                                const inletTemp = startPoint_d.temp;
                                if (finalTemp < inletTemp) finalTemp = inletTemp;
                                if (finalTemp > hotWaterInletTemp) finalTemp = hotWaterInletTemp;
                            } else { // inlet drag
                                const outletTemp = startPoint_d.temp;
                                if (finalTemp > outletTemp) finalTemp = outletTemp;
                            }
                        }

                        const saturationHumidityAtTemp = calculateAbsoluteHumidity(finalTemp, 100);
                        if (finalAbsHumidity > saturationHumidityAtTemp) {
                            finalAbsHumidity = saturationHumidityAtTemp;
                        }

                        finalTemp = Math.max(xScale.domain()[0], Math.min(xScale.domain()[1], finalTemp));
                        finalAbsHumidity = Math.max(yScale.domain()[0], Math.min(yScale.domain()[1], finalAbsHumidity));
                        
                        const finalRh = calculateRelativeHumidity(finalTemp, finalAbsHumidity);
                        const tempString = convertValue(finalTemp, 'temperature', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('temperature', unitSystem)) ?? '';
                        const rhString = finalRh.toFixed(getPrecisionForUnitType('rh', unitSystem));
                        const pointTypeLabel = dragMode === 'inlet' ? t('chart.inlet') : t('chart.outlet');
                        
                        const equipmentName = eq.name || t(`equipmentNames.${eq.type}`);
                        const line1 = `${equipmentName} ${pointTypeLabel}:`;
                        const line2 = `${tempString}${temperatureUnit}, ${rhString}%`;
                        const label = `<div>${line1}</div><div>${line2}</div>`;

                        const [cursorX, cursorY] = pointer(event.sourceEvent, containerRef.current);
                        tooltip.style("visibility", "visible")
                                .html(label)
                                .style("top", `${cursorY + 20}px`)
                                .style("left", `${cursorX + 20}px`)
                                .style("transform", "translateX(0)");

                        const finalX = xScale(finalTemp);
                        const finalY = yScale(finalAbsHumidity);
                        const finalPos = { temp: finalTemp, absHumidity: finalAbsHumidity };
                        
                        // 5. Update UI with the final, constrained position
                        if (dragMode === 'outlet') {
                            outletDot.attr("cx", finalX).attr("cy", finalY);
                            processLine.attr("x2", finalX).attr("y2", finalY);
                            select(this).property('__latest_drag_pos__', { outlet: finalPos });
                        } else { // inlet
                            inletDot.attr("cx", finalX).attr("cy", finalY);
                            processLine.attr("x1", finalX).attr("y1", finalY);
                            select(this).property('__latest_drag_pos__', { inlet: finalPos });
                        }
                    }
                })
                .on("end", function () {
                    tooltip.style("visibility", "hidden");
                    dragInProgress.current = false;
                    hideWaterTempIndicator();
                    const dragMode = select(this).property('__drag_mode__');
                    const finalPos = select(this).property('__latest_drag_pos__');
                    
                    previewGroup.selectAll('*').remove();
                    snapHighlight.style("display", "none");
                    svg.selectAll(".snap-line-highlight").remove();
                    snapTargetsRef.current = { points: [], lines: [] };
                    
                    if (finalPos) {
                        if (dragMode === 'line') {
                            const finalInlet = calculateAirProperties(finalPos.inlet.temp, null, finalPos.inlet.absHumidity);
                            const finalOutlet = calculateAirProperties(finalPos.outlet.temp, null, finalPos.outlet.absHumidity);
                            onUpdate(eq.id, { inlet: finalInlet, outlet: finalOutlet });
                        } else if (dragMode === 'outlet') {
                            let finalOutletAir: AirProperties;
                            if (eq.type === EquipmentType.SPRAY_WASHER) {
                                const inletEnthalpy = eq.inletAir.enthalpy;
                                const finalTemp = finalPos.outlet.temp;
                                if (inletEnthalpy !== null && finalTemp !== null) {
                                    const finalAbsHumidity = calculateAbsoluteHumidityFromEnthalpy(finalTemp, inletEnthalpy);
                                    finalOutletAir = calculateAirProperties(finalTemp, null, finalAbsHumidity);
                                } else {
                                    finalOutletAir = calculateAirProperties(finalPos.outlet.temp, null, finalPos.outlet.absHumidity);
                                }
                            } else {
                                finalOutletAir = calculateAirProperties(finalPos.outlet.temp, null, finalPos.outlet.absHumidity);
                            }
                            onUpdate(eq.id, { outlet: finalOutletAir });
                        } else if (dragMode === 'inlet') {
                            const finalInletAir = calculateAirProperties(finalPos.inlet.temp, null, finalPos.inlet.absHumidity);
                            onUpdate(eq.id, { inlet: finalInletAir });
                        }
                    }

                    // Reset visual styles
                    if (dragMode === 'inlet') {
                        inletDot.attr('r', 4).style('opacity', handleDefaultOpacity);
                    } else if (dragMode === 'outlet') {
                        outletDot.attr('r', 4).style('opacity', handleDefaultOpacity);
                    } else if (dragMode === 'line') {
                        processLine.attr("stroke-width", 2.5).style("opacity", lineDefaultOpacity);
                        markerPath.style("opacity", lineDefaultOpacity);
                        inletDot.style('opacity', handleDefaultOpacity);
                        outletDot.style('opacity', handleDefaultOpacity);
                    }

                    // Clear all temporary properties
                    select(this)
                        .property('__drag_mode__', null)
                        .property('__start_pointer__', null)
                        .property('__start_pos__', null)
                        .property('__latest_drag_pos__', null)
                        .property('__effective_shf__', null);
                });
            
            // Add handles for inlet, outlet and line
            const lineTooltipHitbox = svg.append("line")
                .attr("x1", xScale(inletTempSI)).attr("y1", yScale(inletAbsHumiditySI))
                .attr("x2", xScale(outletTempSI)).attr("y2", yScale(outletAbsHumiditySI))
                .attr("stroke", "transparent")
                .attr("stroke-width", 15)
                .style("cursor", "move")
                .attr("data-drag-mode", "line")
                .on("mouseover", function() {
                    if (dragInProgress.current) return;
                    processLine.attr("stroke-width", 4.5).style("opacity", hoverOpacity);
                    markerPath.style("opacity", hoverOpacity);
                    const equipmentName = eq.name || t(`equipmentNames.${eq.type}`);
                    tooltip.style("visibility", "visible").text(equipmentName);
                    showPreview(eq, 'line');
                    showWaterTempIndicator(eq);
                })
                .on("mousemove", function(event) {
                    if (dragInProgress.current) return;
                    const [x, y] = pointer(event, containerRef.current);
                    tooltip.style("top", `${y + 20}px`)
                           .style("left", `${x + 20}px`)
                           .style("transform", "translateX(0)");
                })
                .on("mouseout", function() {
                    if (dragInProgress.current) return;
                    processLine.attr("stroke-width", 2.5).style("opacity", lineDefaultOpacity);
                    markerPath.style("opacity", lineDefaultOpacity);
                    tooltip.style("visibility", "hidden");
                    hidePreview();
                    hideWaterTempIndicator();
                })
                .call(processDrag);

            svg.append("circle")
                .attr("class", `inlet-drag-handle-${eq.id}`)
                .attr("cx", xScale(inletTempSI))
                .attr("cy", yScale(inletAbsHumiditySI))
                .attr("r", pointHandleRadius)
                .attr("fill", "transparent")
                .style("cursor", "move")
                .attr("data-drag-mode", "inlet")
                .on("mouseover", function(event) {
                    if (dragInProgress.current) return;
                    inletDot.raise().attr('r', 8).style('opacity', hoverOpacity);
                    showPointTooltip(event, eq, 'inlet');
                    showPreview(eq, 'inlet');
                    showWaterTempIndicator(eq);
                })
                .on("mousemove", function(event) {
                    if (dragInProgress.current) return;
                    moveTooltip(event);
                })
                .on("mouseout", function() {
                    if (dragInProgress.current) return;
                    inletDot.attr('r', 4).style('opacity', handleDefaultOpacity);
                    hideTooltip();
                    hidePreview();
                    hideWaterTempIndicator();
                })
                .call(processDrag);
        
            svg.append("circle")
                .attr("class", `outlet-drag-handle-${eq.id}`)
                .attr("cx", xScale(outletTempSI))
                .attr("cy", yScale(outletAbsHumiditySI))
                .attr("r", pointHandleRadius)
                .attr("fill", "transparent")
                .style("cursor", "move")
                .attr("data-drag-mode", "outlet")
                .on("mouseover", function(event) {
                    if (dragInProgress.current) return;
                    outletDot.raise().attr('r', 8).style('opacity', hoverOpacity);
                    showPointTooltip(event, eq, 'outlet');
                    showPreview(eq, 'outlet');
                    showWaterTempIndicator(eq);
                })
                .on("mousemove", function(event) {
                    if (dragInProgress.current) return;
                    moveTooltip(event);
                })
                .on("mouseout", function() {
                    if (dragInProgress.current) return;
                    outletDot.attr('r', 4).style('opacity', handleDefaultOpacity);
                    hideTooltip();
                    hidePreview();
                    hideWaterTempIndicator();
                })
                .call(processDrag);
        });
    }, [airConditionsData, globalInletAir, globalOutletAir, unitSystem, isSplitViewActive, onUpdate, dimensions, t]);
    
    return (
        <div ref={containerRef} className="w-full h-[350px] sm:h-[450px] lg:h-[500px] relative">
            <svg ref={svgRef}></svg>
        </div>
    );
};