import { OpenAPISpecMethodName } from "schema-openapi";

import { Method } from "@effect/platform/Http/Method";
import { ParseResult, Schema } from "@effect/schema";
import { Effect, Option, Predicate, pipe } from "effect";
import { Endpoint, IgnoredSchemaId } from "effect-http/Api";
import * as ClientError from "effect-http/ClientError";

/** @internal */
export const getSchema = <A = AnySchema>(
  input: AnySchema | IgnoredSchemaId,
  defaultSchema: AnySchema | A = Schema.unknown,
) => (input == IgnoredSchemaId ? defaultSchema : input);

/** @internal */
export const getSchemaOption = (input: AnySchema | IgnoredSchemaId) =>
  input == IgnoredSchemaId ? Option.none() : Option.some(input);

/** @internal */
export const isArray = (input: unknown): input is readonly any[] =>
  Array.isArray(input);

export type AnySchema = Schema.Schema<any>;
export type SchemaTo<S> = S extends Schema.Schema<any, infer A> ? A : never;

/** @internal */
export const createResponseSchema = (
  responseSchema: Endpoint["schemas"]["response"],
) => {
  if (Schema.isSchema(responseSchema)) {
    return responseSchema;
  }

  return Schema.union(
    ...(isArray(responseSchema) ? responseSchema : [responseSchema]).map(
      ({ status, content, headers }) =>
        Schema.struct({
          status: Schema.literal(status),
          content: getSchema(content),
          headers: getSchema(
            headers,
            Schema.record(Schema.string, Schema.string),
          ),
        }),
    ),
  );
};

/** @internal */
const parse = <A, E>(
  a: A,
  encode: (i: unknown) => Effect.Effect<never, ParseResult.ParseError, any>,
  onError: (error: ParseResult.ParseError) => E,
) =>
  pipe(
    a === IgnoredSchemaId ? Effect.succeed(a) : encode(a),
    Effect.mapError(onError),
  );

/** @internal */
export const createRequestEncoder = (
  requestSchemas: Endpoint["schemas"]["request"],
) => {
  const encodeQuery = Schema.encode(getSchema(requestSchemas.query));
  const encodeParams = Schema.encode(getSchema(requestSchemas.params));
  const encodeBody = Schema.encode(getSchema(requestSchemas.body));
  const encodeHeaders = Schema.encode(getSchema(requestSchemas.headers));

  return (_args: any) => {
    const args = _args ?? {};
    return Effect.all({
      query: parse(
        args["query"],
        encodeQuery,
        ClientError.RequestEncodeError.fromParseError("query"),
      ),
      params: parse(
        args["params"],
        encodeParams,
        ClientError.RequestEncodeError.fromParseError("params"),
      ),
      body: parse(
        args["body"],
        encodeBody,
        ClientError.RequestEncodeError.fromParseError("body"),
      ),
      headers: parse(
        args["headers"],
        encodeHeaders,
        ClientError.RequestEncodeError.fromParseError("headers"),
      ),
    });
  };
};

/** @internal */
export const getSchemaPropertySignatures = (schema: AnySchema) => {
  let ast = schema.ast;

  if (ast._tag === "Transform") {
    ast = ast.from;
  }

  if (ast._tag !== "TypeLiteral") {
    throw new Error(`Response headers must be a type literal schema`);
  }

  return ast.propertySignatures;
};

/** @internal */
export const getResponseContent = (response: Response) =>
  Effect.tryPromise(async () => {
    const contentLength = response.headers.get("Content-Length");

    if (contentLength && parseInt(contentLength, 10) === 0) {
      return Promise.resolve(undefined);
    }

    const contentType = response.headers.get("Content-Type");
    const isJson =
      Predicate.isString(contentType) &&
      contentType.startsWith("application/json");

    if (isJson) {
      return (await response.json()) as Promise<unknown>;
    } else {
      return await response.text();
    }
  });

/** @internal */
export const convertMethod = (method: OpenAPISpecMethodName): Method => {
  // TODO: probably remove from schema-openapi
  if (method === "trace") {
    throw new Error("trace method is not supported by @effect/platform");
  }

  return method.toUpperCase() as Method;
};
