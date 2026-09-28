import { describe, expect, it } from 'vitest';
import { ApiError, ApiUnreachableError, ToolError, toErrorPayload } from './errors.js';

describe('toErrorPayload', () => {
  it('maps a ToolError to its own code/message/next', () => {
    const err = new ToolError('agent_not_found', 'No agent "foo".', 'Call list_agents and pass one of the returned names or ids.');
    expect(toErrorPayload(err, 'http://127.0.0.1:3001')).toEqual({
      error: 'agent_not_found',
      message: 'No agent "foo".',
      next: 'Call list_agents and pass one of the returned names or ids.',
    });
  });

  it('maps ApiUnreachableError with the api url and the dev.sh next step', () => {
    const err = new ApiUnreachableError('http://127.0.0.1:3001');
    const payload = toErrorPayload(err, 'http://127.0.0.1:3001');
    expect(payload.error).toBe('api_unreachable');
    expect(payload.message).toBe('DevDigest API not reachable at http://127.0.0.1:3001.');
    expect(payload.next).toContain('./scripts/dev.sh');
  });

  it('maps a 429 ApiError to rate_limited', () => {
    const err = new ApiError(429, 'rate_limited', 'Too many requests');
    const payload = toErrorPayload(err, 'http://127.0.0.1:3001');
    expect(payload.error).toBe('rate_limited');
    expect(payload.next).toContain('10 review starts per minute');
  });

  it('maps other ApiError statuses to api_error with status/code/message', () => {
    const err = new ApiError(500, 'internal', 'boom');
    const payload = toErrorPayload(err, 'http://127.0.0.1:3001');
    expect(payload.error).toBe('api_error');
    expect(payload.message).toBe('DevDigest API error 500 internal: boom');
    expect(payload.next).toContain('Check the DevDigest API log');
  });

  it('clips a long ApiError message to 200 chars', () => {
    const long = 'x'.repeat(500);
    const err = new ApiError(502, 'bad_response', long);
    const payload = toErrorPayload(err, 'http://127.0.0.1:3001');
    expect(payload.message.length).toBeLessThan(250);
  });

  it('maps an unknown thrown value to a generic internal api_error', () => {
    const payload = toErrorPayload(new Error('anything else'), 'http://127.0.0.1:3001');
    expect(payload).toEqual({
      error: 'api_error',
      message: 'Internal error in devdigest-mcp.',
      next: 'Retry once; see the MCP server stderr log.',
    });
  });
});
