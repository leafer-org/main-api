import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { GetMeInteractor } from '../../application/use-cases/me/get-me.interactor.js';
import { CreateOtpInteractor } from '../../application/use-cases/otp-flow/create-otp.interactor.js';
import { RegisterInteractor } from '../../application/use-cases/otp-flow/register.interactor.js';
import { VerifyOtpInteractor } from '../../application/use-cases/otp-flow/verify-otp.interactor.js';
import { DeleteSessionInteractor } from '../../application/use-cases/session/delete-session.interactor.js';
import { RotateSessionInteractor } from '../../application/use-cases/session/rotate-session.interactor.js';
import { resolveAvatarUrls } from './avatar-url.helper.js';
import { CurrentUser } from '@/infra/auth/authn/current-user.decorator.js';
import type { JwtUserPayload } from '@/infra/auth/authn/jwt-user-payload.js';
import { Public } from '@/infra/auth/authn/public.decorator.js';
import { domainToHttpError } from '@/infra/contracts/api-error.js';
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

  @Public()
  @Post('request-otp')
  @HttpCode(200)
  public async requestOtp(
    @Body() body: PublicBody['requestOtp'],
    @Req() req: Request,
  ): Promise<PublicResponse['requestOtp']> {
    const result = await this.createOtp.execute({
      phoneNumber: body.phoneNumber,
      ip: req.ip ?? '',
    });

    if (isLeft(result)) {
      throw domainToHttpError<'requestOtp'>(result.error.toResponse());
    }

    return {};
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(200)
  public async verifyOtpEndpoint(
    @Body() body: PublicBody['verifyOtp'],
    @Req() req: Request,
  ): Promise<PublicResponse['verifyOtp']> {
    const ip = req.ip;
    const result = await this.verifyOtp.execute({
      phoneNumber: body.phoneNumber,
      code: body.code,
      ip,
      userAgent: req.get('user-agent'),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'verifyOtp'>(result.error.toResponse());
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

  @Public()
  @Get('refresh')
  public async refresh(
    @Headers('x-refresh-token') refreshToken: string,
    @Req() req: Request,
  ): Promise<PublicResponse['refresh']> {
    if (!refreshToken) {
      throw domainToHttpError<'refresh'>({
        401: { type: 'missing_refresh_token', isDomain: true },
      });
    }

    try {
      const result = await this.rotateSession.execute({
        refreshToken,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      if (isLeft(result)) {
        throw domainToHttpError<'refresh'>(result.error.toResponse());
      }

      return {
        accessToken: result.value.accessToken as string,
        refreshToken: result.value.refreshToken as string,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw domainToHttpError<'refresh'>({ 401: { type: 'invalid_token', isDomain: true } });
    }
  }

  @Public()
  @Post('complete-profile')
  @HttpCode(200)
  public async completeProfile(
    @Body() body: PublicBody['completeProfile'],
    @Req() req: Request,
  ): Promise<PublicResponse['completeProfile']> {
    const result = await this.register.execute({
      registrationSessionId: body.registrationSessionId,
      fullName: body.fullName,
      avatarId: body.avatarId,
      cityId: body.cityId,
      lat: body.lat,
      lng: body.lng,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (isLeft(result)) {
      throw domainToHttpError<'completeProfile'>(result.error.toResponse());
    }

    const { accessToken, refreshToken, userId, sessionId } = result.value;

    const meResult = await this.getMe.execute({ userId, sessionId });
    if (isLeft(meResult)) {
      throw domainToHttpError<'completeProfile'>(meResult.error.toResponse());
    }

    const me = meResult.value;
    const avatar = await resolveAvatarUrls(this.mediaService, me.avatarId);

    return {
      user: {
        id: me.userId,
        phoneNumber: me.phoneNumber,
        fullName: me.fullName,
        avatar,
        cityId: me.cityId,
        lat: me.lat,
        lng: me.lng,
        createdAt: me.createdAt.toISOString(),
        updatedAt: me.updatedAt.toISOString(),
      },
      accessToken,
      refreshToken,
    };
  }

  @Post('logout')
  @HttpCode(204)
  public async logout(@CurrentUser() user: JwtUserPayload): Promise<void> {
    const result = await this.deleteSession.execute({
      sessionId: user.sessionId,
    });

    if (isLeft(result)) {
      // Session already deleted or not found — still return 204
    }
  }
}
