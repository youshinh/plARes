const fs = require('fs');
const file = 'public/models/green/Meshy_AI_biped/Meshy_AI_Character_output.glb';
const buffer = fs.readFileSync(file);
const chunkLength = buffer.readUInt32LE(12);
const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
const gltf = JSON.parse(jsonString.trim().replace(/\0/g, ''));
const nodeNames = gltf.nodes.map(n => n.name).filter(n => n);
console.log('Nodes:', nodeNames.join(', '));
