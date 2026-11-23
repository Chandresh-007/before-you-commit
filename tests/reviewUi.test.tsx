
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { executeScenarioPreview } from '../src/engine/sqlEngine';
import { getScenarioById } from '../src/scenarios';
import { DiffTable } from '../src/components/DiffTable';
import { StatusBanner } from '../src/components/StatusBanner';
import { bookingTime } from '../src/components/bookingDisplay';

const scenario = getScenarioById('scenario-bedrock-student-scope-mwrs6sns')!;
const exercise = scenario.exercises![0];
const reviewer = exercise.reviewerDefaultPreset;
describe('Review evidence from real SQLite results', () => {
  it('identifies every unintended booking with its own time and status', async () => {
    const second = { ...reviewer, registration_id: 189, event_name: 'Custom interview', session_date: '2024-11-25 16:00', status: 'confirmed' };
    const report = await executeScenarioPreview({ scenario, sql: exercise.starterSql, reviewerRows: [reviewer, second] });
    const html = renderToStaticMarkup(<StatusBanner report={report} error={null} scenario={scenario} projectorMode={false} reviewerRowsCount={2} />);
    expect(html).toContain('3 registrations changed · 2 outside the ticket');
    expect(html).toContain('2:00 PM');
    expect(html).toContain('4:00 PM');
    expect(html).toContain('confirmed');
    expect(html).toContain('Facebook Interview');
  });
  it('keeps preserved reviewer bookings outside collapsed unchanged records', async () => {
    const report = await executeScenarioPreview({ scenario, sql: exercise.solutionSql, reviewerRows: [reviewer] });
    const html = renderToStaticMarkup(<DiffTable report={report} scenario={scenario} reviewerRowsCount={1} reviewerRows={[reviewer]} projectorMode={false} />);
    const visible = html.split('<details')[0];
    expect(visible).toContain('Facebook Interview');
    expect(visible).toContain('Preserved');
    expect(visible).toContain('scheduled');
    expect(html).toContain('Show 4 unchanged records');
  });
  it('shows missed targets and wrong values instead of claiming a pass', async () => {
    for (const [sql, message] of [
      ["UPDATE registrations SET status = 'cancelled' WHERE registration_id = -1", '0 registrations changed'],
      ["UPDATE registrations SET status = 'completed' WHERE registration_id = 204", 'unexpected status'],
    ]) {
      const report = await executeScenarioPreview({ scenario, sql, reviewerRows: [] });
      const html = renderToStaticMarkup(<StatusBanner report={report} error={null} scenario={scenario} projectorMode={false} />);
      expect(html).toContain(message);
      expect(html).not.toContain('Passed on');
    }
  });
  it('marks evidence from an earlier query as stale', async () => {
    const report = await executeScenarioPreview({ scenario, sql: exercise.starterSql, reviewerRows: [] });
    const html = renderToStaticMarkup(<StatusBanner report={report} error={null} scenario={scenario} projectorMode={false} isStale />);
    expect(html).toContain('Query edited');
    expect(html).toContain('previous SQL');
  });
  it('renders accurate session scope explanation for Rohan and Divya without mentioning student ID', async () => {
    const rohanScenario = getScenarioById('scenario-placement-drive-rohan')!;
    const sessionEx = rohanScenario.exercises!.find((e) => e.id === 'session-scope')!;
    const divyaPreset = sessionEx.reviewerDefaultPreset;
    const report = await executeScenarioPreview({
      scenario: rohanScenario,
      sql: sessionEx.starterSql,
      reviewerRows: [divyaPreset],
    });
    const html = renderToStaticMarkup(
      <StatusBanner report={report} error={null} scenario={rohanScenario} projectorMode={false} reviewerRowsCount={1} />
    );
    expect(html).toContain('Rohan’s #204 and Divya Sharma’s #209 belong to different students');
    expect(html).toContain('share the same Google Interview event and time');
    expect(html).not.toContain('Both bookings belong to');
  });
  it('does not shift scenario dates through the host timezone', () => {
    expect(bookingTime('2024-11-25 14:00')).toBe('2:00 PM · 2024-11-25');
    expect(bookingTime('2024-11-25')).toBe('2024-11-25');
  });
});
