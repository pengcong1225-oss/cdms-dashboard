import {readFile,writeFile} from 'node:fs/promises';
// Original published module c046 contains the original street geometry, not business data.
const source=await readFile(new URL('../public/static/js/chunk-0adb2638.cceccd02.js',import.meta.url),'utf8');
const match=source.match(/c046:function\(t\)\{t\.exports=JSON\.parse\('([^']+)'\)/);
if(!match)throw Error('Original street geometry module not found');
const geo=JSON.parse(match[1]);
const names=new Set(['沌口街道','沌阳街道','军山街道','纱帽街道','东荆街道','邓南街道','湘口街道']);
geo.features=geo.features.filter(f=>names.has(f.properties.name));
if(geo.features.length!==7)throw Error('Expected seven original street boundaries');
await writeFile(new URL('../assets/streets.json',import.meta.url),JSON.stringify(geo));
console.log('Extracted seven original street geometries.');
