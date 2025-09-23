

import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

// The JSON files are embedded directly to ensure compatibility with browser-native ESM.
const enMessages = {
  "app": {
    "title": "Psychrometric Chart with Drag-and-Drop",
    "description": "This is a psychrometric calculation application for air conditioners. You can freely combine equipment such as filters, coils, and fans to simulate changes in air conditions. The results are also displayed on a psychrometric chart, allowing for visual analysis.",
    "instructionsTitle": "How to Use",
    "instructions": "1. Set the system airflow and the inlet/outlet conditions for the entire air conditioner.\n2. Add necessary equipment from the 'Add Equipment' section.\n3. Configure the conditions for each piece of equipment. The air state will be automatically calculated and passed downstream.\n4. Drag the points and lines on the psychrometric chart to intuitively adjust the air conditions.",
    "language": "Language",
    "unitSystem": "Unit System",
    "siUnits": "SI Units",
    "imperialUnits": "Imperial Units",
    "systemAirflow": "System Airflow",
    "acInletConditions": "Air Conditioner Inlet Conditions",
    "acOutletConditions": "Air Conditioner Outlet Conditions",
    "addEquipment": "Add Equipment",
    "deleteAllEquipment": "Delete All Equipment",
    "expandAll": "Expand All",
    "collapseAll": "Collapse All",
    "toggleExpand": "Toggle expand/collapse",
    "summary": "Summary",
    "configuration": "Configuration",
    "noEquipmentAdded": "No equipment added.",
    "pressureLoss": "Pressure Loss",
    "totalPressureLoss": "Total Pressure Loss:",
    "psychrometricChart": "Psychrometric Chart",
    "dataManagement": "Data Management",
    "importConfig": "Import Config",
    "exportConfig": "Export Config",
    "importSuccess": "Configuration imported successfully!",
    "importError": "Failed to import configuration. The file may be invalid or corrupted.",
    "copySuffix": " (Copy)",
    "duplicateProject": "Duplicate project",
    "allProjectsSummaryTab": "All Projects Summary",
    "allProjectsSummaryTitle": "All Projects Summary",
    "noProjects": "No projects exist. Click the '+' button in the tab bar to add a new one.",
    "disclaimerTitle": "Disclaimer",
    "disclaimerContent": "All calculation results and information provided by this application are for reference purposes only, and their completeness, accuracy, and usefulness are not guaranteed.\nUsers shall use this application at their own discretion and risk. Before applying the results obtained from this application to actual design, construction, or other professional work, please ensure they are verified by a qualified expert.\nThe developer assumes no responsibility for any damages (including but not to data loss, business interruption, or loss of profits) incurred by the user or any third party arising from the use of this application.\nThis disclaimer is subject to change without notice.",
    "select": "Select...",
    "selectEquipment": "Select an equipment tab to see details."
  },
  "equipment": {
    "pressureLoss": "Pressure Loss",
    "inletAir": "Inlet Air",
    "outletAir": "Outlet Air",
    "airConditions": "Air Conditions",
    "up": "Up",
    "down": "Down",
    "copyACInlet": "Copy temp/humidity from AC inlet",
    "copyUpstreamEquipment": "Copy temp/humidity from upstream equipment",
    "copyDownstreamEquipment": "Copy temp/humidity from downstream equipment",
    "copyACOutlet": "Copy temp/humidity from AC outlet",
    "delete": "Delete",
    "conditions": "Conditions",
    "results": "Calculation Results",
    "noResults": "No calculated results.",
    "referenceCalculation": "Reference Calculation",
    "inletLockedTooltip": "Inlet conditions are locked and will not update automatically from upstream. Edit values directly or click the sync button to unlock and follow upstream.",
    "inletUnlockedTooltip": "Inlet conditions are unlocked and will automatically update from upstream. Edit any value to lock it.",
    "warnings": {
      "burner": "Outlet temperature should be higher than inlet.",
      "cooling_coil_temp": "Outlet temperature should be lower than inlet.",
      "cooling_coil_humidity": "Outlet absolute humidity cannot be higher than inlet for a cooling process.",
      "heating_coil": "Outlet temperature should be higher than inlet."
    }
  },
  "equipmentNames": {
    "filter": "Filter",
    "burner": "Burner",
    "cooling_coil": "Chilled Water Coil",
    "heating_coil": "Hot Water Coil",
    "spray_washer": "Spray Washer",
    "steam_humidifier": "Steam Humidifier",
    "fan": "Fan",
    "custom": "Custom Equipment"
  },
  "equipmentDescriptions": {
    "filter": "A filter cleans the air by removing dust and impurities. In this process, there is no change in the air's temperature or humidity; only pressure loss occurs.",
    "burner": "A burner heats the air. It can add both sensible and latent heat.\n- Movement on Psychrometric Chart: Moves upwards and to the right.\n- Slope: The slope is determined by the SHF (Sensible Heat Factor). If SHF is 1.0, the process line is horizontal (sensible heat only). If SHF is less than 1.0, the slope increases (latent heat is added).",
    "cooling_coil": "A chilled water coil cools and dehumidifies the air.\n- Movement on Psychrometric Chart: Moves downwards and to the left.\n- Process: The air state changes along a line connecting the inlet air point and the Apparatus Dew Point (ADP). The Bypass Factor (BF) indicates the proportion of air that passes through the coil without changing its state.",
    "heating_coil": "A hot water coil heats the air. This process adds only sensible heat.\n- Movement on Psychrometric Chart: Moves horizontally to the right (absolute humidity remains constant).",
    "spray_washer": "A spray washer adiabatically humidifies and cools the air by spraying water.\n- Movement on Psychrometric Chart: Moves upwards and to the left along a constant enthalpy line.\n- Process: The enthalpy remains nearly constant during this process.",
    "steam_humidifier": "A steam humidifier adds moisture and heat to the air by directly injecting steam.\n- Movement on Psychrometric Chart: Moves upwards and to the right.",
    "fan": "A fan moves the air. Due to motor and fan efficiencies, some energy is converted into heat, slightly warming the air. This is a sensible heat only process.\n- Movement on Psychrometric Chart: Moves slightly horizontally to the right (absolute humidity remains constant).",
    "custom": "Custom equipment allows users to freely set the inlet and outlet air conditions. This enables specific calculations or simulations of equipment not on the list."
  },
  "conditions": {
    "width": "Width",
    "height": "Height",
    "thickness": "Thickness",
    "sheets": "Sheets",
    "shf": "SHF (Sensible Heat Factor)",
    "lowerHeatingValue": "Lower Heating Value",
    "chilledWaterInletTemp": "Chilled Water Inlet Temp",
    "chilledWaterOutletTemp": "Chilled Water Outlet Temp",
    "heatExchangeEfficiency": "Heat Exchange Efficiency",
    "hotWaterInletTemp": "Hot Water Inlet Temp",
    "hotWaterOutletTemp": "Hot Water Outlet Temp",
    "humidificationEfficiency": "Humidification Efficiency",
    "waterToAirRatio": "Water-to-Air Ratio (L/G)",
    "steamGaugePressure": "Steam Gauge Pressure",
    "motorOutput": "Motor Output",
    "motorEfficiency": "Motor Efficiency"
  },
  "results": {
    "faceVelocity": "Face Velocity",
    "treatedAirflowPerSheet": "Airflow/Sheet",
    "heatLoad": "Heat Load",
    "gasFlowRate": "Gas Flow Rate",
    "airSideHeatLoad": "Air-Side Heat Load",
    "coldWaterSideHeatLoad": "Chilled Water Side Heat Load",
    "chilledWaterFlow_L_min": "Chilled Water Flow",
    "dehumidification_L_min": "Dehumidification",
    "hotWaterSideHeatLoad": "Hot Water Side Heat Load",
    "hotWaterFlow_L_min": "Hot Water Flow",
    "humidification_L_min": "Humidification",
    "sprayAmount_L_min": "Spray Amount",
    "requiredSteamAmount": "Required Steam Amount",
    "steamAbsolutePressure": "Steam Absolute Pressure",
    "steamTemperature": "Steam Temperature",
    "steamEnthalpy": "Steam Enthalpy",
    "heatGeneration": "Heat Generation",
    "tempRise_deltaT_celsius": "Temp Rise ⊿T",
    "bypassFactor": "Bypass Factor",
    "contactFactor": "Contact Factor (Efficiency)",
    "apparatusDewPointTemp": "Apparatus Dew Point (ADP)"
  },
  "airProperties": {
    "temperature": "Temperature",
    "rh": "Relative Humidity",
    "abs_humidity": "Absolute Humidity",
    "enthalpy": "Enthalpy"
  },
  "units": {
    "pressure_units": {
      "pag": "PaG",
      "kpag": "kPaG",
      "mpag": "MPaG",
      "psig": "psiG",
      "barg": "barG",
      "kgfcm2g": "kgf/cm²G"
    },
    "si": {
        "airflow": "m³/min", "temperature": "℃", "temperature_delta": "℃", "length": "mm", "pressure": "Pa", "heat_load": "kW",
        "water_flow": "L/min", "abs_humidity": "g/kg(DA)", "enthalpy": "kJ/kg(DA)", "motor_power": "kW",
        "rh": "%", "sheets": "sheets", "shf": "", "efficiency": "%", "k_value": "", "velocity": "m/s",
        "airflow_per_sheet": "m³/min/sheet", "water_to_air_ratio": "", "area": "m²", "density": "kg/m³",
        "steam_pressure": "kPa", "steam_enthalpy": "kcal/kg", "steam_flow": "kg/h", "gas_flow": "m³/h",
        "lower_heating_value": "MJ/m³"
    },
    "imperial": {
        "airflow": "CFM", "temperature": "℉", "temperature_delta": "℉", "length": "in", "pressure": "in.w.g.", "heat_load": "BTU/h",
        "water_flow": "GPM", "abs_humidity": "gr/lb(DA)", "enthalpy": "BTU/lb(DA)", "motor_power": "HP",
        "rh": "%", "sheets": "sheets", "shf": "", "efficiency": "%", "k_value": "", "velocity": "fpm",
        "airflow_per_sheet": "CFM/sheet", "water_to_air_ratio": "", "area": "ft²", "density": "lb/ft³",
        "steam_pressure": "psi", "steam_enthalpy": "BTU/lb", "steam_flow": "lb/h", "gas_flow": "ft³/h",
        "lower_heating_value": "BTU/ft³"
    }
  },
  "chart": {
    "xAxisLabel": "Dry Bulb Temperature",
    "yAxisLabel": "Absolute Humidity",
    "acInlet": "AC Inlet",
    "acOutlet": "AC Outlet",
    "inlet": "Inlet",
    "outlet": "Outlet"
  },
  "adjacency": {
    "upstreamLabel": "Upstream Equipment",
    "downstreamLabel": "Downstream Equipment",
    "inletAirLabel": "Inlet Air",
    "outletAirLabel": "Outlet Air"
  },
  "summary": {
    "table": {
      "equipment": "Equipment",
      "inlet": "Inlet",
      "outlet": "Outlet",
      "temp": "Temp",
      "rh": "RH",
      "keyResults": "Key Results",
      "burnerLoad": "Burner Load",
      "coolingLoad": "Chilled Water Side Heat Load",
      "coolingFlow": "Chilled Water Flow",
      "heatingLoad": "Hot Water Side Heat Load",
      "heatingFlow": "Hot Water Flow",
      "steamFlow": "Steam Amount",
      "pressureLoss": "Pressure Loss",
      "totalPressureLoss": "Total Pressure Loss"
    }
  },
  "fab": {
    "toggleToSplitView": "Toggle to Split View",
    "toggleToSingleView": "Toggle to Single View"
  },
  "tooltips": {
    "airProperties": {
      "absHumidityFromTRh": {
        "title": "Absolute Humidity (from T, RH)",
        "si": {
          "formula": [
            "P_v = P_sat(t) * (rh / 100)",
            "x = 1000 * (0.622 * P_v) / (P_atm - P_v)"
          ],
          "legend": {
            "x": "Abs. Humidity (g/kg)", "t": "Temp (°C)", "rh": "Rel. Humidity (%)",
            "P_sat": "Sat. Vapor Pressure (Pa)", "P_v": "Vapor Pressure (Pa)", "P_atm": "Atm. Pressure (101325 Pa)"
          }
        },
        "imperial": {
          "formula": [
            "t_c = (t_f - 32) * 5/9",
            "P_v = P_sat(t_c) * (rh/100)",
            "x = 7000 * (0.622*P_v) / (P_atm - P_v)"
          ],
          "legend": {
            "x": "Abs. Humidity (gr/lb)", "t_f": "Temp (°F)", "rh": "Rel. Humidity (%)",
            "P_sat": "Sat. Vapor Pressure (Pa)", "P_v": "Vapor Pressure (Pa)", "P_atm": "Atm. Pressure (101325 Pa)"
          }
        }
      },
      "enthalpyFromTX": {
        "title": "Enthalpy (from T, x)",
        "si": {
          "formula": "h = 1.006*t + (x/1000)*(2501 + 1.86*t)",
          "legend": { "h": "Enthalpy (kJ/kg)", "t": "Temp (°C)", "x": "Abs. Humidity (g/kg)" }
        },
        "imperial": {
          "formula": "h = 0.24*t + (x/7000)*(1061 + 0.444*t)",
          "legend": { "h": "Enthalpy (BTU/lb)", "t": "Temp (°F)", "x": "Abs. Humidity (gr/lb)" }
        }
      },
      "rhFromTX": {
        "title": "Relative Humidity (from T, x)",
        "si": {
          "formula": [
            "P_v = (P_atm * (x/1000)) / (0.622 + (x/1000))",
            "rh = (P_v / P_sat(t)) * 100"
          ],
          "legend": {
            "rh": "Rel. Humidity (%)", "t": "Temp (°C)", "x": "Abs. Humidity (g/kg)",
            "P_v": "Vapor Pressure (Pa)", "P_sat": "Sat. Vapor Pressure (Pa)"
          }
        },
        "imperial": {
          "formula": [
            "t_c = (t_f - 32) * 5/9",
            "P_v = (P_atm*(x/7000))/(0.622+(x/7000))",
            "rh = (P_v / P_sat(t_c)) * 100"
          ],
          "legend": {
            "rh": "Rel. Humidity (%)", "t_f": "Temp (°F)", "x": "Abs. Humidity (gr/lb)",
            "P_v": "Vapor Pressure (Pa)", "P_sat": "Sat. Vapor Pressure (Pa)"
          }
        }
      },
      "absHumidityFromTH": {
        "title": "Absolute Humidity (from T, h)",
        "si": {
          "formula": "x = 1000*(h - 1.006*t) / (2501 + 1.86*t)",
          "legend": { "x": "Abs. Humidity (g/kg)", "h": "Enthalpy (kJ/kg)", "t": "Temp (°C)" }
        },
        "imperial": {
          "formula": "x = 7000*(h - 0.24*t) / (1061 + 0.444*t)",
          "legend": { "x": "Abs. Humidity (gr/lb)", "h": "Enthalpy (BTU/lb)", "t": "Temp (°F)" }
        }
      },
      "constantAbsHumidity": {
        "title": "Absolute Humidity (Sensible Process)",
        "si": {
          "formula": "x_out = x_in",
          "legend": { "x_out": "Outlet Abs. Hum. (g/kg)", "x_in": "Inlet Abs. Hum. (g/kg)" }
        },
        "imperial": {
          "formula": "x_out = x_in",
          "legend": { "x_out": "Outlet Abs. Hum. (gr/lb)", "x_in": "Inlet Abs. Hum. (gr/lb)" }
        }
      }
    },
    "filter": {
      "faceVelocity": {
        "title": "Face Velocity",
        "si": {
          "formula": "v = (q / 60) / a_total",
          "legend": { "v": "Velocity (m/s)", "q": "Airflow (m³/min)", "a_total": "Total Area (m²)" }
        },
        "imperial": {
          "formula": "v = q / a_total",
          "legend": { "v": "Velocity (fpm)", "q": "Airflow (CFM)", "a_total": "Total Area (ft²)" }
        }
      },
      "airflowPerSheet": {
        "title": "Airflow per Sheet",
        "si": {
          "formula": "q_sheet = q / n",
          "legend": { "q_sheet": "Airflow/Sheet (m³/min)", "q": "Total Airflow (m³/min)", "n": "Num. of Sheets" }
        },
        "imperial": {
          "formula": "q_sheet = q / n",
          "legend": { "q_sheet": "Airflow/Sheet (CFM)", "q": "Total Airflow (CFM)", "n": "Num. of Sheets" }
        }
      }
    },
    "burner": {
      "heatLoad": {
        "title": "Heat Load",
        "si": {
          "formula": "Q_kW = G * (h_out - h_in)",
          "legend": { "Q": "Heat Load (kW)", "G": "Mass Flow (kg/s)", "h_in": "Inlet Enthalpy (kJ/kg)", "h_out": "Outlet Enthalpy (kJ/kg)" }
        },
        "imperial": {
          "formula": "Q_BTUh = 4.5 * q * (h_out - h_in)",
          "legend": { "Q": "Heat Load (BTU/h)", "q": "Airflow (CFM)", "h_in": "Inlet Enthalpy (BTU/lb)", "h_out": "Outlet Enthalpy (BTU/lb)" }
        }
      },
      "gasFlowRate": {
        "title": "Gas Flow Rate",
        "si": {
          "formula": "V = (Q_kW * 3.6) / H_l",
          "legend": {
            "V": "Flow Rate (m³/h)",
            "Q_kW": "Heat Load (kW)",
            "H_l": "Lower Heating Value (MJ/m³)"
          }
        },
        "imperial": {
          "formula": "V = Q_BTUh / H_l",
          "legend": {
            "V": "Flow Rate (ft³/h)",
            "Q_BTUh": "Heat Load (BTU/h)",
            "H_l": "Lower Heating Value (BTU/ft³)"
          }
        }
      },
      "heatingValueReference": {
        "title": "Heating Value Reference",
        "gasType": "Gas Type",
        "hhv": "HHV",
        "lhv": "LHV",
        "gases": {
          "natural_gas": "Natural Gas (13A)",
          "city_gas": "City Gas (4B)",
          "lpg": "LPG (Propane)"
        }
      }
    },
    "coil": {
      "airSideHeatLoad": {
        "title": "Air-Side Heat Load",
        "si": {
          "formula": "Q_kW = G * |h_in - h_out|",
          "legend": { "Q": "Heat Load (kW)", "G": "Mass Flow (kg/s)", "h_in": "Inlet Enthalpy (kJ/kg)", "h_out": "Outlet Enthalpy (kJ/kg)" }
        },
        "imperial": {
          "formula": "Q_BTUh = 4.5 * q * |h_in - h_out|",
          "legend": { "Q": "Heat Load (BTU/h)", "q": "Airflow (CFM)", "h_in": "Inlet Enthalpy (BTU/lb)", "h_out": "Outlet Enthalpy (BTU/lb)" }
        }
      },
      "waterSideHeatLoad": {
        "title": "Water-Side Heat Load",
        "si": {
          "formula": "Q_water = Q_air / (η / 100)",
          "legend": { "Q_water": "Water Load (kW)", "Q_air": "Air Load (kW)", "η": "Efficiency (%)" }
        },
        "imperial": {
          "formula": "Q_water = Q_air / (η / 100)",
          "legend": { "Q_water": "Water Load (BTU/h)", "Q_air": "Air Load (BTU/h)", "η": "Efficiency (%)" }
        }
      },
      "waterFlow": {
        "title": "Water Flow",
        "si": {
          "formula": "L = (Q_kW * 60) / (4.186 * Δt_w)",
          "legend": { "L": "Flow (L/min)", "Q_kW": "Load (kW)", "Δt_w": "Water Temp Diff (°C)" }
        },
        "imperial": {
          "formula": "GPM = Q_BTUh / (500 * Δt_w)",
          "legend": { "GPM": "Flow (GPM)", "Q_BTUh": "Load (BTU/h)", "Δt_w": "Water Temp Diff (°F)" }
        }
      },
      "dehumidification": {
        "title": "Dehumidification",
        "si": {
          "formula": "D = (G * |x_in - x_out| / 1000) * 60",
          "legend": { "D": "Rate (L/min)", "G": "Mass Flow (kg/s)", "x": "Abs. Hum. (g/kg)" }
        },
        "imperial": {
          "formula": "D_gpm = (q*4.5*|x_in-x_out|)/(7000*8.34)",
          "legend": { "D_gpm": "Rate (GPM)", "q": "Airflow (CFM)", "x": "Abs. Hum. (gr/lb)" }
        }
      },
      "bypassFactor": {
        "title": "Bypass Factor",
        "si": {
          "formula": "BF = (t_out - t_adp) / (t_in - t_adp)",
          "legend": { "BF": "Bypass Factor", "t_in": "Inlet Temp (°C)", "t_out": "Outlet Temp (°C)", "t_adp": "ADP Temp (°C)" }
        },
        "imperial": {
          "formula": "BF = (t_out - t_adp) / (t_in - t_adp)",
          "legend": { "BF": "Bypass Factor", "t_in": "Inlet Temp (°F)", "t_out": "Outlet Temp (°F)", "t_adp": "ADP Temp (°F)" }
        }
      },
      "contactFactor": {
        "title": "Contact Factor (Efficiency)",
        "si": { "formula": "CF = 1 - BF", "legend": { "CF": "Contact Factor", "BF": "Bypass Factor" } },
        "imperial": { "formula": "CF = 1 - BF", "legend": { "CF": "Contact Factor", "BF": "Bypass Factor" } }
      },
      "apparatusDewPointTemp": {
        "title": "Apparatus Dew Point (ADP)",
        "si": {
          "formula": "t_adp = (t_out - t_in * BF) / (1 - BF)",
          "legend": { "t_adp": "ADP Temp (°C)", "t_in": "Inlet Temp (°C)", "t_out": "Outlet Temp (°C)", "BF": "Bypass Factor" }
        },
        "imperial": {
          "formula": "t_adp = (t_out - t_in * BF) / (1 - BF)",
          "legend": { "t_adp": "ADP Temp (°F)", "t_in": "Inlet Temp (°F)", "t_out": "Outlet Temp (°F)", "BF": "Bypass Factor" }
        }
      },
      "apparatusDewPointTempSensible": {
        "title": "Inlet Dew Point (Sensible Cooling)",
        "si": {
          "formula": "No dehumidification. Value is inlet air's dew point. ADP is not applicable.",
          "legend": {
            "t_dp": "Dew Point Temp (°C)",
            "t_in": "Inlet Temp (°C)",
            "rh_in": "Inlet RH (%)"
          }
        },
        "imperial": {
          "formula": "No dehumidification. Value is inlet air's dew point. ADP is not applicable.",
          "legend": {
            "t_dp": "Dew Point Temp (°F)",
            "t_in": "Inlet Temp (°F)",
            "rh_in": "Inlet RH (%)"
          }
        }
      }
    },
    "spray_washer": {
      "humidification": {
        "title": "Humidification",
        "si": {
          "formula": "M = (G * (x_out - x_in) / 1000) * 60",
          "legend": { "M": "Rate (L/min)", "G": "Mass Flow (kg/s)", "x": "Abs. Hum. (g/kg)" }
        },
        "imperial": {
          "formula": "M_gpm = (q*4.5*(x_out-x_in))/(7000*8.34)",
          "legend": { "M_gpm": "Rate (GPM)", "q": "Airflow (CFM)", "x": "Abs. Hum. (gr/lb)" }
        }
      },
      "sprayAmount": {
        "title": "Spray Amount",
        "si": {
          "formula": "S = G * (L/G) * 60",
          "legend": { "S": "Amount (L/min)", "G": "Mass Flow (kg/s)", "L/G": "Water-Air Ratio" }
        },
        "imperial": {
          "formula": "S_gpm = (q * ρ * (L/G)) / 8.34",
          "legend": { "S_gpm": "Amount (GPM)", "q": "Airflow (CFM)", "ρ": "Air Density (~0.075 lb/ft³)", "L/G": "Water-Air Ratio" }
        }
      },
      "humidificationEfficiency": {
        "title": "Humidification Efficiency",
        "si": {
          "formula": "η = (x_out-x_in)/(x_sat-x_in)*100",
          "legend": { "η": "Efficiency (%)", "x": "Abs. Hum. (g/kg)", "x_sat": "Sat. Abs. Hum. (g/kg)" }
        },
        "imperial": {
          "formula": "η = (x_out-x_in)/(x_sat-x_in)*100",
          "legend": { "η": "Efficiency (%)", "x": "Abs. Hum. (gr/lb)", "x_sat": "Sat. Abs. Hum. (gr/lb)" }
        }
      },
      "outletTemp": {
        "title": "Outlet Temperature (from RH)",
        "si": {
          "formula": "Calculated to match RH_out at constant enthalpy (h_in).",
          "legend": {
            "t_out": "Outlet Temp (°C)",
            "h_in": "Inlet Enthalpy (kJ/kg)",
            "RH_out": "Target Outlet RH (%)"
          }
        },
        "imperial": {
          "formula": "Calculated to match RH_out at constant enthalpy (h_in).",
          "legend": {
            "t_out": "Outlet Temp (°F)",
            "h_in": "Inlet Enthalpy (BTU/lb)",
            "RH_out": "Target Outlet RH (%)"
          }
        }
      }
    },
    "steam_humidifier": {
      "outletTemp": {
        "title": "Outlet Temperature (from RH)",
        "si": {
          "formula": "h_out - (x_out/1000)*h_steam = h_in - (x_in/1000)*h_steam",
          "legend": {
            "t_out": "Outlet Temp (°C)", "h_in": "Inlet Enthalpy (kJ/kg)", "x_in": "Inlet Abs. Hum. (g/kg)",
            "h_steam": "Steam Enthalpy (kJ/kg)", "RH_out": "Target Outlet RH (%)"
          }
        },
        "imperial": {
          "formula": "Calculated to satisfy enthalpy balance for the target RH_out.",
          "legend": {
            "t_out": "Outlet Temp (°F)", "h_in": "Inlet Enthalpy (BTU/lb)", "x_in": "Inlet Abs. Hum. (gr/lb)",
            "h_steam": "Steam Enthalpy (BTU/lb)", "RH_out": "Target Outlet RH (%)"
          }
        }
      },
      "requiredSteam": {
        "title": "Required Steam Amount",
        "si": {
          "formula": "M = G * (x_out - x_in) / 1000 * 3600",
          "legend": { "M": "Rate (kg/h)", "G": "Mass Flow (kg/s)", "x": "Abs. Hum. (g/kg)" }
        },
        "imperial": {
          "formula": "M_lbh = (q*4.5*(x_out-x_in))/7000",
          "legend": { "M_lbh": "Rate (lb/h)", "q": "Airflow (CFM)", "x": "Abs. Hum. (gr/lb)" }
        }
      },
      "steamAbsolutePressure": {
        "title": "Steam Absolute Pressure",
        "si": {
          "formula": "P_abs = P_gauge + P_atm",
          "legend": { "P_abs": "Abs. Pressure (kPa)", "P_gauge": "Gauge Pressure (kPa)", "P_atm": "Atm. Pressure (101.325 kPa)" }
        },
        "imperial": {
          "formula": "P_abs = P_gauge + P_atm",
          "legend": { "P_abs": "Abs. Pressure (psi)", "P_gauge": "Gauge Pressure (psi)", "P_atm": "Atm. Pressure (14.7 psi)" }
        }
      },
      "steamProperties": {
        "title": "Steam Properties (from Pressure)",
        "si": {
          "formula": "Calculated by interpolation from a steam table based on absolute pressure.",
          "legend": { "T_steam": "Steam Temp (°C)", "h_steam": "Steam Enthalpy (kcal/kg)", "P_abs": "Abs. Pressure (kPa)" }
        },
        "imperial": {
          "formula": "Calculated by interpolation from a steam table based on absolute pressure.",
          "legend": { "T_steam": "Steam Temp (°F)", "h_steam": "Steam Enthalpy (BTU/lb)", "P_abs": "Abs. Pressure (psi)" }
        }
      }
    },
    "fan": {
        "heatGeneration": {
            "title": "Heat Generation",
            "si": {
                "formula": "Q_kW = P * (1 - η / 100)",
                "legend": { "Q_kW": "Heat (kW)", "P": "Motor Power (kW)", "η": "Efficiency (%)" }
            },
            "imperial": {
                "formula": "Q_BTUh = P_HP * 2545 * (1 - η / 100)",
                "legend": { "Q_BTUh": "Heat (BTU/h)", "P_HP": "Motor Power (HP)", "η": "Efficiency (%)" }
            }
        },
        "tempRise": {
            "title": "Temperature Rise",
            "si": {
                "formula": "Δt = Q_kW / (G * Cpa_moist)",
                "legend": { "Δt": "Temp Rise (°C)", "Q_kW": "Heat (kW)", "G": "Mass Flow (kg/s)", "Cpa_moist": "Specific heat of moist air" }
            },
            "imperial": {
                "formula": "Δt = Q_BTUh / (1.08 * q)",
                "legend": { "Δt": "Temp Rise (°F)", "Q_BTUh": "Heat (BTU/h)", "q": "Airflow (CFM)" }
            }
        },
        "outletTemp": {
            "title": "Outlet Temperature",
            "si": {
                "formula": "t_out = t_in + Δt",
                "legend": { "t_out": "Outlet Temp (°C)", "t_in": "Inlet Temp (°C)", "Δt": "Temp Rise (°C)" }
            },
            "imperial": {
                "formula": "t_out = t_in + Δt",
                "legend": { "t_out": "Outlet Temp (°F)", "t_in": "Inlet Temp (°F)", "Δt": "Temp Rise (°F)" }
            }
        }
    },
    "damper": {
      "airVelocity": {
        "title": "Air Velocity",
        "si": {
          "formula": "v = (q / 60) / A",
          "legend": { "v": "Velocity (m/s)", "q": "Airflow (m³/min)", "A": "Area (m²)" }
        },
        "imperial": {
          "formula": "v = q / A",
          "legend": { "v": "Velocity (fpm)", "q": "Airflow (CFM)", "A": "Area (ft²)" }
        }
      },
      "pressureLoss": {
        "title": "Pressure Loss",
        "si": {
          "formula": "ΔP = K * 0.5 * ρ * v²",
          "legend": { "ΔP": "Pressure Loss (Pa)", "K": "K-factor", "ρ": "Density (kg/m³)", "v": "Velocity (m/s)" }
        },
        "imperial": {
          "formula": "ΔP = K * (v / 4005)²",
          "legend": { "ΔP": "Pressure Loss (in.w.g.)", "K": "K-factor", "v": "Velocity (fpm)" }
        }
      }
    }
  }
};
const jaMessages = {
  "app": {
    "title": "ドラッグして空気線図",
    "description": "これは空調器の湿り空気線図計算アプリケーションです。フィルター、コイル、ファンなどの機器を自由に組み合わせて、空気の状態変化をシミュレーションできます。結果は湿り空気線図にも表示され、視覚的な分析が可能です。",
    "instructionsTitle": "使い方",
    "instructions": "1. システムの風量と空調器全体の入口・出口条件を設定します。\n2. 「機器の追加」セクションから必要な機器を追加します。\n3. 各機器の条件を設定します。空気の状態は自動的に計算され、下流に引き継がれます。\n4. 湿り空気線図上の点や線をドラッグして、直感的に空気の状態を調整します。",
    "language": "言語",
    "unitSystem": "単位系",
    "siUnits": "SI単位",
    "imperialUnits": "ヤード・ポンド法",
    "systemAirflow": "システム風量",
    "acInletConditions": "空調器入口条件",
    "acOutletConditions": "空調器出口条件",
    "addEquipment": "機器の追加",
    "deleteAllEquipment": "すべての機器を削除",
    "expandAll": "すべて展開",
    "collapseAll": "すべてたたむ",
    "toggleExpand": "展開/折りたたみを切り替え",
    "summary": "サマリー",
    "configuration": "設定",
    "noEquipmentAdded": "機器が追加されていません。",
    "pressureLoss": "圧力損失",
    "totalPressureLoss": "合計圧力損失:",
    "psychrometricChart": "湿り空気線図",
    "dataManagement": "データ管理",
    "importConfig": "設定のインポート",
    "exportConfig": "設定のエクスポート",
    "importSuccess": "設定が正常にインポートされました！",
    "importError": "設定のインポートに失敗しました。ファイルが無効か破損している可能性があります。",
    "copySuffix": " (コピー)",
    "duplicateProject": "プロジェクトを複製",
    "allProjectsSummaryTab": "全プロジェクト概要",
    "allProjectsSummaryTitle": "全プロジェクト概要",
    "noProjects": "プロジェクトが存在しません。タブバーの「+」ボタンをクリックして新しいプロジェクトを追加してください。",
    "disclaimerTitle": "免責事項",
    "disclaimerContent": "本アプリケーションが提供するすべての計算結果および情報は参考目的であり、その完全性、正確性、有用性を保証するものではありません。\nユーザーは自己の判断と責任において本アプリケーションを使用するものとします。本アプリケーションから得られた結果を実際の設計、施工、その他の専門的な業務に適用する前に、必ず資格のある専門家による検証を行ってください。\n開発者は、本アプリケーションの使用に起因してユーザーまたは第三者に生じたいかなる損害（データの損失、業務の中断、逸失利益を含むがこれらに限定されない）についても、一切の責任を負いません。\nこの免責事項は予告なく変更されることがあります。",
    "select": "選択...",
    "selectEquipment": "機器タブを選択して詳細を表示します。"
  },
  "equipment": {
    "pressureLoss": "圧力損失",
    "inletAir": "入口空気",
    "outletAir": "出口空気",
    "airConditions": "空気状態",
    "up": "上へ",
    "down": "下へ",
    "copyACInlet": "空調器入口の温湿度をコピー",
    "copyUpstreamEquipment": "上流機器の温湿度をコピー",
    "copyDownstreamEquipment": "下流機器の温湿度をコピー",
    "copyACOutlet": "空調器出口の温湿度をコピー",
    "delete": "削除",
    "conditions": "条件",
    "results": "計算結果",
    "noResults": "計算結果はありません。",
    "referenceCalculation": "参考計算",
    "inletLockedTooltip": "入口条件はロックされており、上流から自動更新されません。値を直接編集するか、同期ボタンをクリックしてロックを解除し、上流に追従させます。",
    "inletUnlockedTooltip": "入口条件はロック解除されており、上流から自動更新されます。値を編集するとロックされます。",
    "warnings": {
      "burner": "出口温度は入口温度より高くする必要があります。",
      "cooling_coil_temp": "出口温度は入口温度より低くする必要があります。",
      "cooling_coil_humidity": "冷却プロセスでは、出口の絶対湿度は入口より高くすることはできません。",
      "heating_coil": "出口温度は入口温度より高くする必要があります。"
    }
  },
  "equipmentNames": {
    "filter": "フィルター",
    "burner": "バーナー",
    "cooling_coil": "冷水コイル",
    "heating_coil": "温水コイル",
    "spray_washer": "スプレーワッシャー",
    "steam_humidifier": "蒸気加湿器",
    "fan": "ファン",
    "custom": "カスタム機器"
  },
  "equipmentDescriptions": {
    "filter": "フィルターは空気をろ過し、塵や不純物を除去します。このプロセスでは、空気の温度や湿度に変化はなく、圧力損失のみが発生します。",
    "burner": "バーナーは空気を加熱します。顕熱と潜熱の両方を加えることができます。\n・空気線図上の動き: 右肩上がりに変化します。\n・傾き: 傾きはSHF(顕熱比)によって決まります。SHFが1.0の場合、プロセスラインは水平(顕熱のみ)になり、SHFが1.0未満の場合、傾きは大きくなります(潜熱が加わる)。",
    "cooling_coil": "冷水コイルは空気を冷却・除湿します。\n・空気線図上の動き: 左下方向に変化します。\n・プロセス: 空気の状態は、入口空気点と装置露点温度(ADP)を結ぶ線に沿って変化します。バイパスファクター(BF)は、コイルを通過せずに状態が変化しない空気の割合を示します。",
    "heating_coil": "温水コイルは空気を加熱します。このプロセスは顕熱のみを加えます。\n・空気線図上の動き: 水平右方向に変化します(絶対湿度は一定)。",
    "spray_washer": "スプレーワッシャーは、水を噴霧して空気を断熱的に加湿・冷却します。\n・空気線図上の動き: 等エンタルピー線に沿って左上方向に変化します。\n・プロセス: このプロセスではエンタルピーがほぼ一定に保たれます。",
    "steam_humidifier": "蒸気加湿器は、蒸気を直接吹き込むことで空気を加湿・加熱します。\n・空気線図上の動き: 右上方向に変化します。",
    "fan": "ファンは空気を送風します。モーターと送風機の効率により、エネルギーの一部が熱に変換され、空気をわずかに加熱します。これは顕熱のみのプロセスです。\n・空気線図上の動き: 水平右方向にわずかに変化します(絶対湿度は一定)。",
    "custom": "カスタム機器では、入口と出口の空気条件をユーザーが自由に設定できます。これにより、特定の計算や、リストにない機器のシミュレーションが可能です。"
  },
  "conditions": {
    "width": "幅",
    "height": "高さ",
    "thickness": "厚さ",
    "sheets": "枚数",
    "shf": "SHF (顕熱比)",
    "lowerHeatingValue": "低位発熱量",
    "chilledWaterInletTemp": "冷水入口温度",
    "chilledWaterOutletTemp": "冷水出口温度",
    "heatExchangeEfficiency": "熱交換効率",
    "hotWaterInletTemp": "温水入口温度",
    "hotWaterOutletTemp": "温水出口温度",
    "humidificationEfficiency": "加湿効率",
    "waterToAirRatio": "水空気比 (L/G)",
    "steamGaugePressure": "蒸気ゲージ圧",
    "motorOutput": "モーター出力",
    "motorEfficiency": "モーター効率"
  },
  "results": {
    "faceVelocity": "面速",
    "treatedAirflowPerSheet": "風量/枚",
    "heatLoad": "加熱量",
    "gasFlowRate": "ガス流量",
    "airSideHeatLoad": "空気側熱量",
    "coldWaterSideHeatLoad": "冷水側熱量",
    "chilledWaterFlow_L_min": "冷水流量",
    "dehumidification_L_min": "除湿量",
    "hotWaterSideHeatLoad": "温水側熱量",
    "hotWaterFlow_L_min": "温水流量",
    "humidification_L_min": "加湿量",
    "sprayAmount_L_min": "噴霧量",
    "requiredSteamAmount": "必要蒸気量",
    "steamAbsolutePressure": "蒸気絶対圧",
    "steamTemperature": "蒸気温度",
    "steamEnthalpy": "蒸気エンタルピー",
    "heatGeneration": "発熱量",
    "tempRise_deltaT_celsius": "温度上昇 ⊿T",
    "bypassFactor": "バイパスファクター",
    "contactFactor": "接触係数（効率）",
    "apparatusDewPointTemp": "装置露点温度(ADP)"
  },
  "airProperties": {
    "temperature": "温度",
    "rh": "相対湿度",
    "abs_humidity": "絶対湿度",
    "enthalpy": "エンタルピー"
  },
  "units": {
    "pressure_units": {
      "pag": "PaG",
      "kpag": "kPaG",
      "mpag": "MPaG",
      "psig": "psiG",
      "barg": "barG",
      "kgfcm2g": "kgf/cm²G"
    },
    "si": {
        "airflow": "m³/min", "temperature": "℃", "temperature_delta": "℃", "length": "mm", "pressure": "Pa", "heat_load": "kW",
        "water_flow": "L/min", "abs_humidity": "g/kg(DA)", "enthalpy": "kJ/kg(DA)", "motor_power": "kW",
        "rh": "%", "sheets": "枚", "shf": "", "efficiency": "%", "k_value": "", "velocity": "m/s",
        "airflow_per_sheet": "m³/min/枚", "water_to_air_ratio": "", "area": "m²", "density": "kg/m³",
        "steam_pressure": "kPa", "steam_enthalpy": "kcal/kg", "steam_flow": "kg/h", "gas_flow": "m³/h",
        "lower_heating_value": "MJ/m³"
    },
    "imperial": {
        "airflow": "CFM", "temperature": "℉", "temperature_delta": "℉", "length": "in", "pressure": "in.w.g.", "heat_load": "BTU/h",
        "water_flow": "GPM", "abs_humidity": "gr/lb(DA)", "enthalpy": "BTU/lb(DA)", "motor_power": "HP",
        "rh": "%", "sheets": "sheets", "shf": "", "efficiency": "%", "k_value": "", "velocity": "fpm",
        "airflow_per_sheet": "CFM/sheet", "water_to_air_ratio": "", "area": "ft²", "density": "lb/ft³",
        "steam_pressure": "psi", "steam_enthalpy": "BTU/lb", "steam_flow": "lb/h", "gas_flow": "ft³/h",
        "lower_heating_value": "BTU/ft³"
    }
  },
  "chart": {
    "xAxisLabel": "乾球温度",
    "yAxisLabel": "絶対湿度",
    "acInlet": "空調器入口",
    "acOutlet": "空調器出口",
    "inlet": "入口",
    "outlet": "出口"
  },
  "adjacency": {
    "upstreamLabel": "上流機器",
    "downstreamLabel": "下流機器",
    "inletAirLabel": "入口空気",
    "outletAirLabel": "出口空気"
  },
  "summary": {
    "table": {
      "equipment": "機器",
      "inlet": "入口",
      "outlet": "出口",
      "temp": "温度",
      "rh": "RH",
      "keyResults": "主要結果",
      "burnerLoad": "バーナー負荷",
      "coolingLoad": "冷水側熱量",
      "coolingFlow": "冷水流量",
      "heatingLoad": "温水側熱量",
      "heatingFlow": "温水流量",
      "steamFlow": "蒸気量",
      "pressureLoss": "圧力損失",
      "totalPressureLoss": "合計圧力損失"
    }
  },
  "fab": {
    "toggleToSplitView": "分割表示に切り替え",
    "toggleToSingleView": "単一表示に切り替え"
  },
  "tooltips": {
    "airProperties": {
      "absHumidityFromTRh": {
        "title": "絶対湿度 (T, RHから)",
        "si": {
          "formula": [
            "P_v = P_sat(t) * (rh / 100)",
            "x = 1000 * (0.622 * P_v) / (P_atm - P_v)"
          ],
          "legend": {
            "x": "絶対湿度 (g/kg)", "t": "温度 (°C)", "rh": "相対湿度 (%)",
            "P_sat": "飽和水蒸気圧 (Pa)", "P_v": "水蒸気分圧 (Pa)", "P_atm": "大気圧 (101325 Pa)"
          }
        },
        "imperial": {
          "formula": [
            "t_c = (t_f - 32) * 5/9",
            "P_v = P_sat(t_c) * (rh/100)",
            "x = 7000 * (0.622*P_v) / (P_atm - P_v)"
          ],
          "legend": {
            "x": "絶対湿度 (gr/lb)", "t_f": "温度 (°F)", "rh": "相対湿度 (%)",
            "P_sat": "飽和水蒸気圧 (Pa)", "P_v": "水蒸気分圧 (Pa)", "P_atm": "大気圧 (101325 Pa)"
          }
        }
      },
      "enthalpyFromTX": {
        "title": "エンタルピー (T, xから)",
        "si": {
          "formula": "h = 1.006*t + (x/1000)*(2501 + 1.86*t)",
          "legend": { "h": "エンタルピー (kJ/kg)", "t": "温度 (°C)", "x": "絶対湿度 (g/kg)" }
        },
        "imperial": {
          "formula": "h = 0.24*t + (x/7000)*(1061 + 0.444*t)",
          "legend": { "h": "エンタルピー (BTU/lb)", "t": "温度 (°F)", "x": "絶対湿度 (gr/lb)" }
        }
      },
      "rhFromTX": {
        "title": "相対湿度 (T, xから)",
        "si": {
          "formula": [
            "P_v = (P_atm * (x/1000)) / (0.622 + (x/1000))",
            "rh = (P_v / P_sat(t)) * 100"
          ],
          "legend": {
            "rh": "相対湿度 (%)", "t": "温度 (°C)", "x": "絶対湿度 (g/kg)",
            "P_v": "水蒸気分圧 (Pa)", "P_sat": "飽和水蒸気圧 (Pa)"
          }
        },
        "imperial": {
          "formula": [
            "t_c = (t_f - 32) * 5/9",
            "P_v = (P_atm*(x/7000))/(0.622+(x/7000))",
            "rh = (P_v / P_sat(t_c)) * 100"
          ],
          "legend": {
            "rh": "相対湿度 (%)", "t_f": "温度 (°F)", "x": "絶対湿度 (gr/lb)",
            "P_v": "水蒸気分圧 (Pa)", "P_sat": "飽和水蒸気圧 (Pa)"
          }
        }
      },
      "absHumidityFromTH": {
        "title": "絶対湿度 (T, hから)",
        "si": {
          "formula": "x = 1000*(h - 1.006*t) / (2501 + 1.86*t)",
          "legend": { "x": "絶対湿度 (g/kg)", "h": "エンタルピー (kJ/kg)", "t": "温度 (°C)" }
        },
        "imperial": {
          "formula": "x = 7000*(h - 0.24*t) / (1061 + 0.444*t)",
          "legend": { "x": "絶対湿度 (gr/lb)", "h": "エンタルピー (BTU/lb)", "t": "温度 (°F)" }
        }
      },
      "constantAbsHumidity": {
        "title": "絶対湿度 (顕熱プロセス)",
        "si": {
          "formula": "x_out = x_in",
          "legend": { "x_out": "出口絶対湿度 (g/kg)", "x_in": "入口絶対湿度 (g/kg)" }
        },
        "imperial": {
          "formula": "x_out = x_in",
          "legend": { "x_out": "出口絶対湿度 (gr/lb)", "x_in": "入口絶対湿度 (gr/lb)" }
        }
      }
    },
    "filter": {
      "faceVelocity": {
        "title": "面速",
        "si": {
          "formula": "v = (q / 60) / a_total",
          "legend": { "v": "速度 (m/s)", "q": "風量 (m³/min)", "a_total": "全面積 (m²)" }
        },
        "imperial": {
          "formula": "v = q / a_total",
          "legend": { "v": "速度 (fpm)", "q": "風量 (CFM)", "a_total": "全面積 (ft²)" }
        }
      },
      "airflowPerSheet": {
        "title": "枚あたり風量",
        "si": {
          "formula": "q_sheet = q / n",
          "legend": { "q_sheet": "枚あたり風量 (m³/min)", "q": "総風量 (m³/min)", "n": "枚数" }
        },
        "imperial": {
          "formula": "q_sheet = q / n",
          "legend": { "q_sheet": "枚あたり風量 (CFM)", "q": "総風量 (CFM)", "n": "枚数" }
        }
      }
    },
    "burner": {
      "heatLoad": {
        "title": "加熱量",
        "si": {
          "formula": "Q_kW = G * (h_out - h_in)",
          "legend": { "Q": "加熱量 (kW)", "G": "質量流量 (kg/s)", "h_in": "入口エンタルピー (kJ/kg)", "h_out": "出口エンタルピー (kJ/kg)" }
        },
        "imperial": {
          "formula": "Q_BTUh = 4.5 * q * (h_out - h_in)",
          "legend": { "Q": "加熱量 (BTU/h)", "q": "風量 (CFM)", "h_in": "入口エンタルピー (BTU/lb)", "h_out": "出口エンタルピー (BTU/lb)" }
        }
      },
      "gasFlowRate": {
        "title": "ガス流量",
        "si": {
          "formula": "V = (Q_kW * 3.6) / H_l",
          "legend": {
            "V": "流量 (m³/h)",
            "Q_kW": "加熱量 (kW)",
            "H_l": "低位発熱量 (MJ/m³)"
          }
        },
        "imperial": {
          "formula": "V = Q_BTUh / H_l",
          "legend": {
            "V": "流量 (ft³/h)",
            "Q_BTUh": "加熱量 (BTU/h)",
            "H_l": "低位発熱量 (BTU/ft³)"
          }
        }
      },
      "heatingValueReference": {
        "title": "発熱量参考値",
        "gasType": "ガス種",
        "hhv": "高位",
        "lhv": "低位",
        "gases": {
          "natural_gas": "天然ガス (13A)",
          "city_gas": "都市ガス (4B)",
          "lpg": "LPガス (プロパン)"
        }
      }
    },
    "coil": {
      "airSideHeatLoad": {
        "title": "空気側熱量",
        "si": {
          "formula": "Q_kW = G * |h_in - h_out|",
          "legend": { "Q": "熱量 (kW)", "G": "質量流量 (kg/s)", "h_in": "入口エンタルピー (kJ/kg)", "h_out": "出口エンタルピー (kJ/kg)" }
        },
        "imperial": {
          "formula": "Q_BTUh = 4.5 * q * |h_in - h_out|",
          "legend": { "Q": "熱量 (BTU/h)", "q": "風量 (CFM)", "h_in": "入口エンタルピー (BTU/lb)", "h_out": "出口エンタルピー (BTU/lb)" }
        }
      },
      "waterSideHeatLoad": {
        "title": "水側熱量",
        "si": {
          "formula": "Q_water = Q_air / (η / 100)",
          "legend": { "Q_water": "水側熱量 (kW)", "Q_air": "空気側熱量 (kW)", "η": "効率 (%)" }
        },
        "imperial": {
          "formula": "Q_water = Q_air / (η / 100)",
          "legend": { "Q_water": "水側熱量 (BTU/h)", "Q_air": "空気側熱量 (BTU/h)", "η": "効率 (%)" }
        }
      },
      "waterFlow": {
        "title": "水流量",
        "si": {
          "formula": "L = (Q_kW * 60) / (4.186 * Δt_w)",
          "legend": { "L": "流量 (L/min)", "Q_kW": "熱量 (kW)", "Δt_w": "水温差 (°C)" }
        },
        "imperial": {
          "formula": "GPM = Q_BTUh / (500 * Δt_w)",
          "legend": { "GPM": "流量 (GPM)", "Q_BTUh": "熱量 (BTU/h)", "Δt_w": "水温差 (°F)" }
        }
      },
      "dehumidification": {
        "title": "除湿量",
        "si": {
          "formula": "D = (G * |x_in - x_out| / 1000) * 60",
          "legend": { "D": "除湿量 (L/min)", "G": "質量流量 (kg/s)", "x": "絶対湿度 (g/kg)" }
        },
        "imperial": {
          "formula": "D_gpm = (q*4.5*|x_in-x_out|)/(7000*8.34)",
          "legend": { "D_gpm": "除湿量 (GPM)", "q": "風量 (CFM)", "x": "絶対湿度 (gr/lb)" }
        }
      },
      "bypassFactor": {
        "title": "バイパスファクター",
        "si": {
          "formula": "BF = (t_out - t_adp) / (t_in - t_adp)",
          "legend": { "BF": "バイパスファクター", "t_in": "入口温度 (°C)", "t_out": "出口温度 (°C)", "t_adp": "ADP温度 (°C)" }
        },
        "imperial": {
          "formula": "BF = (t_out - t_adp) / (t_in - t_adp)",
          "legend": { "BF": "バイパスファクター", "t_in": "入口温度 (°F)", "t_out": "出口温度 (°F)", "t_adp": "ADP温度 (°F)" }
        }
      },
      "contactFactor": {
        "title": "コンタクトファクター (効率)",
        "si": { "formula": "CF = 1 - BF", "legend": { "CF": "コンタクトファクター", "BF": "バイパスファクター" } },
        "imperial": { "formula": "CF = 1 - BF", "legend": { "CF": "コンタクトファクター", "BF": "バイパスファクター" } }
      },
      "apparatusDewPointTemp": {
        "title": "装置露点温度 (ADP)",
        "si": {
          "formula": "t_adp = (t_out - t_in * BF) / (1 - BF)",
          "legend": { "t_adp": "ADP温度 (°C)", "t_in": "入口温度 (°C)", "t_out": "出口温度 (°C)", "BF": "バイパスファクター" }
        },
        "imperial": {
          "formula": "t_adp = (t_out - t_in * BF) / (1 - BF)",
          "legend": { "t_adp": "ADP温度 (°F)", "t_in": "入口温度 (°F)", "t_out": "出口温度 (°F)", "BF": "バイパスファクター" }
        }
      },
      "apparatusDewPointTempSensible": {
        "title": "入口露点温度 (顕熱冷却)",
        "si": {
          "formula": "除湿なし。値は入口空気の露点温度です。ADPは適用されません。",
          "legend": {
            "t_dp": "露点温度 (°C)",
            "t_in": "入口温度 (°C)",
            "rh_in": "入口RH (%)"
          }
        },
        "imperial": {
          "formula": "除湿なし。値は入口空気の露点温度です。ADPは適用されません。",
          "legend": {
            "t_dp": "露点温度 (°F)",
            "t_in": "入口温度 (°F)",
            "rh_in": "入口RH (%)"
          }
        }
      }
    },
    "spray_washer": {
      "humidification": {
        "title": "加湿量",
        "si": {
          "formula": "M = (G * (x_out - x_in) / 1000) * 60",
          "legend": { "M": "加湿量 (L/min)", "G": "質量流量 (kg/s)", "x": "絶対湿度 (g/kg)" }
        },
        "imperial": {
          "formula": "M_gpm = (q*4.5*(x_out-x_in))/(7000*8.34)",
          "legend": { "M_gpm": "加湿量 (GPM)", "q": "風量 (CFM)", "x": "絶対湿度 (gr/lb)" }
        }
      },
      "sprayAmount": {
        "title": "噴霧量",
        "si": {
          "formula": "S = G * (L/G) * 60",
          "legend": { "S": "噴霧量 (L/min)", "G": "質量流量 (kg/s)", "L/G": "水空気比" }
        },
        "imperial": {
          "formula": "S_gpm = (q * ρ * (L/G)) / 8.34",
          "legend": { "S_gpm": "噴霧量 (GPM)", "q": "風量 (CFM)", "ρ": "空気密度 (~0.075 lb/ft³)", "L/G": "水空気比" }
        }
      },
      "humidificationEfficiency": {
        "title": "加湿効率",
        "si": {
          "formula": "η = (x_out-x_in)/(x_sat-x_in)*100",
          "legend": { "η": "効率 (%)", "x": "絶対湿度 (g/kg)", "x_sat": "飽和絶対湿度 (g/kg)" }
        },
        "imperial": {
          "formula": "η = (x_out-x_in)/(x_sat-x_in)*100",
          "legend": { "η": "効率 (%)", "x": "絶対湿度 (gr/lb)", "x_sat": "飽和絶対湿度 (gr/lb)" }
        }
      },
      "outletTemp": {
        "title": "出口温度 (RHから)",
        "si": {
          "formula": "等エンタルピー線(h_in)上でRH_outと一致するよう計算されます。",
          "legend": {
            "t_out": "出口温度 (°C)",
            "h_in": "入口エンタルピー (kJ/kg)",
            "RH_out": "目標出口RH (%)"
          }
        },
        "imperial": {
          "formula": "等エンタルピー線(h_in)上でRH_outと一致するよう計算されます。",
          "legend": {
            "t_out": "出口温度 (°F)",
            "h_in": "入口エンタルピー (BTU/lb)",
            "RH_out": "目標出口RH (%)"
          }
        }
      }
    },
    "steam_humidifier": {
      "outletTemp": {
        "title": "出口温度 (RHから)",
        "si": {
          "formula": "h_out - (x_out/1000)*h_steam = h_in - (x_in/1000)*h_steam",
          "legend": {
            "t_out": "出口温度 (°C)", "h_in": "入口エンタルピー (kJ/kg)", "x_in": "入口絶対湿度 (g/kg)",
            "h_steam": "蒸気エンタルピー (kJ/kg)", "RH_out": "目標出口RH (%)"
          }
        },
        "imperial": {
          "formula": "エンタルピーバランスが目標RH_outで満たされるように計算されます。",
          "legend": {
            "t_out": "出口温度 (°F)", "h_in": "入口エンタルピー (BTU/lb)", "x_in": "入口絶対湿度 (gr/lb)",
            "h_steam": "蒸気エンタルピー (BTU/lb)", "RH_out": "目標出口RH (%)"
          }
        }
      },
      "requiredSteam": {
        "title": "必要蒸気量",
        "si": {
          "formula": "M = G * (x_out - x_in) / 1000 * 3600",
          "legend": { "M": "蒸気量 (kg/h)", "G": "質量流量 (kg/s)", "x": "絶対湿度 (g/kg)" }
        },
        "imperial": {
          "formula": "M_lbh = (q*4.5*(x_out-x_in))/7000",
          "legend": { "M_lbh": "蒸気量 (lb/h)", "q": "風量 (CFM)", "x": "絶対湿度 (gr/lb)" }
        }
      },
      "steamAbsolutePressure": {
        "title": "蒸気絶対圧力",
        "si": {
          "formula": "P_abs = P_gauge + P_atm",
          "legend": { "P_abs": "絶対圧力 (kPa)", "P_gauge": "ゲージ圧力 (kPa)", "P_atm": "大気圧 (101.325 kPa)" }
        },
        "imperial": {
          "formula": "P_abs = P_gauge + P_atm",
          "legend": { "P_abs": "絶対圧力 (psi)", "P_gauge": "ゲージ圧力 (psi)", "P_atm": "大気圧 (14.7 psi)" }
        }
      },
      "steamProperties": {
        "title": "蒸気特性 (圧力から)",
        "si": {
          "formula": "絶対圧力に基づき蒸気表から線形補間により計算されます。",
          "legend": { "T_steam": "蒸気温度 (°C)", "h_steam": "蒸気エンタルピー (kcal/kg)", "P_abs": "絶対圧力 (kPa)" }
        },
        "imperial": {
          "formula": "絶対圧力に基づき蒸気表から線形補間により計算されます。",
          "legend": { "T_steam": "蒸気温度 (°F)", "h_steam": "蒸気エンタルピー (BTU/lb)", "P_abs": "絶対圧力 (psi)" }
        }
      }
    },
    "fan": {
        "heatGeneration": {
            "title": "発熱量",
            "si": {
                "formula": "Q_kW = P * (1 - η / 100)",
                "legend": { "Q_kW": "発熱量 (kW)", "P": "モーター出力 (kW)", "η": "モーター効率 (%)" }
            },
            "imperial": {
                "formula": "Q_BTUh = P_HP * 2545 * (1 - η / 100)",
                "legend": { "Q_BTUh": "発熱量 (BTU/h)", "P_HP": "モーター出力 (HP)", "η": "モーター効率 (%)" }
            }
        },
        "tempRise": {
            "title": "温度上昇",
            "si": {
                "formula": "Δt = Q_kW / (G * Cpa_moist)",
                "legend": { "Δt": "温度上昇 (°C)", "Q_kW": "発熱量 (kW)", "G": "質量流量 (kg/s)", "Cpa_moist": "湿り空気比熱 (~1.02 kJ/kg·K)" }
            },
            "imperial": {
                "formula": "Δt = Q_BTUh / (1.08 * q)",
                "legend": { "Δt": "温度上昇 (°F)", "Q_BTUh": "発熱量 (BTU/h)", "q": "風量 (CFM)" }
            }
        }
    }
  }
};

const messages: { [key: string]: any } = {
  en: enMessages,
  ja: jaMessages,
};

// Update the type of 't' to return 'any' to accommodate strings, objects, and arrays from JSON.
type LanguageContextType = {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string) => any;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getNestedValue = (obj: any, key: string) => {
  return key.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
};

// By changing from `React.FC` to directly typing the props object,
// we can sometimes resolve subtle TypeScript inference issues in complex build environments.
export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  // Default to Japanese based on app's title and lang attribute in HTML
  const [locale, setLocale] = useState('ja');

  const t = useCallback((key: string) => {
    let message = getNestedValue(messages[locale], key);

    // Fallback to English if the message is not found in the current locale
    if (message === undefined) {
      message = getNestedValue(messages['en'], key);
    }

    // Return the message if it was found (even if it's an empty string ""), otherwise return the key
    return message !== undefined ? message : key;
  }, [locale]);
  
  const value = { locale, setLocale, t };

  // FIX: Replaced JSX with React.createElement to make it compatible with the .ts file extension.
  return React.createElement(LanguageContext.Provider, { value: value }, children);
};

// Add explicit return type to the hook.
export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
