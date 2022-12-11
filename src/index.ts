import type { ApiRequestBase, ApiResponseBase, ApiSchemaBase, HttpRequestMethod} from '@nutsapi/types';
import { HTTP_REQUEST_METHODS } from '@nutsapi/types';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createServer } from 'http';
import { parse } from 'url';
import type { Handler, AllEndPoint, AllMethod, WorkerType} from './handler';
import { NutsAPIHandler } from './handler';
import { NutsRequest } from './worker';

interface CorsOption {
  origin: string,
  headers: string[],
  methods: (HttpRequestMethod | 'OPTIONS')[],
  credential: boolean,
}

export class NutsAPIServer<Schema extends ApiSchemaBase> {
  private endpoints: { endpoint: string, method: string, type: { request: ApiRequestBase, response: ApiResponseBase } }[];
  constructor(public schema: Schema) {
    this.endpoints = Object.entries(schema).flatMap(v => Object.entries(v[1]).map(e => ({ endpoint: v[0], method: e[0], type: e[1] })));
  }

  private messages = {
    badRequest: '400 Bad Request',
    notFound: '404 Not Found',
    internalServerError: '500 Internal Server Error',
    notImplemented: '501 Not Implemented',
  };

  private listeningHanders: Handler<Schema>[] = [];
  private handlers: Handler<Schema>[] = [];
  private extHandlers: NutsAPIHandler<Schema>[] = [];
  private corsOptions: CorsOption[] = [];

  private server: Server | undefined = undefined;

  public handle<T extends AllEndPoint<Schema>, U extends AllMethod<Schema, T>>
  (endpoint: T, method: U, handler: WorkerType<Schema, T, U>) {
    this.handlers.push({ endpoint, method, worker: handler });
  }

  public withHandlers(handler: NutsAPIHandler<Schema>) {
    this.extHandlers.push(handler);
  }

  public cors(option: CorsOption | string) {
    if(typeof option == 'string') {
      this.corsOptions.push({
        origin: option,
        headers: ['*'],
        methods: [...HTTP_REQUEST_METHODS, 'OPTIONS'],
        credential: true,
      });
      return;
    }
    this.corsOptions.push(option);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse<IncomingMessage>) {

    if(req.method === 'OPTIONS') {
      const origin = req.headers.origin;
      if(origin === undefined) {
        res.writeHead(204);
        res.end();
        return;
      }
      const option = this.corsOptions.find(v => v.origin === origin);
      if(option !== undefined) {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': option.headers.join(', '),
          'Access-Control-Allow-Methods': option.methods.join(', '),
          ...(option.credential ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
        });
      } else {
        res.writeHead(204);
      }
      res.end();
      return;
    }

    if(req.url === undefined) return this.responseError(res, 500);

    const url = parse(req.url, true);
    if(req.method === 'GET' || (req.headers['content-type'] !== 'application/json' && req.method === 'DELETE')) {
      return this.handleEndPoint(req.method, url.pathname ?? '/', url.query, req, res);
    }

    if(req.headers['content-type'] !== 'application/json') return this.responseError(res, 400);

    try {
      const body: Uint8Array[] = [];
      req.on('error', (err) => {
        console.error(err);
      }).on('data', (chunk: Uint8Array)=> {
        body.push(chunk);
      }).on('end', () => {
        const receivedBody = Buffer.concat(body).toString();
        const payload = JSON.parse(receivedBody);
        return this.handleEndPoint(req.method ?? '', url.pathname ?? '/', payload, req, res);
      });
    } catch {
      return this.responseError(res, 400);
    }
  }

  private async handleEndPoint(method: string, endpoint: string, payload: unknown, req: IncomingMessage, res: ServerResponse<IncomingMessage>) {
    const handler = this.listeningHanders.find(v => v.endpoint === endpoint && v.method === method);
    const schema = this.endpoints.find(v => v.endpoint === endpoint && v.method === method);

    if(handler === undefined || schema === undefined) {  
      return this.responseError(res, schema !== undefined ? 501 : 404);
    }

    const parsedPayload = schema.type.request.safeParse(payload);
    if(!parsedPayload.success) return this.responseError(res, 400);

    
    const nutsRequest = new NutsRequest<unknown, never>(parsedPayload.data, req);
    await handler.worker(nutsRequest);

    const response = NutsRequest.UNPACK(nutsRequest);
    if(response === null) return this.responseError(res, 500);
    try{
      const content = JSON.stringify(response.payload);
      res.writeHead(response.code, {
        'Content-Type': 'application/json',
        ...(response.cookie === null ? {} : { 'Set-Cookie': response.cookie }),
      });
      res.end(content, 'utf-8');
      return;
    } catch {
      return this.responseError(res, 500);
    }
  }

  private async responseError(res: ServerResponse<IncomingMessage>, code: 400 | 404 | 500 | 501) {
    res.writeHead(code);
    switch(code) {
    case 400:
      res.end(this.messages.badRequest, 'utf-8');
      break;
    case 404:
      res.end(this.messages.notFound, 'utf-8');
      break;
    case 500:
      res.end(this.messages.internalServerError, 'utf-8');
      break;
    case 501:
      res.end(this.messages.notImplemented, 'utf-8');
      break;
    }
  }

  public listen(port: number) {
    this.listeningHanders = [this.handlers, ...this.extHandlers.map(v => NutsAPIHandler.UNPACK(v))].flat();
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.server.listen(port);
  }

  public close() {
    this.server?.close();
  }
}

export { NutsAPIHandler } from './handler';
export type { NutsRequest } from './worker';
