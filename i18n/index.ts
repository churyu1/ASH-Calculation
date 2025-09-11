// FIX: Implemented and exported LanguageProvider, useLanguage, and get to fix module resolution errors.
import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback } from 'react';

// Embed JSON content directly to avoid module resolution errors in browser-native ESM.
export const enMessages = {
  "app": {
    "title": "HVAC Calculator",
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
    "noProjects": "No projects exist. Click the '+' button in the tab bar to add a new one."
  },
  "equipment": {
    "pressureLoss": "Pressure Loss",
    "inletAir": "Inlet Air",
    "outletAir": "Outlet Air",
    "up": "Up",
    "down": "Down",
    "useACInlet": "Use AC Inlet",
    "useUpstreamOutlet": "Use Upstream Outlet",
    "useDownstreamInlet": "Use Downstream Inlet",
    "useACOutlet": "Use AC Outlet",
    "delete": "Delete",
    "conditions": "Conditions",
    "results": "Calculation Results",
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
    "cooling_coil": "Cooling Coil",
    "heating_coil": "Heating Coil",
    "eliminator": "Eliminator",
    "spray_washer": "Spray Washer",
    "steam_humidifier": "Steam Humidifier",
    "fan": "Fan",
    "damper": "Damper",
    "custom": "Custom Equipment"
  },
  "conditions": {
    "width": "Width",
    "height": "Height",
    "thickness": "Thickness",
    "sheets": "Sheets",
    "shf": "SHF (Sensible Heat Factor)",
    "chilledWaterInletTemp": "Chilled Water Inlet Temp",
    "chilledWaterOutletTemp": "Chilled Water Outlet Temp",
    "heatExchangeEfficiency": "Heat Exchange Efficiency",
    "hotWaterInletTemp": "Hot Water Inlet Temp",
    "hotWaterOutletTemp": "Hot Water Outlet Temp",
    "eliminatorType": "Eliminator Type",
    "eliminator_3_fold": "3-Fold",
    "eliminator_6_fold": "6-Fold",
    "humidificationEfficiency": "Humidification Efficiency",
    "waterToAirRatio": "Water-to-Air Ratio (L/G)",
    "steamGaugePressure": "Steam Gauge Pressure",
    "motorOutput": "Motor Output",
    "motorEfficiency": "Motor Efficiency",
    "lossCoefficientK": "Loss Coefficient (K)"
  },
  "results": {
    "faceVelocity": "Face Velocity",
    "treatedAirflowPerSheet": "Airflow/Sheet",
    "heatLoad_kcal": "Heat Load",
    "airSideHeatLoad_kcal": "Air-Side Heat Load",
    "coldWaterSideHeatLoad_kcal": "Water-Side Heat Load",
    "chilledWaterFlow_L_min": "Chilled Water Flow",
    "dehumidification_L_min": "Dehumidification",
    "hotWaterSideHeatLoad_kcal": "Water-Side Heat Load",
    "hotWaterFlow_L_min": "Hot Water Flow",
    "humidification_L_min": "Humidification",
    "sprayAmount_L_min": "Spray Amount",
    "requiredSteamAmount": "Required Steam Amount",
    "steamAbsolutePressure": "Steam Absolute Pressure",
    "steamTemperature": "Steam Temperature",
    "steamEnthalpy": "Steam Enthalpy",
    "heatGeneration_kcal": "Heat Generation",
    "tempRise_deltaT_celsius": "Temp Rise ⊿T",
    "airVelocity_m_s": "Air Velocity",
    "pressureLoss_Pa": "Pressure Loss"
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
        "airflow": "m³/min", "temperature": "℃", "length": "mm", "pressure": "Pa", "heat_load": "kcal/h",
        "water_flow": "L/min", "abs_humidity": "g/kg(DA)", "enthalpy": "kJ/kg(DA)", "motor_power": "kW",
        "rh": "%", "sheets": "sheets", "shf": "", "efficiency": "%", "k_value": "", "velocity": "m/s",
        "airflow_per_sheet": "m³/min/sheet", "water_to_air_ratio": "", "area": "m²", "density": "kg/m³",
        "steam_pressure": "kPa", "steam_enthalpy": "kcal/kg", "steam_flow": "kg/h"
    },
    "imperial": {
        "airflow": "CFM", "temperature": "℉", "length": "in", "pressure": "in.w.g.", "heat_load": "BTU/h",
        "water_flow": "GPM", "abs_humidity": "gr/lb(DA)", "enthalpy": "BTU/lb(DA)", "motor_power": "HP",
        "rh": "%", "sheets": "sheets", "shf": "", "efficiency": "%", "k_value": "", "velocity": "ft/s",
        "airflow_per_sheet": "CFM/sheet", "water_to_air_ratio": "", "area": "ft²", "density": "lb/ft³",
        "steam_pressure": "psi", "steam_enthalpy": "BTU/lb", "steam_flow": "lb/h"
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
  "summary": {
    "table": {
      "equipment": "Equipment",
      "inlet": "Inlet",
      "outlet": "Outlet",
      "temp": "Temp",
      "rh": "RH",
      "keyResults": "Key Results",
      "burnerLoad": "Burner Load",
      "coolingLoad": "Cooling Water Load",
      "coolingFlow": "Chilled Water Flow",
      "heatingLoad": "Hot Water Load",
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
          "formula": "Q_kW = G*1.02*(t_out-t_in)/SHF",
          "legend": { "Q": "Heat Load (kW)", "G": "Mass Flow (kg/s)", "Δt": "Temp Rise (°C)", "SHF": "Sensible Heat Factor" }
        },
        "imperial": {
          "formula": "Q_BTUh = 1.08 * q * Δt / SHF",
          "legend": { "Q": "Heat Load (BTU/h)", "q": "Airflow (CFM)", "Δt": "Temp Rise (°F)", "SHF": "Sensible Heat Factor" }
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
          "formula": "Calculated to satisfy h_out - (x_out/1000)*h_steam = h_in - (x_in/1000)*h_steam",
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
          "formula": "Q_kW = P_kW * (1 - η/100)",
          "legend": { "Q": "Heat (kW)", "P": "Motor Power (kW)", "η": "Efficiency (%)" }
        },
        "imperial": {
          "formula": "Q_BTUh = P_HP * 2545 * (1 - η/100)",
          "legend": { "Q": "Heat (BTU/h)", "P": "Motor Power (HP)", "η": "Efficiency (%)" }
        }
      },
      "tempRise": {
        "title": "Temperature Rise",
        "si": {
          "formula": "Δt = Q_kW / (G * 1.02)",
          "legend": { "Δt": "Temp Rise (°C)", "Q_kW": "Heat (kW)", "G": "Mass Flow (kg/s)" }
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
    "title": "空調器計算機",
    "description": "これは空調機用の空気線図計算アプリケーションです。フィルター、コイル、ファンなどの機器を自由に組み合わせて、空気の状態変化をシミュレーションできます。結果は空気線図上にも表示され、視覚的な分析が可能です。",
    "instructionsTitle": "使い方",
    "instructions": "1. システムの風量と、空調機全体の入口・出口条件を設定します。\n2. 「機器追加」セクションから、必要な機器を追加します。\n3. 各機器の条件を設定します。空気の状態は自動的に計算され、下流に引き継がれます。\n4. 空気線図上の点や線をドラッグして、直感的に空気の状態を調整することもできます。",
    "language": "言語",
    "unitSystem": "単位系",
    "siUnits": "国際単位系 (SI)",
    "imperialUnits": "ヤード・ポンド法",
    "systemAirflow": "システム風量",
    "acInletConditions": "空調器入口条件",
    "acOutletConditions": "空調器出口条件",
    "addEquipment": "機器追加",
    "deleteAllEquipment": "全機器削除",
    "summary": "サマリー",
    "configuration": "構成",
    "noEquipmentAdded": "機器が追加されていません。",
    "pressureLoss": "圧力損失",
    "totalPressureLoss": "合計圧力損失:",
    "psychrometricChart": "空気線図",
    "dataManagement": "データ管理",
    "importConfig": "設定を読込",
    "exportConfig": "設定を保存",
    "importSuccess": "設定を正常に読み込みました！",
    "importError": "設定の読み込みに失敗しました。ファイルが無効か破損している可能性があります。",
    "copySuffix": " (コピー)",
    "duplicateProject": "プロジェクトを複製",
    "allProjectsSummaryTab": "空調器一覧",
    "allProjectsSummaryTitle": "空調器一覧",
    "noProjects": "プロジェクトが存在しません。タブバーの「＋」ボタンで新規追加してください。"
  },
  "equipment": {
    "pressureLoss": "圧力損失",
    "inletAir": "入口空気",
    "outletAir": "出口空気",
    "up": "上へ",
    "down": "下へ",
    "useACInlet": "空調器入口を使用",
    "useUpstreamOutlet": "上流出口を使用",
    "useDownstreamInlet": "下流入口を使用",
    "useACOutlet": "空調器出口を使用",
    "delete": "削除",
    "conditions": "機器条件",
    "results": "計算結果",
    "warnings": {
      "burner": "出口温度は入口温度より高くしてください。",
      "cooling_coil_temp": "出口温度は入口温度より低くしてください。",
      "cooling_coil_humidity": "冷却プロセスでは出口の絶対湿度は入口より高くできません。",
      "heating_coil": "出口温度は入口温度より高くしてください。"
    }
  },
  "equipmentNames": {
    "filter": "フィルター",
    "burner": "バーナー",
    "cooling_coil": "冷水コイル",
    "heating_coil": "温水コイル",
    "eliminator": "エリミネーター",
    "spray_washer": "スプレーワッシャー",
    "steam_humidifier": "蒸気加湿器",
    "fan": "ファン",
    "damper": "ダンパー",
    "custom": "カスタム機器"
  },
  "conditions": {
    "width": "幅",
    "height": "高さ",
    "thickness": "厚み",
    "sheets": "枚数",
    "shf": "顕熱比(SHF)",
    "chilledWaterInletTemp": "冷水入口温度",
    "chilledWaterOutletTemp": "冷水出口温度",
    "heatExchangeEfficiency": "熱交換効率",
    "hotWaterInletTemp": "温水入口温度",
    "hotWaterOutletTemp": "温水出口温度",
    "eliminatorType": "エリミネーター種類",
    "eliminator_3_fold": "3折",
    "eliminator_6_fold": "6折",
    "humidificationEfficiency": "加湿効率",
    "waterToAirRatio": "水空気比 (L/G)",
    "steamGaugePressure": "蒸気ゲージ圧",
    "motorOutput": "モーター出力",
    "motorEfficiency": "モーター効率",
    "lossCoefficientK": "損失係数(K値)"
  },
  "results": {
    "faceVelocity": "面風速",
    "treatedAirflowPerSheet": "処理風量/枚",
    "heatLoad_kcal": "熱負荷",
    "airSideHeatLoad_kcal": "空気側熱負荷",
    "coldWaterSideHeatLoad_kcal": "冷水側熱負荷",
    "chilledWaterFlow_L_min": "冷水量",
    "dehumidification_L_min": "除湿量",
    "hotWaterSideHeatLoad_kcal": "温水側熱負荷",
    "hotWaterFlow_L_min": "温水量",
    "humidification_L_min": "加湿量",
    "sprayAmount_L_min": "噴霧量",
    "requiredSteamAmount": "必要蒸気量",
    "steamAbsolutePressure": "蒸気絶対圧",
    "steamTemperature": "蒸気温度",
    "steamEnthalpy": "蒸気エンタルピー",
    "heatGeneration_kcal": "発熱量",
    "tempRise_deltaT_celsius": "温度上昇⊿T",
    "airVelocity_m_s": "風速",
    "pressureLoss_Pa": "圧力損失"
  },
  "airProperties": {
    "temperature": "温度",
    "rh": "相対湿度",
    "abs_humidity": "絶対湿度",
    "enthalpy": "比エンタルピー"
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
        "airflow": "m³/min", "temperature": "℃", "length": "mm", "pressure": "Pa", "heat_load": "kcal/h",
        "water_flow": "L/min", "abs_humidity": "g/kg(DA)", "enthalpy": "kJ/kg(DA)", "motor_power": "kW",
        "rh": "%", "sheets": "枚", "shf": "", "efficiency": "%", "k_value": "", "velocity": "m/s",
        "airflow_per_sheet": "m³/min/枚", "water_to_air_ratio": "", "area": "m²", "density": "kg/m³",
        "steam_pressure": "kPa", "steam_enthalpy": "kcal/kg", "steam_flow": "kg/h"
    },
    "imperial": {
        "airflow": "CFM", "temperature": "℉", "length": "in", "pressure": "in.w.g.", "heat_load": "BTU/h",
        "water_flow": "GPM", "abs_humidity": "gr/lb(DA)", "enthalpy": "BTU/lb(DA)", "motor_power": "HP",
        "rh": "%", "sheets": "枚", "shf": "", "efficiency": "%", "k_value": "", "velocity": "ft/s",
        "airflow_per_sheet": "CFM/sheet", "water_to_air_ratio": "", "area": "ft²", "density": "lb/ft³",
        "steam_pressure": "psi", "steam_enthalpy": "BTU/lb", "steam_flow": "lb/h"
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
  "summary": {
    "table": {
      "equipment": "機器",
      "inlet": "入口",
      "outlet": "出口",
      "temp": "温度",
      "rh": "湿度",
      "keyResults": "主要な結果",
      "burnerLoad": "バーナー熱負荷",
      "coolingLoad": "冷水側熱負荷",
      "coolingFlow": "冷水量",
      "heatingLoad": "温水側熱負荷",
      "heatingFlow": "温水量",
      "steamFlow": "蒸気量",
      "pressureLoss": "圧力損失",
      "totalPressureLoss": "合計圧力損失"
    }
  },
  "fab": {
    "toggleToSplitView": "2カラム表示に切替",
    "toggleToSingleView": "1カラム表示に切替"
  },
  "tooltips": {
    "airProperties": {
      "absHumidityFromTRh": {
        "title": "絶対湿度 (温湿度から)",
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
        "title": "エンタルピー (温・絶対湿度から)",
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
        "title": "相対湿度 (温・絶対湿度から)",
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
        "title": "絶対湿度 (温・エンタルピーから)",
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
        "title": "面風速",
        "si": {
          "formula": "v = (q / 60) / a_total",
          "legend": { "v": "風速 (m/s)", "q": "風量 (m³/min)", "a_total": "全面積 (m²)" }
        },
        "imperial": {
          "formula": "v = q / a_total",
          "legend": { "v": "風速 (fpm)", "q": "風量 (CFM)", "a_total": "全面積 (ft²)" }
        }
      },
      "airflowPerSheet": {
        "title": "枚あたり風量",
        "si": {
          "formula": "q_sheet = q / n",
          "legend": { "q_sheet": "風量/枚 (m³/min)", "q": "全風量 (m³/min)", "n": "枚数" }
        },
        "imperial": {
          "formula": "q_sheet = q / n",
          "legend": { "q_sheet": "風量/枚 (CFM)", "q": "全風量 (CFM)", "n": "枚数" }
        }
      }
    },
    "burner": {
      "heatLoad": {
        "title": "熱負荷",
        "si": {
          "formula": "Q_kW = G*1.02*(t_out-t_in)/SHF",
          "legend": { "Q": "熱負荷 (kW)", "G": "質量流量 (kg/s)", "Δt": "温度上昇 (°C)", "SHF": "顕熱比" }
        },
        "imperial": {
          "formula": "Q_BTUh = 1.08 * q * Δt / SHF",
          "legend": { "Q": "熱負荷 (BTU/h)", "q": "風量 (CFM)", "Δt": "温度上昇 (°F)", "SHF": "顕熱比" }
        }
      }
    },
    "coil": {
      "airSideHeatLoad": {
        "title": "空気側熱負荷",
        "si": {
          "formula": "Q_kW = G * |h_in - h_out|",
          "legend": { "Q": "熱負荷 (kW)", "G": "質量流量 (kg/s)", "h_in": "入口エンタルピー (kJ/kg)", "h_out": "出口エンタルピー (kJ/kg)" }
        },
        "imperial": {
          "formula": "Q_BTUh = 4.5 * q * |h_in - h_out|",
          "legend": { "Q": "熱負荷 (BTU/h)", "q": "風量 (CFM)", "h_in": "入口エンタルピー (BTU/lb)", "h_out": "出口エンタルピー (BTU/lb)" }
        }
      },
      "waterSideHeatLoad": {
        "title": "水側熱負荷",
        "si": {
          "formula": "Q_water = Q_air / (η / 100)",
          "legend": { "Q_water": "水側負荷 (kW)", "Q_air": "空気側負荷 (kW)", "η": "効率 (%)" }
        },
        "imperial": {
          "formula": "Q_water = Q_air / (η / 100)",
          "legend": { "Q_water": "水側負荷 (BTU/h)", "Q_air": "空気側負荷 (BTU/h)", "η": "効率 (%)" }
        }
      },
      "waterFlow": {
        "title": "水量",
        "si": {
          "formula": "L = (Q_kW * 60) / (4.186 * Δt_w)",
          "legend": { "L": "流量 (L/min)", "Q_kW": "負荷 (kW)", "Δt_w": "水温差 (°C)" }
        },
        "imperial": {
          "formula": "GPM = Q_BTUh / (500 * Δt_w)",
          "legend": { "GPM": "流量 (GPM)", "Q_BTUh": "負荷 (BTU/h)", "Δt_w": "水温差 (°F)" }
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
        "title": "出口温度 (相対湿度から)",
        "si": {
          "formula": "入口エンタルピーを維持し、目標の出口相対湿度になるように計算されます。",
          "legend": {
            "t_out": "出口温度 (°C)",
            "h_in": "入口エンタルピー (kJ/kg)",
            "RH_out": "目標出口相対湿度 (%)"
          }
        },
        "imperial": {
          "formula": "入口エンタルピーを維持し、目標の出口相対湿度になるように計算されます。",
          "legend": {
            "t_out": "出口温度 (°F)",
            "h_in": "入口エンタルピー (BTU/lb)",
            "RH_out": "目標出口相対湿度 (%)"
          }
        }
      }
    },
    "steam_humidifier": {
      "outletTemp": {
        "title": "出口温度 (相対湿度から)",
        "si": {
          "formula": "h_out - (x_out/1000)*h_steam = h_in - (x_in/1000)*h_steam を満たすように計算されます。",
          "legend": {
            "t_out": "出口温度 (°C)", "h_in": "入口エンタルピー (kJ/kg)", "x_in": "入口絶対湿度 (g/kg)",
            "h_steam": "蒸気エンタルピー (kJ/kg)", "RH_out": "目標出口相対湿度 (%)"
          }
        },
        "imperial": {
          "formula": "目標の出口相対湿度になるようエンタルピーバランスから計算されます。",
          "legend": {
            "t_out": "出口温度 (°F)", "h_in": "入口エンタルピー (BTU/lb)", "x_in": "入口絶対湿度 (gr/lb)",
            "h_steam": "蒸気エンタルピー (BTU/lb)", "RH_out": "目標出口相対湿度 (%)"
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
        "title": "蒸気絶対圧",
        "si": {
          "formula": "P_abs = P_gauge + P_atm",
          "legend": { "P_abs": "絶対圧 (kPa)", "P_gauge": "ゲージ圧 (kPa)", "P_atm": "大気圧 (101.325 kPa)" }
        },
        "imperial": {
          "formula": "P_abs = P_gauge + P_atm",
          "legend": { "P_abs": "絶対圧 (psi)", "P_gauge": "ゲージ圧 (psi)", "P_atm": "大気圧 (14.7 psi)" }
        }
      },
      "steamProperties": {
        "title": "蒸気特性 (圧力から)",
        "si": {
          "formula": "絶対圧を元に蒸気表から線形補間して計算されます。",
          "legend": { "T_steam": "蒸気温度 (°C)", "h_steam": "蒸気エンタルピー (kcal/kg)", "P_abs": "絶対圧 (kPa)" }
        },
        "imperial": {
          "formula": "絶対圧を元に蒸気表から線形補間して計算されます。",
          "legend": { "T_steam": "蒸気温度 (°F)", "h_steam": "蒸気エンタルピー (BTU/lb)", "P_abs": "絶対圧 (psi)" }
        }
      }
    },
    "fan": {
      "heatGeneration": {
        "title": "発熱量",
        "si": {
          "formula": "Q_kW = P_kW * (1 - η/100)",
          "legend": { "Q": "熱量 (kW)", "P": "モーター出力 (kW)", "η": "効率 (%)" }
        },
        "imperial": {
          "formula": "Q_BTUh = P_HP * 2545 * (1 - η/100)",
          "legend": { "Q": "熱量 (BTU/h)", "P": "モーター出力 (HP)", "η": "効率 (%)" }
        }
      },
      "tempRise": {
        "title": "温度上昇",
        "si": {
          "formula": "Δt = Q_kW / (G * 1.02)",
          "legend": { "Δt": "温度上昇 (°C)", "Q_kW": "熱量 (kW)", "G": "質量流量 (kg/s)" }
        },
        "imperial": {
          "formula": "Δt = Q_BTUh / (1.08 * q)",
          "legend": { "Δt": "温度上昇 (°F)", "Q_BTUh": "熱量 (BTU/h)", "q": "風量 (CFM)" }
        }
      },
      "outletTemp": {
        "title": "出口温度",
        "si": {
          "formula": "t_out = t_in + Δt",
          "legend": { "t_out": "出口温度 (°C)", "t_in": "入口温度 (°C)", "Δt": "温度上昇 (°C)" }
        },
        "imperial": {
          "formula": "t_out = t_in + Δt",
          "legend": { "t_out": "出口温度 (°F)", "t_in": "入口温度 (°F)", "Δt": "温度上昇 (°F)" }
        }
      }
    },
    "damper": {
      "airVelocity": {
        "title": "風速",
        "si": {
          "formula": "v = (q / 60) / A",
          "legend": { "v": "風速 (m/s)", "q": "風量 (m³/min)", "A": "面積 (m²)" }
        },
        "imperial": {
          "formula": "v = q / A",
          "legend": { "v": "風速 (fpm)", "q": "風量 (CFM)", "A": "面積 (ft²)" }
        }
      },
      "pressureLoss": {
        "title": "圧力損失",
        "si": {
          "formula": "ΔP = K * 0.5 * ρ * v²",
          "legend": { "ΔP": "圧力損失 (Pa)", "K": "K係数", "ρ": "密度 (kg/m³)", "v": "風速 (m/s)" }
        },
        "imperial": {
          "formula": "ΔP = K * (v / 4005)²",
          "legend": { "ΔP": "圧力損失 (in.w.g.)", "K": "K係数", "v": "風速 (fpm)" }
        }
      }
    }
  }
};

const messages: Record<string, any> = {
    en: enMessages,
    ja: jaMessages,
};

export const get = (obj: any, path: string): any => {
    return path.split('.').reduce((res, key) => (res ? res[key] : undefined), obj);
};

interface LanguageContextType {
    locale: string;
    setLocale: (locale: string) => void;
    // FIX: Changed 't' function return type to 'any' to support complex translation objects (like legends) and arrays, not just strings.
    t: (key: string) => any;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [locale, setLocale] = useState('ja');

    const t = useCallback((key: string) => {
        let message = get(messages[locale], key);
        // If message not found in current locale, fallback to English
        if (message === undefined) {
            message = get(enMessages, key);
        }
        // If message is still not found (or is explicitly null/undefined), return the key.
        // This explicitly allows empty strings '' to be returned as a valid translation.
        return message !== undefined ? message : key;
    }, [locale]);

    const value = useMemo(() => ({
        locale,
        setLocale,
        t,
    }), [locale, t]);

    // FIX: Replaced JSX with React.createElement to prevent parsing errors, as this is a .ts file, not a .tsx file.
    return React.createElement(LanguageContext.Provider, { value }, children);
};

export const useLanguage = (): LanguageContextType => {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};