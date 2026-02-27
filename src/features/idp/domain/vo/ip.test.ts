import { describe, expect, it } from 'vitest';

import { InvalidIpError, IpAddress } from './ip.js';
import { Left, Right } from '@/infra/lib/box.js';

describe('IpAddress', () => {
  describe('create', () => {
    it('should accept valid IPv4', () => {
      expect(IpAddress.create('192.168.1.1')).toEqual(Right(IpAddress.raw('192.168.1.1')));
    });

    it('should accept localhost', () => {
      expect(IpAddress.create('127.0.0.1')).toEqual(Right(IpAddress.raw('127.0.0.1')));
    });

    it('should accept zeros', () => {
      expect(IpAddress.create('0.0.0.0')).toEqual(Right(IpAddress.raw('0.0.0.0')));
    });

    it('should accept max valid IPv4', () => {
      expect(IpAddress.create('255.255.255.255')).toEqual(Right(IpAddress.raw('255.255.255.255')));
    });

    it('should reject empty string', () => {
      expect(IpAddress.create('')).toEqual(Left(new InvalidIpError()));
    });

    it('should reject incomplete IP', () => {
      expect(IpAddress.create('192.168.1')).toEqual(Left(new InvalidIpError()));
    });

    it('should reject IP with extra octets', () => {
      expect(IpAddress.create('192.168.1.1.1')).toEqual(Left(new InvalidIpError()));
    });

    it('should reject IP with letters', () => {
      expect(IpAddress.create('192.168.1.abc')).toEqual(Left(new InvalidIpError()));
    });

    it('should reject IP with spaces', () => {
      expect(IpAddress.create('192.168.1. 1')).toEqual(Left(new InvalidIpError()));
    });

    it('should reject random string', () => {
      expect(IpAddress.create('not-an-ip')).toEqual(Left(new InvalidIpError()));
    });
  });

  describe('raw', () => {
    it('should return branded value without validation', () => {
      expect(IpAddress.raw('192.168.1.1')).toBe('192.168.1.1');
    });
  });
});
