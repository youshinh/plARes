const fs = require('fs');
const file = process.argv[2];
const buffer = fs.readFileSync(file);
const chunkLength = buffer.readUInt32LE(12);
const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
const gltf = JSON.parse(jsonString.trim().replace(/\0/g, ''));
console.log('Animations in', file, ':', gltf.animations ? gltf.animations.map(a => a.name).join(', ') : 'none');
