const fs = require('fs');
const gltfPath = process.argv[2];
const data = fs.readFileSync(gltfPath);
const jsonLength = data.readUInt32LE(12);
const jsonString = data.toString('utf8', 20, 20 + jsonLength);
const gltf = JSON.parse(jsonString);
if (gltf.animations) {
    gltf.animations.forEach((anim, i) => console.log(`[${i}] ${anim.name}`));
} else {
    console.log("No animations found.");
}
