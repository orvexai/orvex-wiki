import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * IsTtlDaysOrNever — validates a TTL-in-days field that also accepts the
 * literal string `'never'` (meaning "do not expire"). ENG-1432 AC6.
 * Valid: the literal string `'never'`, or an integer >= 1.
 * Invalid: `0`, negative numbers, non-integers, any other string.
 */
export function IsTtlDaysOrNever(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTtlDaysOrNever',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be the literal string 'never' or a positive integer`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (value === 'never') return true;
          return (
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= 1
          );
        },
      },
    });
  };
}
