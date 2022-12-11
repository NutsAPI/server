import type { ApiSchemaBase, HttpRequestMethod, ApiRequestBase, ApiResponseBase } from '@nutsapi/types';
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
  T extends AllEndPoint<Schema>,
  U extends AllMethod<Schema, T>,
> = 
  (
    payload: NutsRequest<
      ExtractSchema<Schema, T, U>['request']['_output'],
      {
        [S in (keyof ExtractSchema<Schema, T, U>['response']) & number]:
          ExtractSchema<Schema, T, U>['response'][S]['_output'] 
      }
    >
  ) => Promise<void>;


export type Handler<
  Schema extends ApiSchemaBase,
  T extends AllEndPoint<Schema> = AllEndPoint<Schema>,
  U extends AllMethod<Schema, T> = AllMethod<Schema, T>,
> = {
  endpoint: T,
  method: U,
  worker: WorkerType<Schema, T, U>,
}

export class NutsAPIHandler<Schema extends ApiSchemaBase> {
  private handlers: Handler<Schema>[] = [];
  public handle<T extends AllEndPoint<Schema>, U extends AllMethod<Schema, T>>
  (endpoint: T, method: U, handler: WorkerType<Schema, T, U>) {
    this.handlers.push({ endpoint, method, worker: handler });
  }
  static UNPACK<Schema extends ApiSchemaBase>(handler: NutsAPIHandler<Schema>) {
    return handler.handlers;
  }
}
