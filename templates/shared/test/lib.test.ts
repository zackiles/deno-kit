/**
 * @module lib.test
 * @fileoverview Basic tests demonstrating Deno native testing
 *
 * This file showcases Deno's built-in testing capabilities including:
 * - Basic Deno.test() usage
 * - Assertions from std/assert
 * - Test organization and descriptions
 * - Testing class instances and CRUD operations
 * @see https://deno.land/std/assert
 */

import { assertEquals, assertExists, assertInstanceOf } from '@std/assert'
import { Lib } from '../src/lib.ts'

// Basic test demonstrating simple assertions
Deno.test('basic assertion test', () => {
  const result = 2 + 2
  assertEquals(result, 4)
})

// Test group for Lib class
Deno.test('Lib class instantiation', () => {
  const lib = new Lib()
  assertInstanceOf(lib, Lib)
})

Deno.test('Lib class with config', () => {
  const config = { debug: true, env: 'test' }
  const lib = new Lib(config)
  assertInstanceOf(lib, Lib)
})

// CRUD operation tests
Deno.test('Lib create operation', () => {
  const lib = new Lib()
  const testData = { id: 1, name: 'Test Item' }

  const result = lib.create(testData)
  assertEquals(result, testData)
  assertExists(result.id)
  assertEquals(result.name, 'Test Item')
})

Deno.test('Lib read operation', () => {
  const lib = new Lib()
  const query = { id: 1 }

  const result = lib.read(query)
  assertEquals(result, query)
  assertEquals(result.id, 1)
})

Deno.test('Lib update operation', () => {
  const lib = new Lib()
  const updateData = { id: 1, name: 'Updated Item', status: 'active' }

  const result = lib.update(updateData)
  assertEquals(result, updateData)
  assertEquals(result.name, 'Updated Item')
  assertEquals(result.status, 'active')
})

Deno.test('Lib destroy operation', () => {
  const lib = new Lib()
  const deleteQuery = { id: 1 }

  const result = lib.destroy(deleteQuery)
  assertEquals(result, deleteQuery)
  assertEquals(result.id, 1)
})

// Async test example (though our Lib methods are sync)
Deno.test('async test example', async () => {
  const promise = Promise.resolve('async result')
  const result = await promise
  assertEquals(result, 'async result')
})

// Test with custom test options
Deno.test({
  name: 'test with options - ignore slow test',
  ignore: false,
  only: false,
}, () => {
  const lib = new Lib({ performance: 'fast' })
  const result = lib.create({ type: 'quick' })
  assertEquals(result.type, 'quick')
})
