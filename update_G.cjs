const fs = require('fs');

const path = 'components/EquipmentItem.tsx';
let data = fs.readFileSync(path, 'utf8');

data = data.replace(/'G': \{ value: unitSystem === UnitSystem\.SI \? massFlowRateDA_kg_s : massFlowRateDA_kg_s \* 2\.20462, unit: unitSystem === UnitSystem\.SI \? 'kg\/s' : 'lb\/s' \}/g, "'G': { value: unitSystem === UnitSystem.SI ? massFlowRateDA_kg_s : massFlowRateDA_kg_s * 7936.632, unit: unitSystem === UnitSystem.SI ? 'kg/s' : 'lb/h' }");

fs.writeFileSync(path, data);
console.log('Done');
