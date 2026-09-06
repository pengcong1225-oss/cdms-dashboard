import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({});
vm.runInContext(readFileSync(new URL('./vendor/des.js',import.meta.url),'utf8'),context,{timeout:1000});

// Compatibility with the original site's nonstandard DES key schedule.
export function encodeLogin(text, secret = 'dofuntech,dofuntech,com') {
  return context.DesUtils.encode(text,secret);
}
