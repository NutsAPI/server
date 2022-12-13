import type { ApiSchemaBase, HttpRequestMethod, ApiRequestBase, ApiResponseBase, Conv, ConvChain } from '@nutsapi/types';
import type { NutsRequest } from './worker';

export type AllEndPoint<Schema extends ApiSchemaBase> = (keyof Schema & string);
export type AllMethod<Schema extends ApiSchemaBase, T extends AllEndPoint<Schema>> = (keyof Schema[T] & HttpRequestMethod);

export type ExtractSchema<
  Schema extends ApiSchemaBase,
  T extends AllEndPoint<Schema> = AllEndPoint<Schema>,
  U extends AllMethod<Schema, T> = AllMethod<Schema, T>,
> = 
  Schema[T][U] extends { request: ApiRequestBase, response: ApiResponseBase } ? Schema[T][U] : never;

export type WorkerType<
  Schema extends ApiSchemaBase,
  Convs extends Conv[],
  T extends AllEndPoint<Schema>,
  U extends AllMethod<Schema, T>,
> = 
  (
    payload: NutsRequest<
      ConvChain<ExtractSchema<Schema, T, U>['request']['_output'], Convs, 'payload', 'object'>,
      {
        [S in (keyof ExtractSchema<Schema, T, U>['response']) & number]:
          ConvChain<ExtractSchema<Schema, T, U>['response'][S]['_output'], Convs, 'payload', 'object'>
      }
    >
  ) => Promise<void>;


export type Handler<
  Schema extends ApiSchemaBase,
  Convs extends Conv[],
  T extends AllEndPoint<Schema> = AllEndPoint<Schema>,
  U extends AllMethod<Schema, T> = AllMethod<Schema, T>,
> = {
  endpoint: T,
  method: U,
  worker: WorkerType<Schema, Convs, T, U>,
}

export class NutsAPIHandler<Schema extends ApiSchemaBase, Convs extends Conv[]> {
  private handlers: Handler<Schema, Convs>[] = [];
  public handle<T extends AllEndPoint<Schema>, U extends AllMethod<Schema, T>>
  (endpoint: T, method: U, handler: WorkerType<Schema, Convs, T, U>) {
    this.handlers.push({ endpoint, method, worker: handler });
  }
  static UNPACK<Schema extends ApiSchemaBase, Convs extends Conv[]>(handler: NutsAPIHandler<Schema, Convs>) {
    return handler.handlers;
  }
}
