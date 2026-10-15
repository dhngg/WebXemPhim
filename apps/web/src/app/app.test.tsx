import { describe, expect, it } from 'vitest';
import { App } from './app';
import { createAppRouter, routes } from './router';

type RouteLike = { path?: string; children?: RouteLike[] };

function collectPaths(list: RouteLike[], acc: string[] = []): string[] {
  for (const route of list) {
    if (route.path) acc.push(route.path);
    if (route.children) collectPaths(route.children, acc);
  }
  return acc;
}

describe('app shell', () => {
  it('exports the root component and builds the router without throwing', () => {
    expect(typeof App).toBe('function');
    expect(createAppRouter()).toBeTruthy();
  });

  it('keeps the public, auth, workspace, tenant and admin route trees', () => {
    const paths = collectPaths(routes as RouteLike[]);
    for (const expected of [
      'rooms',
      'login',
      'register',
      'forgot-password',
      'reset-password',
      'w/:workspaceId',
      'tenant',
      'admin',
    ]) {
      expect(paths).toContain(expected);
    }
  });
});
