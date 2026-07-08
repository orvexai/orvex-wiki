import { isUUID, registerDecorator, ValidationOptions } from 'class-validator';

/**
 * ENG-1596 (DoD 4d) — enforces the decided single-principal contract
 * (`userId` XOR `groupId`, never both, never neither) at the class-validator
 * layer, so a malformed body 400s in the global `ValidationPipe` before it
 * reaches the controller. `PagePermissionController.assertSinglePrincipal`
 * is kept as defense-in-depth (it also runs on internally-constructed DTOs
 * that bypass the pipe), but the DTO itself now documents and enforces the
 * contract.
 *
 * Deliberately NOT layered under `@IsOptional()` — `IsOptional` skips every
 * validator on the SAME property whenever that property is undefined, which
 * would blind the "neither provided" case whenever the decorated field
 * happens to be the absent one. This validator instead owns its own
 * "present -> must be a UUID" check and applies to both `userId` and
 * `groupId` so the XOR condition is checked regardless of which field (if
 * either) is missing.
 */
export function ExactlyOnePrincipal(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'exactlyOnePrincipal',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Provide exactly one of userId or groupId, not both and not neither',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, args) {
          const obj = args.object as { userId?: string; groupId?: string };
          const hasUser = Boolean(obj.userId);
          const hasGroup = Boolean(obj.groupId);
          if (hasUser === hasGroup) {
            // both set or neither set
            return false;
          }
          // If this property carries a value, it must be a well-formed UUID.
          return value === undefined || value === null || isUUID(value);
        },
      },
    });
  };
}
