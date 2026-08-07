import type { HttpServer } from '@stackpress/ingest';
import reactus, { Server } from 'reactus';
import { projectBrowserProvider } from '../../src/hydration.js';

export default function app(server: HttpServer) {
  server.on('config', ({ ctx }) => {
    const config = ctx.config();
    const engine = reactus(Server.configure({ cwd: config.cwd, production: config.env === 'production', ...config.view }));
    ctx.register('reactus', engine);
    ctx.view.render = (entry, props) => engine.render(entry, props);
    ctx.view.engine = async (entry, { req, res, ctx }) => {
      const data = res.data() as Record<string, unknown>;
      const html = await ctx.view.render(entry, {
        data,
        provider: projectBrowserProvider({ method: req.method, path: req.url.pathname, csrf: 'proof-csrf-token' })
      });
      if (html) res.html(html);
    };
  });
}
