/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { ApiRequestBase, ApiResponseBase, ApiSchemaBase, Conv, ConvWorker, HttpRequestMethod} from '@nutsapi/types';
import { convToPayload} from '@nutsapi/types';
import { convToObject } from '@nutsapi/types';
import { HTTP_REQUEST_METHODS } from '@nutsapi/types';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createServer } from 'http';
import type { UrlWithParsedQuery } from 'url';
import { parse } from 'url';
import type { Handler, AllEndPoint, AllMethod, WorkerType} from './handler';
import { NutsAPIHandler } from './handler';
import type { NutsLogger } from './logger';
import { NormalNutsLogger } from './logger';
import { getRemoteAddress } from './remoteAddress';
import { NutsRequest } from './worker';

interface CorsOption {
  origin: string,
  headers: string[],
  methods: (HttpRequestMethod | 'OPTIONS')[],
  credential: boolean,
}

export class NutsAPIServer<Schema extends ApiSchemaBase, Convs extends Conv[] = []> {
  private endpoints: { endpoint: string, method: string, type: { request: ApiRequestBase, response: ApiResponseBase } }[];
  constructor(
    public schema: Schema,
    public converters: { [P in keyof Convs]: ConvWorker<Convs[P]> },
    public logger: NutsLogger = new NormalNutsLogger(),
  ) {
    this.endpoints = Object.entries(schema).flatMap(v => Object.entries(v[1]).map(e => ({ endpoint: v[0], method: e[0], type: e[1] })));
  }

  private messages = {
    badRequest: '400 Bad Request',
    notFound: '404 Not Found',
    internalServerError: '500 Internal Server Error',
    notImplemented: '501 Not Implemented',
  };

  private listeningHanders: Handler<Schema, Convs>[] = [];
  private handlers: Handler<Schema, Convs>[] = [];
  private extHandlers: NutsAPIHandler<Schema, Convs>[] = [];
  private corsOptions: CorsOption[] = [];

  private server: Server | undefined = undefined;

  public handle<T extends AllEndPoint<Schema>, U extends AllMethod<Schema, T>>
  (endpoint: T, method: U, handler: WorkerType<Schema, Convs, T, U>) {
    //@ts-ignore
    this.handlers.push({ endpoint, method, worker: handler });
  }

  public withHandlers(handler: NutsAPIHandler<Schema, Convs>) {
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

  private async handleRequest(req: IncomingMessage, url: UrlWithParsedQuery | undefined): Promise<{ headers: Record<string, string | string[]>, code: number, payload: string | null }> {

    if(url === undefined) return this.responseError(500);

    if(req.method === 'GET' || (req.headers['content-type'] !== 'application/json' && req.method === 'DELETE')) {
      return this.handleEndPoint(req.method, url.pathname ?? '/', url.query, req);
    }

    if(req.headers['content-type'] !== 'application/json') return this.responseError(400);

    return new Promise(resolve => {
      const body: Uint8Array[] = [];
      req.on('error', (err) => {
        console.error(err);
      }).on('data', (chunk: Uint8Array)=> {
        body.push(chunk);
      }).on('end', () => {
        const receivedBody = Buffer.concat(body).toString();
        try {
          const payload = JSON.parse(receivedBody);
          resolve(this.handleEndPoint(req.method ?? '', url.pathname ?? '/', payload, req));
          return;
        } catch {
          resolve(this.responseError(400));
          return;
        }
      });
    });
  }

  private async handleEndPoint(method: string, endpoint: string, payload: unknown, req: IncomingMessage) {
    const handler = this.listeningHanders.find(v => v.endpoint === endpoint && v.method === method);
    const schema = this.endpoints.find(v => v.endpoint === endpoint && v.method === method);

    if(handler === undefined || schema === undefined) {  
      return this.responseError(schema !== undefined ? 501 : 404);
    }

    const parsedPayload = schema.type.request.safeParse(payload);
    if(!parsedPayload.success) return this.responseError(400);

    //@ts-ignore
    const nutsRequest = new NutsRequest<unknown, never>(convToObject(parsedPayload.data, this.converters), req);
    //@ts-ignore
    await handler.worker(nutsRequest);

    const response = NutsRequest.UNPACK(nutsRequest);
    if(response === null) return this.responseError(500);
    try{
      const content = JSON.stringify(response.payload);
      return {
        code: response.code,
        headers: {
          'Content-Type': 'application/json',
          ...(response.cookie === null ? {} : { 'Set-Cookie': response.cookie }),
        },
        //@ts-ignore
        payload: convToPayload(content, this.converters),
      };
    } catch {
      return this.responseError(500);
    }
  }

  private async responseError(code: 400 | 404 | 500 | 501) {
    switch(code) {
    case 400:
      return { code, payload: this.messages.badRequest, headers: {} };
    case 404:
      return { code, payload: this.messages.notFound, headers: {} };
    case 500:
      return { code, payload: this.messages.internalServerError, headers: {} };
    case 501:
      return { code, payload: this.messages.notImplemented, headers: {} };
    }
  }

  private async listener(req: IncomingMessage, res: ServerResponse<IncomingMessage>) {
    const origin = req.headers.origin;
    const option = this.corsOptions.find(v => v.origin === origin);
    const remoteAddress = getRemoteAddress(req.headers, req.socket.remoteAddress);

    const cors = origin !== undefined && option !== undefined ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': option.headers.join(', '),
      'Access-Control-Allow-Methods': option.methods.join(', '),
      ...(option.credential ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
    } : {};

    const url = req.url !== undefined ? parse(req.url, true) : req.url;

    if(req.method === 'OPTIONS') {
      if(origin === undefined || option === undefined) {
        res.writeHead(204);
      } else {
        res.writeHead(204, cors);
      }
      res.end();

      this.logger.request({
        method: 'OPTIONS',
        path: url?.pathname ?? '',
        statusCode: 204,
        remoteAddress: remoteAddress ?? 'unknown',
      });
      return;
    }

    const result = await this.handleRequest(req, url);

    res.writeHead(result.code, { ...result.headers, ...cors });
    if(result.payload === null) { res.end(); } else { res.end(result.payload, 'utf-8'); }

    this.logger.request({
      method: req.method ?? '',
      path: url?.pathname ?? '',
      statusCode: result.code,
      remoteAddress: remoteAddress ?? 'unknown',
    });
  }

  public listen(port: number) {
    this.listeningHanders = [this.handlers, ...this.extHandlers.map(v => NutsAPIHandler.UNPACK(v))].flat();
    this.server = createServer((req, res) => {
      void this.listener(req, res);
    });
    this.server.listen(port);
  }

  public close() {
    this.server?.close();
  }
}

export { NutsAPIHandler } from './handler';
export { NutsLogger } from './logger';
export type { NutsRequest } from './worker';
