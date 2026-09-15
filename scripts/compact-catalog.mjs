// Rebuild the browser subset from the unchanged, pinned upstream files.
import fs from 'node:fs';
const read = name => JSON.parse(fs.readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const names = read('starnames');
const stars = read('stars.6').features.map(f => ({id:f.id, properties:{mag:f.properties.mag}, geometry:{coordinates:f.geometry.coordinates}}));
const starNames = Object.fromEntries(stars.map(f=>[f.id,names[f.id]]).filter(([,n])=>n).map(([id,n])=>[id,Object.fromEntries(['name','bayer','flam','hip','c'].filter(k=>n[k]).map(k=>[k,n[k]]))]));
fs.writeFileSync(new URL('../src/data/catalog.json',import.meta.url),JSON.stringify({stars,starNames})+'\n');
