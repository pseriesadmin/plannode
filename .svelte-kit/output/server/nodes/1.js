

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.CT4DQK8c.js","_app/immutable/chunks/xA40zHcw.js","_app/immutable/chunks/BzA8RMQN.js"];
export const stylesheets = ["_app/immutable/assets/1.BzjnpB_Z.css"];
export const fonts = [];
