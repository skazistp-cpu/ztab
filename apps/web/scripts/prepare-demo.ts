// Run after `npm run build`, only for a fresh testnet receiver created for public demo use.
// The input is deliberately public but kept outside Git. Never pass a user's wallet export.
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {readDemoReceiver} from '../src/demo.ts';
const input=process.argv[2];
if(!input||process.argv[3]!=='--public-testnet-demo')throw new Error('Usage: node scripts/prepare-demo.ts /outside/repo/demo-receiver.json --public-testnet-demo');
const root=resolve(import.meta.dirname,'../../..'),path=realpathSync(input),within=relative(root,path);
if(!within.startsWith('..'))throw new Error('Keep the public demo receiver file outside the repository.');
const bytes=readFileSync(path);if(bytes.length>8192)throw new Error('Demo configuration too large.');
let parsed: unknown;try{parsed=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('Demo configuration is not JSON.');}
const config=readDemoReceiver(parsed);if(!config)throw new Error('Expected only a testnet unified address, public viewing key, birthday and version.');
const output=JSON.stringify(config)+'\n';
writeFileSync(resolve(import.meta.dirname,'../dist/demo-receiver.json'),output,{mode:0o644});
console.log('Public testnet demo asset SHA-256: '+createHash('sha256').update(output).digest('hex'));
