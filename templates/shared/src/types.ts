/**
 * Utility Type Declarations
 *
 * Deno 2-compatible utility types used throughout the application.
 */

/**
 * JSON primitive types
 */
type JSONPrimitive = string | number | boolean | null

/**
 * JSON object type
 */
type JSONObject = { [key: string]: JSONValue }

/**
 * JSON array type
 */
type JSONArray = JSONValue[]

/**
 * JSON value type
 */
type JSONValue = JSONPrimitive | JSONObject | JSONArray

/**
 * Record with string keys and unknown values
 */
type AnyRecord = Record<string, unknown>

/**
 * Basic callback function type (Node-style)
 */
type Callback<T = void> = (error?: Error | null, result?: T) => void

/**
 * Async function that returns a Promise
 */
type AsyncFunction<T, A extends unknown[]> = (...args: A) => Promise<T>

/**
 * Function with a timeout metadata field
 */
interface TimedFunction<T, A extends unknown[]> {
  (...args: A): Promise<T>
  timeout: number
}

/**
 * Optional properties in T
 */
type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Required properties in T
 */
type RequiredFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

/**
 * Deep partial type
 */
type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T

/**
 * Result of an operation
 */
interface Result<T, E = Error> {
  success: boolean
  value?: T
  error?: E
}

/**
 * Success result
 */
type Success<T> = {
  success: true
  value: T
}

/**
 * Error result
 */
type Failure<E = Error> = {
  success: false
  error: E
}

/**
 * Either success or failure
 */
type Either<T, E = Error> = Success<T> | Failure<E>

/**
 * Create a success result
 */
function success<T>(value: T): Success<T> {
  return { success: true, value }
}

/**
 * Create a failure result
 */
function failure<E = Error>(error: E): Failure<E> {
  return { success: false, error }
}

// Export types
export type {
  AnyRecord,
  AsyncFunction,
  Callback,
  DeepPartial,
  Either,
  Failure,
  JSONArray,
  JSONObject,
  JSONPrimitive,
  JSONValue,
  Optional,
  RequiredFields,
  Result,
  Success,
  TimedFunction,
}

// Export functions
export { failure, success }
