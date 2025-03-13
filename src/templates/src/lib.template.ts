import { Logger } from './core/logger.ts'
import type { LibConfig, LibRequest, LibResult } from './types.ts'

// Default logger for you to use. Will print to the default OpenTelemetry sink.
const logger = Logger.get('lib')

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
