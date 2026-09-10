import { DynamicModule, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { NativeAuthController } from './native-auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SignupService } from './services/signup.service';
import { TokenModule } from './token.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import { OrvexEnforceSsoModule } from '../../orvex/enforce-sso/orvex-enforce-sso.module';

@Module({})
export class AuthModule {
  static register(): DynamicModule {
    const nativeControllers =
      process.env.NATIVE_LOGIN_REMOVED === 'true'
        ? []
        : [NativeAuthController];

    return {
      module: AuthModule,
      imports: [
        TokenModule,
        WorkspaceModule,
        ApiKeyModule,
        OrvexEnforceSsoModule,
      ],
      controllers: [AuthController, ...nativeControllers],
      providers: [AuthService, SignupService, JwtStrategy],
      exports: [SignupService],
    };
  }
}
