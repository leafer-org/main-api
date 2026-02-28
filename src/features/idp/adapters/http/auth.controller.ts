import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { GetMeInteractor } from '../../application/queries/me/get-me.interactor.js';
import { CreateOtpInteractor } from '../../application/use-cases/otp-flow/create-otp.interactor.js';
import { RegisterInteractor } from '../../application/use-cases/otp-flow/register.interactor.js';
import { VerifyOtpInteractor } from '../../application/use-cases/otp-flow/verify-otp.interactor.js';
import { DeleteSessionInteractor } from '../../application/use-cases/session/delete-session.interactor.js';
import { RotateSessionInteractor } from '../../application/use-cases/session/rotate-session.interactor.js';
import {
  InvalidOtpError,
  LoginBlockedError,
  OtpExpiredError,
  OtpThrottleError,
  RegistractionError,
} from '../../domain/aggregates/login-process/errors.js';
import {
  SessionExpiredError,
  SessionNotFoundError,
} from '../../domain/aggregates/session/errors.js';
import { resolveAvatarUrls } from './avatar-url.helper.js';
import { CurrentUser } from '@/infra/auth/current-user.decorator.js';
import { JwtAuthGuard } from '@/infra/auth/jwt-auth.guard.js';
import type { JwtUserPayload } from '@/infra/auth/jwt-user-payload.js';
import type { PublicBody, PublicResponse } from '@/infra/contracts/types.js';
import { isLeft } from '@/infra/lib/box.js';
import { MediaService } from '@/kernel/application/ports/media.js';

@Controller('auth')
export class AuthController {
  public constructor(
    private readonly createOtp: CreateOtpInteractor,
    private readonly verifyOtp: VerifyOtpInteractor,
    private readonly rotateSession: RotateSessionInteractor,
    private readonly register: RegisterInteractor,
    private readonly deleteSession: DeleteSessionInteractor,
    private readonly getMe: GetMeInteractor,
    @Inject(MediaService)
    private readonly mediaService: MediaService,
  ) {}

  @Post('request-otp')
  public async requestOtp(
    @Body() body: PublicBody['requestOtp'],
    @Req() req: Request,
  ): Promise<PublicResponse['requestOtp']> {
    const result = await this.createOtp.execute({
      phoneNumber: body.phoneNumber,
      ip: req.ip ?? '',
    });

    if (isLeft(result)) {
      const error = result.error;
      if (error instanceof OtpThrottleError) {
        throw new HttpException(
          { code: 'throttled', retryAfterSec: error.data.retryAfterSec },
          429,
        );
      }
      throw new BadRequestException({ code: error.type });
    }

    return {};
  }

  @Post('verify-otp')
  public async verifyOtpEndpoint(
    @Body() body: PublicBody['verifyOtp'],
    @Req() req: Request,
  ): Promise<PublicResponse['verifyOtp']> {
    const ip = req.ip;
    const result = await this.verifyOtp.execute({
      phoneNumber: body.phoneNumber,
      code: body.code,
      ip,
    });

    if (isLeft(result)) {
      const error = result.error;
      if (error instanceof LoginBlockedError) {
        const retryAfterSec = Math.ceil((error.data.blockedUntil.getTime() - Date.now()) / 1000);
        throw new ForbiddenException({
          code: 'otp_attempts_exceeded',
          retryAfterSec: Math.max(retryAfterSec, 60),
        });
      }
      if (error instanceof InvalidOtpError || error instanceof OtpExpiredError) {
        throw new BadRequestException({ code: error.type });
      }
      throw new BadRequestException({ code: 'unknown_error' });
    }

    const value = result.value;
    if (value.type === 'new_registration') {
      return {
        type: 'new_registration',
        registrationSessionId: value.registrationSessionId,
      };
    }

    return {
      type: 'authenticated',
      accessToken: value.accessToken as string,
      refreshToken: value.refreshToken as string,
    };
  }

  @Get('refresh')
  public async refresh(
    @Headers('x-refresh-token') refreshToken: string,
  ): Promise<PublicResponse['refresh']> {
    if (!refreshToken) {
      throw new UnauthorizedException({ code: 'missing_refresh_token' });
    }

    try {
      const result = await this.rotateSession.execute({ refreshToken });

      if (isLeft(result)) {
        const error = result.error;
        if (error instanceof SessionNotFoundError || error instanceof SessionExpiredError) {
          throw new UnauthorizedException({ code: error.type });
        }
        throw new UnauthorizedException({ code: 'invalid_token' });
      }

      return {
        accessToken: result.value.accessToken as string,
        refreshToken: result.value.refreshToken as string,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException({ code: 'invalid_token' });
    }
  }

  @Post('complete-profile')
  public async completeProfile(
    @Body() body: PublicBody['completeProfile'],
  ): Promise<PublicResponse['completeProfile']> {
    const result = await this.register.execute({
      registrationSessionId: body.registrationSessionId,
      fullName: body.fullName ?? '',
      avatarMedia: body.avatarMedia
        ? {
            key: body.avatarMedia.mediaId,
            url: body.avatarMedia.objectKey,
            mimeType: body.avatarMedia.contentType ?? '',
          }
        : undefined,
    });

    if (isLeft(result)) {
      if (result.error instanceof RegistractionError) {
        throw new BadRequestException({ code: 'registration_error' });
      }
      throw new BadRequestException({ code: result.error.type });
    }

    const { accessToken, refreshToken, userId, sessionId } = result.value;

    const meResult = await this.getMe.execute({ userId, sessionId });
    if (isLeft(meResult)) {
      throw new BadRequestException({ code: 'user_fetch_failed' });
    }

    const me = meResult.value;
    const avatar = await resolveAvatarUrls(this.mediaService, me.avatarId);

    return {
      user: {
        id: me.userId,
        phoneNumber: me.phoneNumber,
        fullName: me.fullName,
        avatar,
        createdAt: me.createdAt.toISOString(),
        updatedAt: me.updatedAt.toISOString(),
      },
      accessToken,
      refreshToken,
    };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  public async logout(@CurrentUser() user: JwtUserPayload): Promise<void> {
    const result = await this.deleteSession.execute({
      sessionId: user.sessionId,
    });

    if (isLeft(result)) {
      // Session already deleted or not found — still return 204
    }
  }
}
