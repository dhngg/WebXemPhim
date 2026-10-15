import { describe, expect, it } from 'vitest';
import layoutSource from '../layouts/WorkspaceLayout.tsx?raw';
import routerSource from './router.tsx?raw';
import workspacesMockSource from '../mocks/handlers/workspaces.mock.ts?raw';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const files = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('Báo cáo hoãn khỏi V1 (backend chưa có Reports API)', () => {
  it('route /w/:ws/reports chuyển về dashboard của cùng workspace, không render trang nào', () => {
    const router = strip(routerSource);
    expect(router).toMatch(/path: 'reports', element: <Navigate to="\.\.\/dashboard" replace \/>/);
    expect(router).not.toMatch(/ReportsPage|OperationsPages|opsPages/);
  });

  it('menu workspace không còn mục Báo cáo và không có liên kết nào tới /reports', () => {
    expect(strip(layoutSource)).not.toMatch(/Báo cáo|\/reports/);
    const offenders = Object.entries(files)
      .filter(([path, src]) => !path.endsWith('app/router.tsx') && /\$\{base\}\/reports|['"`]\/w\/[^'"`]*\/reports/.test(strip(src)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('không còn code gọi hay mock GET /workspaces/:ws/reports ở đường chạy active', () => {
    expect(strip(workspacesMockSource)).not.toMatch(/reportsMock|ReportsApi|periodRevenue/);
    const offenders = Object.entries(files)
      .filter(([, src]) => /\/reports['"`]|features\/reports|useWorkspaceReport|reportsApi/.test(strip(src)))
      .map(([path]) => path)
      .filter((path) => !path.endsWith('app/router.tsx'));
    expect(offenders).toEqual([]);
  });
});
