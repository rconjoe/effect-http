/**
 * Derivation of utilities.
 *
 * @since 1.0.0
 */
import { Schema } from "@effect/schema";
import { type Types } from "effect";
import type {
  Api,
  Endpoint,
  EndpointSchemas,
  IgnoredSchemaId,
  ResponseSchemaFull,
} from "effect-http/Api";
import { RequiredFields } from "effect-http/ServerBuilder";
import { AnySchema, SchemaTo, isArray } from "effect-http/internal/utils";

/**
 * Derive utility object with methods enabling type-safe response object creation.
 *
 * @since 1.0.0
 */
export const responseUtil = <
  A extends Api,
  Id extends A["endpoints"][number]["id"],
>(
  api: A,
  id: Id,
): ResponseUtil<Extract<A["endpoints"][number], { id: Id }>> => {
  const endpoint = api.endpoints.find((e) => e.id === id);

  if (endpoint === undefined) {
    throw new Error(`Endpoint ${id} not found`);
  }

  const responseSchema = endpoint.schemas.response;

  if (Schema.isSchema(responseSchema)) {
    return {} as any;
  }

  return (isArray(responseSchema) ? responseSchema : [responseSchema]).reduce(
    (obj, responseSchema) => ({
      ...obj,
      [`response${responseSchema.status}`]: (data: any) => ({
        status: responseSchema.status,
        ...data,
      }),
    }),
    {},
  ) as any;
};

// Internal type helpers

/** @ignore */
export type ResponseUtil<E extends Endpoint> = Types.Simplify<
  NormalizedSchemasByIdToResponseUtils<SchemasByIdFromApi<E>>
>;

/** @ignore */
type SchemasByIdFromApi<E extends Endpoint> = E extends any
  ? NormalizeSchemas<E["schemas"]["response"]>
  : never;

/** @ignore */
type NormalizedSchemasBydId = {
  status: number;
  input: { content?: unknown; headers?: unknown };
};

/** @ignore */
type NormalizedSchemasByIdToResponseUtils<M extends NormalizedSchemasBydId> = {
  [Status in M["status"] as `response${Status}`]: (
    data: Extract<M, { status: Status }>["input"],
  ) => Types.Simplify<
    { status: Status } & Extract<M, { status: Status }>["input"]
  >;
};

/** @ignore */
type NormalizeSchemas<S extends EndpointSchemas["response"]> =
  S extends readonly ResponseSchemaFull[]
    ? NormalizeResponseSchemaFull<S[number]>
    : S extends ResponseSchemaFull
    ? NormalizeResponseSchemaFull<S>
    : never;

/** @ignore */
type NormalizeResponseSchemaFull<S extends ResponseSchemaFull> = S extends any
  ? { status: S["status"]; input: CreateInput<S> }
  : never;

/** @ignore */
type CreateInput<
  S extends {
    headers: IgnoredSchemaId | AnySchema;
    content: IgnoredSchemaId | AnySchema;
  },
> = Types.Simplify<{
  [K in Extract<RequiredFields<S>, "headers" | "content">]: SchemaTo<S[K]>;
}>;
