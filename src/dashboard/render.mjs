// A section can depend on multiple data modules, but is updated once per invalidation batch.
export function createSectionRenderer(sections) {
 return keys=>{const changed=new Set(keys);for(const section of Object.values(sections))if(section.depends.some(key=>changed.has(key)))section.render();};
}
