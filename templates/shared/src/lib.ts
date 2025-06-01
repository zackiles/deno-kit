/**
 * @module lib
 * @description A default starter library providing basic CRUD operations with logging.
 *
 * This module exports a flexible Lib class that serves as a foundational library
 * for creating, reading, updating, and destroying resources with configurable options.
 *
 * @example
 * ```ts
 * import { Lib } from './lib.ts';
 *
 * // Create a new Lib instance with optional configuration
 * const lib = new Lib({ debug: true });
 *
 * // Perform CRUD operations
 * const newResource = lib.create({ name: 'Example' });
 * const readResource = lib.read({ id: newResource.id });
 * const updatedResource = lib.update({ ...readResource, name: 'Updated' });
 * lib.destroy({ id: updatedResource.id });
 * ```
 *
 * @see {@link LibConfig} for configuration options
 * @see {@link logger} for logging implementation
 *
 * @beta
 * @version 0.0.1
 */

import logger from './utils/logger.ts'

/**
 * Configuration options for the Lib class
 */
interface LibConfig {
  [key: string]: unknown
}

type CrudOperation = {
  [key: string]: unknown
}

type LibRequest = CrudOperation
type LibResult = CrudOperation

/**
 * Lib class is a default starter library that is exported to a user.
 */
class Lib {
  private config: LibConfig

  /**
   * Creates a new Lib instance
   * @param config Configuration object for the Lib instance
   */
  constructor(config: LibConfig = {}) {
    this.config = config
    logger.debug('Lib instance created', { config })
  }

  /**
   * Creates a new resource
   * @param data The data to create
   * @returns The created data
   */
  create(data: LibRequest): LibResult {
    logger.info('Creating resource', { config: this.config, data })
    return data
  }

  /**
   * Reads a resource
   * @param query The query parameters
   * @returns The queried data
   */
  read(query: LibRequest): LibResult {
    logger.info('Reading resource', { config: this.config, query })
    return query
  }

  /**
   * Updates a resource
   * @param data The data to update
   * @returns The updated data
   */
  update(data: LibRequest): LibResult {
    logger.info('Updating resource', { config: this.config, data })
    return data
  }

  /**
   * Destroys a resource
   * @param query The query parameters for deletion
   * @returns The deleted data
   */
  destroy(query: LibRequest): LibResult {
    logger.info('Destroying resource', { config: this.config, query })
    return query
  }
}

export { Lib }
export type { LibConfig, LibRequest, LibResult }
