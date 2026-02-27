export { AccessToken, RefreshToken, type TokenPair } from '../../vo/tokens.js';

export interface RefreshTokenPayload {
  sessionId: string;
  userId: string;
  type: 'refresh';
}
