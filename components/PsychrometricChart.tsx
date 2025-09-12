import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
// FIX: Changed d3 import from namespace to named functions to fix module resolution errors.
import { select, scaleLinear, axisBottom, axisLeft, line, Selection, pointer, drag } from 'd3';
import { Equipment, AirProperties, UnitSystem, ChartPoint, EquipmentType, BurnerConditions, SteamHumidifierConditions } from '../types';
import { convertValue, getPrecisionForUnitType } from '../utils/conversions.ts';
import { calculateAirProperties, calculateAbsoluteHumidity, calculateAbsoluteHumidityFromEnthalpy, calculateEnthalpy, PSYCH_CONSTANTS, calculateSteamProperties } from '../services/psychrometrics.ts';
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

const PsychrometricChart: React.FC<PsychrometricChartProps> = ({ airConditionsData, globalInletAir, globalOutletAir, unitSystem, isSplitViewActive, onUpdate }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const { t } = useLanguage();
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const snapTargetsRef = useRef<{ points: any[]; lines: any[] }>({ points: [], lines: [] });

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

    const margin = { top: 20, right: 50, bottom: 60, left: 60 };
    const width = dimensions.width > (margin.left + margin.right) ? dimensions.width - margin.left - margin.right : 0;
    const height = dimensions.height > (margin.top + margin.bottom) ? dimensions.height - margin.top - margin.bottom : 0;


    useEffect(() => {
        if (!svgRef.current || width <= 0 || height <= 0) return;
        
        const isNarrow = width < 500;
        const numTicksX = Math.max(4, Math.round(width / 80));
        const showYAxisMeta = !isSplitViewActive && !isNarrow;
        const rhLinesToLabel = (isSplitViewActive || isNarrow) ? [20, 40, 60, 80, 100] : [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const showEnthalpyLabels = !isSplitViewActive && width > 600;
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

        const svgSelection = select(svgRef.current);
        svgSelection.selectAll("*").remove();

        const svg = svgSelection
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const xScale = scaleLinear().domain([-20, 60]).range([0, width]);
        const yScale = scaleLinear().domain([0, 30]).range([height, 0]);

        const xAxis = svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(axisBottom(xScale).ticks(numTicksX).tickFormat(d => `${convertValue(d as number, 'temperature', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('temperature', unitSystem))}`))
        
        xAxis.selectAll("path").style("stroke", themeColors.axis);
        xAxis.selectAll("line").style("stroke", themeColors.axis);
        xAxis.selectAll("text").style("fill", themeColors.axisText).style("font-size", "12px");
        xAxis.append("text")
            .attr("y", 40).attr("x", width / 2).attr("fill", themeColors.axisLabel).attr("font-size", "14px").attr("text-anchor", "middle")
            .text(`${t('chart.xAxisLabel')} (${temperatureUnit})`);

        const yAxis = svg.append("g")
            .call(axisLeft(yScale).ticks(6).tickFormat(d =>
                showYAxisMeta
                    ? `${convertValue(d as number, 'abs_humidity', UnitSystem.SI, unitSystem)?.toFixed(getPrecisionForUnitType('abs_humidity', unitSystem))}`
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
        
        // Snap feature helpers
        const SNAP_RADIUS = 15;

        const snapHighlight = svg.append("circle")
            .attr("class", "snap-highlight")
            .attr("r", 12)
            .attr("fill", "rgba(0, 123, 255, 0.3)")
            .attr("stroke", "rgba(0, 123, 255, 0.8)")
            .attr("stroke-width", 2)
            .style("pointer-events", "none")
            .style("display", "none");

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
        
        const findClosestPointOnLineSegment = (px: number, py: number, p1x: number, p1y: number, p2x: number, p2y: number) => {
            const dx = p2x - p1x;
            const dy = p2y - p1y;
        
            if (dx === 0 && dy === 0) { // Segment is a point
                const dist = Math.hypot(px - p1x, py - p1y);
                return { x: p1x, y: p1y, distance: dist };
            }
        
            const dot = ((px - p1x) * dx + (py - p1y) * dy);
            const len_sq = dx * dx + dy * dy;
            let t = -1;
            if (len_sq !== 0) {
                t = dot / len_sq;
            }
        
            let closestX, closestY;
        
            if (t < 0) {
                closestX = p1x;
                closestY = p1y;
            } else if (t > 1) {
                closestX = p2x;
                closestY = p2y;
            } else {
                closestX = p1x + t * dx;
                closestY = p1y + t * dy;
            }
        
            const distance = Math.hypot(px - closestX, py - closestY);
            return { x: closestX, y: closestY, distance };
        };

        const generateSnapTargets = (excludeId: number) => {
            const pointTargets: any[] = [];
            const lineTargets: any[] = [];
            const defaultColor = '#2563eb';

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
                        p1: { x: xScale(eq.inletAir.temp), y: yScale(eq.inletAir.absHumidity) },
                        p2: { x: xScale(eq.outletAir.temp), y: yScale(eq.outletAir.absHumidity) },
                        color: EQUIPMENT_HEX_COLORS[eq.type] || defaultColor
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
        let lastRhLabelY: number | null = null;
        const MIN_RH_LABEL_Y_SPACING = 18; // Minimum vertical pixel spacing for RH labels

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
                // Find a suitable point for the label, slightly inside the chart's right edge
                let labelPoint: ChartPoint | null = null;
                for (let i = lineData.length - 1; i >= 0; i--) {
                    const point = lineData[i];
                    if (xScale(point.temp) < width - 10) { // 10px from the right edge
                        labelPoint = point;
                        break;
                    }
                }
                 if (!labelPoint && lineData.length > 0) {
                    labelPoint = lineData[lineData.length - 1];
                 }

                if (labelPoint) {
                    const currentLabelY = yScale(labelPoint.absHumidity);
                    // Check if it's sufficiently spaced from the last label
                    if (lastRhLabelY === null || Math.abs(currentLabelY - lastRhLabelY) > MIN_RH_LABEL_Y_SPACING) {
                         svg.append("text").attr("x", xScale(labelPoint.temp) + 5).attr("y", currentLabelY)
                           .attr("dominant-baseline", "middle")
                           .text(`${rh}%`).attr("font-size", "11px").attr("fill", themeColors.rhLabel);
                        lastRhLabelY = currentLabelY;
                    }
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
                        const textElement = svg.append("text")
                           .attr("transform", `translate(${xPos}, ${yPos}) rotate(${angleDeg})`)
                           .attr("dominant-baseline", "middle")
                           .attr("fill", themeColors.enthalpyLabel)
                           .attr("font-size", "11px")
                           .text(`${convertValue(h, 'enthalpy', UnitSystem.SI, unitSystem)?.toFixed(0)}`);
                        
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

            const inletDot = svg.append("circle").attr("class", `inlet-dot-${eq.id}`).attr("cx", xScale(inletTempSI)).attr("cy", yScale(inletAbsHumiditySI)).attr("r", 5).attr("fill", "#16a34a").attr("stroke", themeColors.pointStroke);
            const outletDot = svg.append("circle").attr("class", `outlet-dot-${eq.id}`).attr("cx", xScale(outletTempSI)).attr("cy", yScale(outletAbsHumiditySI)).attr("r", 5).attr("fill", "#dc2626").attr("stroke", themeColors.pointStroke);
            const processLine = svg.append("line").attr("class", `process-line-${eq.id}`).attr("x1", xScale(inletTempSI)).attr("y1", yScale(inletAbsHumiditySI)).attr("x2", xScale(outletTempSI)).attr("y2", yScale(outletAbsHumiditySI))
               .attr("stroke", color).attr("stroke-width", 2.5).attr("marker-end", `url(#arrow-${eq.id})`);

            const isDraggable = eq.type !== EquipmentType.FAN;
            if (isDraggable) {
                const pointHandleRadius = 12;

                const processDrag = drag()
                    .on("start", function (event) {
                        const [mx, my] = pointer(event, svg.node());
                        const x1 = xScale(inletTempSI), y1 = yScale(inletAbsHumiditySI);
                        const x2 = xScale(outletTempSI), y2 = yScale(outletAbsHumiditySI);
                        
                        const distToInlet = Math.hypot(mx - x1, my - y1);
                        const distToOutlet = Math.hypot(mx - x2, my - y2);

                        let dragMode = 'line';
                        if (distToInlet < pointHandleRadius && distToInlet <= distToOutlet) {
                            dragMode = 'inlet';
                        } else if (distToOutlet < pointHandleRadius && distToOutlet < distToInlet) {
                            dragMode = 'outlet';
                        }
                        
                        select(this).property('__drag_mode__', dragMode);
                        generateSnapTargets(eq.id);

                        if (dragMode === 'inlet') {
                            inletDot.raise().attr('r', 8);
                        } else if (dragMode === 'outlet') {
                            outletDot.raise().attr('r', 8);
                        } else {
                            processLine.raise().attr("stroke-width", 4.5);
                            inletDot.raise();
                            outletDot.raise();
                            select(this).property('__start_pointer__', { x: event.x, y: event.y });
                            select(this).property('__start_pos__', { inletX: x1, inletY: y1, outletX: x2, outletY: y2 });
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

                            const dx = event.x - startPointer.x, dy = event.y - startPointer.y;
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

                            const newInletX = startPos.inletX + finalDx, newInletY = startPos.inletY + finalDy;
                            const newOutletX = startPos.outletX + finalDx, newOutletY = startPos.outletY + finalDy;

                            inletDot.attr("cx", newInletX).attr("cy", newInletY);
                            outletDot.attr("cx", newOutletX).attr("cy", newOutletY);
                            processLine.attr("x1", newInletX).attr("y1", newInletY).attr("x2", newOutletX).attr("y2", newOutletY);
                            
                            select(this).property('__latest_drag_pos__', {
                                inlet: { temp: xScale.invert(newInletX), absHumidity: yScale.invert(newInletY) },
                                outlet: { temp: xScale.invert(newOutletX), absHumidity: yScale.invert(newOutletY) }
                            });
                        } else { // Inlet or Outlet drag
                            let finalX = mx, finalY = my;
                            
                            const closestPointSnap = findClosestSnapPoint(mx, my, snapTargetsRef.current.points, SNAP_RADIUS);
                            
                            let closestLineSnap: { x: number; y: number; distance: number; line: any } | null = null;
                            let minLineDist = SNAP_RADIUS;

                            snapTargetsRef.current.lines.forEach(line => {
                                const { x, y, distance } = findClosestPointOnLineSegment(mx, my, line.p1.x, line.p1.y, line.p2.x, line.p2.y);
                                if (distance < minLineDist) {
                                    minLineDist = distance;
                                    closestLineSnap = { x, y, distance, line };
                                }
                            });

                            let winningSnap: any = null;
                            if (closestPointSnap && (!closestLineSnap || closestPointSnap.distance <= closestLineSnap.distance)) {
                                winningSnap = { type: 'point', ...closestPointSnap };
                            } else if (closestLineSnap) {
                                winningSnap = { type: 'line', ...closestLineSnap };
                            }
                            
                            if (winningSnap) {
                                finalX = winningSnap.x;
                                finalY = winningSnap.y;
                                if (winningSnap.type === 'point') {
                                    snapHighlight.style("display", "block").attr("cx", finalX).attr("cy", finalY);
                                } else { // line snap
                                    snapHighlight.style("display", "none");
                                    svg.append("line")
                                        .attr("class", "snap-line-highlight")
                                        .attr("x1", winningSnap.line.p1.x).attr("y1", winningSnap.line.p1.y)
                                        .attr("x2", winningSnap.line.p2.x).attr("y2", winningSnap.line.p2.y)
                                        .attr("stroke", winningSnap.line.color)
                                        .attr("stroke-opacity", 0.6)
                                        .attr("stroke-width", 8)
                                        .style("pointer-events", "none");
                                    
                                     svg.append("circle")
                                        .attr("class", "snap-line-highlight") // use same class for cleanup
                                        .attr("cx", finalX).attr("cy", finalY)
                                        .attr("r", 7)
                                        .attr("fill", "none")
                                        .attr("stroke", winningSnap.line.color)
                                        .attr("stroke-width", 3)
                                        .style("pointer-events", "none");
                                }
                            } else {
                                snapHighlight.style("display", "none");
                                let constrainedTemp = xScale.invert(mx);
                                let constrainedAbsHumidity = yScale.invert(my);
                                
                                if (dragMode === 'outlet') {
                                    switch (eq.type) {
                                        case EquipmentType.HEATING_COIL: constrainedAbsHumidity = inletAbsHumiditySI; break;
                                        case EquipmentType.BURNER: {
                                            const { shf = 1.0 } = eq.conditions as BurnerConditions;
                                            if (shf >= 1.0) { constrainedAbsHumidity = inletAbsHumiditySI; } 
                                            else if (shf > 0) {
                                                const slope = (1 / shf - 1) * (1.02 / 2.5);
                                                const t1_s = xScale(inletTempSI), x1_s = yScale(inletAbsHumiditySI);
                                                const dataSlopeToScreenSlope = -(height / 30) / (width / 80);
                                                const m_s = slope * dataSlopeToScreenSlope;
                                                const new_mx = (m_s * my + mx - m_s * x1_s + m_s * m_s * t1_s) / (m_s * m_s + 1);
                                                const new_my = m_s * (new_mx - t1_s) + x1_s;
                                                constrainedTemp = xScale.invert(new_mx);
                                                constrainedAbsHumidity = yScale.invert(new_my);
                                            }
                                            break;
                                        }
                                        case EquipmentType.STEAM_HUMIDIFIER: {
                                            const steamCond = eq.conditions as SteamHumidifierConditions;
                                            const steamProps = calculateSteamProperties(steamCond.steamGaugePressure ?? 100);
                                            const h_steam = steamProps.enthalpy;
                                            const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * (inletAbsHumiditySI / 1000);
                                            const h_vapor_inlet = PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * inletTempSI;
                                            const denominator = h_steam - h_vapor_inlet;
                                            if (Math.abs(denominator) < 0.1) { constrainedTemp = inletTempSI; } 
                                            else {
                                                const slope_data = (1000 * c_pa_moist) / denominator;
                                                const p1_s = { x: xScale(inletTempSI), y: yScale(inletAbsHumiditySI) };
                                                const p2_s = { x: xScale(inletTempSI + 10), y: yScale(inletAbsHumiditySI + slope_data * 10) };
                                                if (Math.abs(p2_s.x - p1_s.x) < 1e-6) { constrainedTemp = inletTempSI; } 
                                                else {
                                                    const m_s = (p2_s.y - p1_s.y) / (p2_s.x - p1_s.x);
                                                    const new_mx = (m_s * my + mx - m_s * p1_s.y + m_s * m_s * p1_s.x) / (m_s * m_s + 1);
                                                    const new_my = m_s * (new_mx - p1_s.x) + p1_s.y;
                                                    constrainedTemp = xScale.invert(new_mx);
                                                    constrainedAbsHumidity = yScale.invert(new_my);
                                                }
                                            }
                                            break;
                                        }
                                        case EquipmentType.SPRAY_WASHER: {
                                            const h1 = eq.inletAir.enthalpy!;
                                            const p1_s = { x: xScale(60), y: yScale(calculateAbsoluteHumidityFromEnthalpy(60, h1)) };
                                            const p2_s = { x: xScale(-20), y: yScale(calculateAbsoluteHumidityFromEnthalpy(-20, h1)) };
                                            if (Math.abs(p2_s.x - p1_s.x) < 1e-6) { constrainedTemp = xScale.invert(p1_s.x); } 
                                            else {
                                                const m_s = (p2_s.y - p1_s.y) / (p2_s.x - p1_s.x);
                                                const new_mx = (m_s * my + mx - m_s * p1_s.y + m_s * m_s * p1_s.x) / (m_s * m_s + 1);
                                                const new_my = m_s * (new_mx - p1_s.x) + p1_s.y;
                                                constrainedTemp = xScale.invert(new_mx);
                                                constrainedAbsHumidity = yScale.invert(new_my);
                                            }
                                            break;
                                        }
                                    }
                                } else { // 'inlet' drag
                                     switch (eq.type) {
                                        case EquipmentType.HEATING_COIL: constrainedAbsHumidity = outletAbsHumiditySI; break;
                                        case EquipmentType.BURNER: {
                                            const { shf = 1.0 } = eq.conditions as BurnerConditions;
                                            if (shf >= 1.0) { constrainedAbsHumidity = outletAbsHumiditySI; } 
                                            else if (shf > 0) {
                                                const slope = (1 / shf - 1) * (1.02 / 2.5);
                                                const t2_s = xScale(outletTempSI), x2_s = yScale(outletAbsHumiditySI);
                                                const dataSlopeToScreenSlope = -(height / 30) / (width / 80);
                                                const m_s = slope * dataSlopeToScreenSlope;
                                                const new_mx = (m_s * my + mx - m_s * x2_s + m_s * m_s * t2_s) / (m_s * m_s + 1);
                                                const new_my = m_s * (new_mx - t2_s) + x2_s;
                                                constrainedTemp = xScale.invert(new_mx);
                                                constrainedAbsHumidity = yScale.invert(new_my);
                                            }
                                            break;
                                        }
                                        case EquipmentType.STEAM_HUMIDIFIER: {
                                            const steamCond = eq.conditions as SteamHumidifierConditions;
                                            const steamProps = calculateSteamProperties(steamCond.steamGaugePressure ?? 100);
                                            const h_steam = steamProps.enthalpy;
                                            const c_pa_moist = PSYCH_CONSTANTS.SPECIFIC_HEAT_DRY_AIR + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * (outletAbsHumiditySI / 1000);
                                            const h_vapor_outlet = PSYCH_CONSTANTS.LATENT_HEAT_VAPORIZATION_0C + PSYCH_CONSTANTS.SPECIFIC_HEAT_WATER_VAPOR * outletTempSI;
                                            const denominator = h_steam - h_vapor_outlet;
                                            if (Math.abs(denominator) < 0.1) { constrainedTemp = outletTempSI; } 
                                            else {
                                                const slope_data = (1000 * c_pa_moist) / denominator;
                                                const p2_s = { x: xScale(outletTempSI), y: yScale(outletAbsHumiditySI) };
                                                const p1_s = { x: xScale(outletTempSI - 10), y: yScale(outletAbsHumiditySI - slope_data * 10) };
                                                if (Math.abs(p2_s.x - p1_s.x) < 1e-6) { constrainedTemp = outletTempSI; } 
                                                else {
                                                    const m_s = (p2_s.y - p1_s.y) / (p2_s.x - p1_s.x);
                                                    const new_mx = (m_s * my + mx - m_s * p1_s.y + m_s * m_s * p1_s.x) / (m_s * m_s + 1);
                                                    const new_my = m_s * (new_mx - p1_s.x) + p1_s.y;
                                                    constrainedTemp = xScale.invert(new_mx);
                                                    constrainedAbsHumidity = yScale.invert(new_my);
                                                }
                                            }
                                            break;
                                        }
                                        case EquipmentType.SPRAY_WASHER: {
                                            const h2 = eq.outletAir.enthalpy!;
                                            const p1_s = { x: xScale(60), y: yScale(calculateAbsoluteHumidityFromEnthalpy(60, h2)) };
                                            const p2_s = { x: xScale(-20), y: yScale(calculateAbsoluteHumidityFromEnthalpy(-20, h2)) };
                                            if (Math.abs(p2_s.x - p1_s.x) < 1e-6) { constrainedTemp = xScale.invert(p1_s.x); } 
                                            else {
                                                const m_s = (p2_s.y - p1_s.y) / (p2_s.x - p1_s.x);
                                                const new_mx = (m_s * my + mx - m_s * p1_s.y + m_s * m_s * p1_s.x) / (m_s * m_s + 1);
                                                const new_my = m_s * (new_mx - p1_s.x) + p1_s.y;
                                                constrainedTemp = xScale.invert(new_mx);
                                                constrainedAbsHumidity = yScale.invert(new_my);
                                            }
                                            break;
                                        }
                                    }
                                }
                                constrainedTemp = Math.max(xScale.domain()[0], Math.min(xScale.domain()[1], constrainedTemp));
                                constrainedAbsHumidity = Math.max(yScale.domain()[0], Math.min(yScale.domain()[1], constrainedAbsHumidity));
                                finalX = xScale(constrainedTemp);
                                finalY = yScale(constrainedAbsHumidity);
                            }

                            const finalPos = { temp: xScale.invert(finalX), absHumidity: yScale.invert(finalY) };
                            
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
                        const dragMode = select(this).property('__drag_mode__');
                        const finalPos = select(this).property('__latest_drag_pos__');
                        
                        snapHighlight.style("display", "none");
                        svg.selectAll(".snap-line-highlight").remove();
                        snapTargetsRef.current = { points: [], lines: [] };
                        
                        if (finalPos) {
                             if (dragMode === 'line') {
                                const finalInlet = calculateAirProperties(finalPos.inlet.temp, null, finalPos.inlet.absHumidity);
                                const finalOutlet = calculateAirProperties(finalPos.outlet.temp, null, finalPos.outlet.absHumidity);
                                onUpdate(eq.id, { inlet: finalInlet, outlet: finalOutlet });
                            } else if (dragMode === 'outlet') {
                                const finalOutletAir = calculateAirProperties(finalPos.outlet.temp, null, finalPos.outlet.absHumidity);
                                onUpdate(eq.id, { outlet: finalOutletAir });
                            } else if (dragMode === 'inlet') {
                                const finalInletAir = calculateAirProperties(finalPos.inlet.temp, null, finalPos.inlet.absHumidity);
                                onUpdate(eq.id, { inlet: finalInletAir });
                            }
                        }

                        // Reset visual styles
                        if (dragMode === 'inlet') inletDot.attr('r', 5);
                        else if (dragMode === 'outlet') outletDot.attr('r', 5);
                        else processLine.attr("stroke-width", 2.5);

                        // Clear all temporary properties
                        select(this)
                            .property('__drag_mode__', null)
                            .property('__start_pointer__', null)
                            .property('__start_pos__', null)
                            .property('__latest_drag_pos__', null);
                    });

                svg.append("line")
                    .attr("x1", xScale(inletTempSI)).attr("y1", yScale(inletAbsHumiditySI))
                    .attr("x2", xScale(outletTempSI)).attr("y2", yScale(outletAbsHumiditySI))
                    .attr("stroke", "transparent")
                    .attr("stroke-width", 20)
                    .style("cursor", "grab")
                    .call(processDrag);
            }
        });

    }, [airConditionsData, globalInletAir, globalOutletAir, unitSystem, width, height, t, isSplitViewActive, onUpdate]);

    return (
        <div
            ref={containerRef}
            className="w-full relative"
            style={{ aspectRatio: '3 / 2', minHeight: '300px' }}
        >
            <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0 }}></svg>
        </div>
    );
};

export default PsychrometricChart;