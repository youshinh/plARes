const fs = require('fs');
const files = [
    'public/models/green/Meshy_AI_biped/Meshy_AI_Character_output.glb',
    'public/models/green/Meshy_AI_biped/Meshy_AI_Animation_Walking_withSkin.glb',
    'public/models/green/Meshy_AI_biped/Meshy_AI_Animation_Running_withSkin.glb'
];
for (const file of files) {
    const buffer = fs.readFileSync(file);
    const magic = buffer.readUInt32LE(0);
    const version = buffer.readUInt32LE(4);
    const length = buffer.readUInt32LE(8);
    const chunkLength = buffer.readUInt32LE(12);
    const chunkType = buffer.readUInt32LE(16);
    if (chunkType === 0x4E4F534A) { // 'JSON'
        const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
        try {
            const gltf = JSON.parse(jsonString.trim().replace(/\0/g, ''));
            const anims = (gltf.animations || []).map(a => a.name || 'unnamed');
            console.log(file + ' animations:', anims);
        } catch (e) {
            console.log(file + ' parsing error', e);
        }
    }
}
