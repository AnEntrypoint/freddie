
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const F = path.resolve(__dirname, '..', '..');
const R = p => path.resolve(p);
const ALIAS = {
  [R(F + '/src/host/index.js')]: R(F + '/src/agent/__browser_shims/host.js'),
  [R(F + '/src/toolsets.js')]: R(F + '/src/agent/__browser_shims/toolsets.js'),
  [R(F + '/src/agent/llm_resolver.js')]: R(F + '/src/agent/__browser_shims/llm_resolver.js'),
  [R(F + '/src/observability/log.js')]: R(F + '/src/agent/__browser_shims/log.js'),
  [R(F + '/src/config.js')]: R(F + '/src/agent/__browser_shims/config.js'),
  [R(F + '/src/home.js')]: R(F + '/src/agent/__browser_shims/home.js'),
};
export default {
  name: 'freddie-browser-alias',
  setup(build){
    build.onResolve({filter: /.*/}, async args=>{
      if(args.path.startsWith('node:') || (!args.path.startsWith('.') && !path.isAbsolute(args.path))) return null;
      const resolved = path.resolve(args.resolveDir||'', args.path);
      const candidates=[resolved, resolved+'.js', resolved+'/index.js'];
      for(const c of candidates) if(ALIAS[c]) return { path: ALIAS[c] };
      return null;
    });
  }
};
