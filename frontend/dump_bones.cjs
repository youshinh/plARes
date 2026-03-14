const fs = require('fs');

const dumpBones = (file) => {
  const buffer = fs.readFileSync(file);
  const text = buffer.toString('utf8');
  const matches = text.match(/"name":"([^"]+)"/g);
  if (matches) {
    const names = matches.map(m => m.split('"')[3]);
    const bones = names.filter(n => n.toLowerCase().includes('head') || n.toLowerCase().includes('hand') || n.toLowerCase().includes('spine'));
    console.log(`\n--- ${file} ---`);
    console.log([...new Set(bones)].join('\n'));
  }
};

const models = [
  'public/models/A/Character_output.glb',
  'public/models/C/Character_output.glb',
];

models.forEach(m => {
  try { dumpBones(m); } catch (e) { console.error(`Failed: ${m}`); }
});
