/**
 * schemas.controller.spec.ts — ENG-1412 AC1-AC4
 *
 * GET /api/schemas/blocks (listSchemas) and GET /api/schemas/blocks/:type
 * (getSchema), plus the @Public() route-metadata contract that lets these
 * routes be called pre-login by CLI/MCP/agent tooling.
 */
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { SchemasController, registerBlockSchema } from '../schemas.controller';

describe('SchemasController', () => {
  let controller: SchemasController;

  beforeAll(async () => {
    // Register one known schema deterministically so this file does not
    // depend on handler side-effect import order.
    registerBlockSchema('__eng_1412_ac_test_type__', {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'AcTestType',
      type: 'object',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchemasController],
    }).compile();

    controller = module.get<SchemasController>(SchemasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // AC1
  it('listSchemas returns a sorted array containing the registered type', () => {
    const result = controller.listSchemas() as { schemas: string[] };
    expect(Array.isArray(result.schemas)).toBe(true);
    expect(result.schemas).toContain('__eng_1412_ac_test_type__');
    expect(result.schemas).toEqual([...result.schemas].sort());
  });

  // AC2
  it('getSchema returns the exact registered schema object for a known type', () => {
    const schema = controller.getSchema('__eng_1412_ac_test_type__');
    expect(schema).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'AcTestType',
      type: 'object',
    });
  });

  // AC3
  it('getSchema throws a typed 404 SCHEMA_NOT_FOUND for an unregistered type', () => {
    expect(() => controller.getSchema('__totally_unknown_type__')).toThrow(
      NotFoundException,
    );
    try {
      controller.getSchema('__totally_unknown_type__');
      fail('expected getSchema to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      const response = (err as NotFoundException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.code).toBe('SCHEMA_NOT_FOUND');
      expect(typeof response.message).toBe('string');
    }
  });

  // AC4 — both routes are @Public()
  it('listSchemas and getSchema are both marked @Public()', () => {
    const reflector = new Reflector();
    expect(
      reflector.get<boolean>(IS_PUBLIC_KEY, SchemasController.prototype.listSchemas),
    ).toBe(true);
    expect(
      reflector.get<boolean>(IS_PUBLIC_KEY, SchemasController.prototype.getSchema),
    ).toBe(true);
  });
});
