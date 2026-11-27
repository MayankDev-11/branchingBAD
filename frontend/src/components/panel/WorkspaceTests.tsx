import { useEffect, useId, useRef, useState } from 'react';
import { ClipboardList, Lock } from 'lucide-react';
import { api } from '../../api';
import type { BranchDetailResponse, WorkspaceTest, WorkspaceTestCheckIn, WorkspaceTestProtocol } from '../../types';

const primaryButton = 'rounded-lg bg-branchOpen px-3 py-2 text-xs font-semibold text-bg disabled:opacity-40';
const secondaryButton = 'rounded-lg border border-border bg-s2 px-3 py-2 text-xs font-medium text-t1 disabled:opacity-40';

const statuses = {
  supported: 'Pattern observed',
  weakened: 'Opposite pattern observed',
  inconclusive: 'Inconclusive',
};

function YesNoField({ question, value, onChange, disabled }: {
  question: string;
  value: boolean | null;
  onChange: (answer: boolean) => void;
  disabled: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="space-y-1.5 text-xs text-t1">
      <legend className="font-medium">{question}</legend>
      <div className="flex gap-2">
        {[true, false].map((answer) => (
          <label key={String(answer)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-s2 px-2.5 py-1.5">
            <input
              type="radio"
              name={name}
              checked={value === answer}
              onChange={() => onChange(answer)}
              required
              className="accent-branchOpen"
            />
            {answer ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckInForm({ test, pending, onSave }: {
  test: WorkspaceTest;
  pending: boolean;
  onSave: (checkIn: WorkspaceTestCheckIn) => void;
}) {
  const [date, setDate] = useState(test.latest_date);
  const [exposed, setExposed] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<boolean | null>(null);
  const recorded = test.check_ins.some((entry) => entry.date === date);

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (exposed !== null && outcome !== null && !recorded) onSave({ date, exposed, outcome });
      }}
    >
      <label className="block space-y-1.5 text-xs font-medium text-t1">
        <span className="block">Observation date</span>
        <input
          type="date"
          className="rounded-md border border-border bg-s2 px-2.5 py-1.5 text-xs text-t1"
          value={date}
          min={test.start_date}
          max={test.latest_date}
          onChange={(event) => {
            setDate(event.target.value);
            setExposed(null);
            setOutcome(null);
          }}
          required
          disabled={pending}
        />
      </label>
      {recorded ? (
        <p role="status" className="text-xs text-t2">An observation is already saved for this date.</p>
      ) : (
        <>
          <YesNoField question={test.factor_question} value={exposed} onChange={setExposed} disabled={pending} />
          <YesNoField question={test.outcome_question} value={outcome} onChange={setOutcome} disabled={pending} />
          <p className="text-xs text-t2">Save one observation per date. Saved observations are locked.</p>
          <button className={primaryButton} disabled={pending || !date || exposed === null || outcome === null}>
            Save daily observation
          </button>
        </>
      )}
    </form>
  );
}

function TestProgress({ test }: { test: WorkspaceTest }) {
  const { counts, result } = test;
  return (
    <div className="space-y-2 text-xs text-t2">
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-bg p-2.5 text-center">
        <div>
          <dt>Days logged</dt>
          <dd className="mt-0.5 font-semibold text-t1">{test.check_ins.length}</dd>
        </div>
        <div>
          <dt>With factor</dt>
          <dd className="mt-0.5 font-semibold text-t1">{counts.exposed_days}</dd>
        </div>
        <div>
          <dt>Without factor</dt>
          <dd className="mt-0.5 font-semibold text-t1">{counts.unexposed_days}</dd>
        </div>
      </dl>
      {result ? (
        <div className="space-y-1 rounded-lg border border-border bg-bg p-2.5">
          <p className="font-semibold text-t1">{statuses[result.direction]}</p>
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt>Outcome with factor</dt>
              <dd className="font-medium text-t1">{counts.exposed_outcomes}/{counts.exposed_days} · {result.exposed_rate}%</dd>
            </div>
            <div>
              <dt>Outcome without factor</dt>
              <dd className="font-medium text-t1">{counts.unexposed_outcomes}/{counts.unexposed_days} · {result.unexposed_rate}%</dd>
            </div>
          </dl>
          <p>{result.summary}</p>
        </div>
      ) : test.status === 'active' && (
        <p className="leading-relaxed">
          {test.can_finish
            ? 'You have enough observations to evaluate this test.'
            : `Log at least ${test.minimum_days} days, including ${test.minimum_days_per_group} days in each group.`}
        </p>
      )}
      {test.check_ins.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium text-branchOpen">View daily observations</summary>
          <ul className="mt-1.5 space-y-1">
            {[...test.check_ins].reverse().map((entry) => (
              <li key={entry.date} className="rounded bg-bg px-2 py-1">
                <time dateTime={entry.date}>{entry.date}</time>
                {' · Factor '}{entry.exposed ? 'present' : 'absent'}
                {' · Outcome '}{entry.outcome ? 'occurred' : 'absent'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface WorkspaceTestsProps {
  branch: BranchDetailResponse;
  requestedRank: number | null;
  onClearProposal: () => void;
}

export function WorkspaceTests({ branch, requestedRank, onClearProposal }: WorkspaceTestsProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const [tests, setTests] = useState<WorkspaceTest[] | null>(null);
  const [protocol, setProtocol] = useState<WorkspaceTestProtocol | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const open = branch.status === 'open';

  useEffect(() => {
    let current = true;
    void Promise.all([
      api.getWorkspaceTests(branch.id),
      open ? api.getWorkspaceTestProtocol(branch.id) : Promise.resolve(null),
    ]).then(([items, protocol]) => {
      if (current) {
        setTests(items);
        setProtocol(protocol);
      }
    }).catch((error) => {
      if (current) setLoadError(error instanceof Error ? error.message : 'Could not load tests.');
    });
    return () => { current = false; };
  }, [branch.id, branch.hypotheses, open, retry]);

  useEffect(() => {
    if (requestedRank !== null) heading.current?.focus();
  }, [requestedRank]);

  const active = tests?.find((test) => test.status === 'active');
  const proposed = open && !active ? protocol?.proposals.find((item) => item.rank === requestedRank) : undefined;

  const updateTest = async (request: () => Promise<WorkspaceTest>, success: string) => {
    setPending(true);
    setActionError('');
    setFeedback('');
    try {
      const updated = await request();
      setTests((items) => [updated, ...(items ?? []).filter((item) => item.id !== updated.id)]);
      setFeedback(success);
      setConfirmCancel(false);
      onClearProposal();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update the test.');
    } finally {
      setPending(false);
    }
  };

  if (!open && tests?.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-border bg-s2 p-3.5">
      <h3 ref={heading} id={headingId} tabIndex={-1} className="flex items-center gap-2 text-sm font-semibold text-t1">
        <ClipboardList aria-hidden="true" className="h-4 w-4 text-branchOpen" />
        Investigation tests
      </h3>
      {loadError && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-change">{loadError}</p>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setLoadError('');
              setRetry((attempt) => attempt + 1);
            }}
          >
            Retry loading tests
          </button>
        </div>
      )}
      {tests === null && !loadError && <p role="status" className="text-xs text-t2">Loading tests…</p>}
      {actionError && <p role="alert" className="text-xs text-change">{actionError}</p>}
      {feedback && <p role="status" className="text-xs text-ok">{feedback}</p>}
      {tests !== null && !active && open && requestedRank === null && !!protocol?.proposals.length && (
        <p className="text-xs text-t2">Open a hypothesis to review and start its proposed test.</p>
      )}
      {tests !== null && !active && open && protocol && !proposed && (requestedRank !== null || !protocol.proposals.length) && (
        <p className="text-xs leading-relaxed text-t2">
          {requestedRank !== null
            ? 'This hypothesis needs a measurable factor and outcome before you can start a test.'
            : 'A measurable factor and outcome are needed to start a test.'}
        </p>
      )}
      {tests !== null && protocol && proposed && (
        <div className="space-y-2 rounded-lg border border-border bg-bg p-3">
          <h4 className="text-xs font-semibold text-t1">{proposed.factor}</h4>
          <p className="whitespace-pre-line text-xs leading-relaxed text-t2">{proposed.plan}</p>
          <div className="space-y-0.5 text-xs text-t1">
            <p>{proposed.factor_question}</p>
            <p>{proposed.outcome_question}</p>
          </div>
          <p className="text-xs leading-relaxed text-t2">
            Log at least {protocol.minimum_days} days, including {protocol.minimum_days_per_group} days with the factor and {protocol.minimum_days_per_group} days without it.
            The test compares outcome rates. A difference smaller than {protocol.threshold_points} percentage points is inconclusive.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={pending}
              onClick={() => void updateTest(() => api.startWorkspaceTest(branch.id, proposed.rank, proposed.factor), 'Test started.')}
            >
              Start and lock test
            </button>
            <button type="button" className={secondaryButton} disabled={pending} onClick={onClearProposal}>Back</button>
          </div>
        </div>
      )}
      {active && (
        <div className="space-y-3">
          {requestedRank !== null && requestedRank !== active.rank && open && (
            <p className="text-xs text-t2">Finish or end the current test before starting another one.</p>
          )}
          <div>
            <h4 className="text-sm font-semibold text-t1">{active.factor}</h4>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-branchOpen">
              <Lock aria-hidden="true" className="h-3 w-3" />
              {open ? 'Plan locked' : 'Branch closed'} · Started {active.start_date}
            </p>
          </div>
          <details className="rounded-lg border border-border bg-bg p-2.5 text-xs text-t2">
            <summary className="cursor-pointer font-medium text-t1">Locked plan and scoring rule</summary>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{active.plan}</p>
            <p className="mt-2 leading-relaxed">
              The outcome rate is compared across days with and without the factor. A difference smaller than {active.threshold_points} percentage points is inconclusive.
            </p>
          </details>
          <TestProgress test={active} />
          {open && (
            <>
              <CheckInForm
                key={`${active.id}-${active.check_ins.length}`}
                test={active}
                pending={pending}
                onSave={(entry) => void updateTest(() => api.saveWorkspaceTestCheckIn(branch.id, active.id, entry), 'Daily observation saved.')}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primaryButton}
                  disabled={pending || !active.can_finish}
                  onClick={() => void updateTest(() => api.finishWorkspaceTest(branch.id, active.id), 'Test result saved.')}
                >
                  Evaluate test
                </button>
                {!confirmCancel && (
                  <button type="button" className={secondaryButton} disabled={pending} onClick={() => setConfirmCancel(true)}>
                    End test early
                  </button>
                )}
              </div>
              {confirmCancel && (
                <div className="space-y-2 rounded-lg border border-border bg-bg p-2.5 text-xs text-t2">
                  <p>Saved observations will stay in the test history. You can start a new test afterward.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={pending}
                      onClick={() => void updateTest(() => api.cancelWorkspaceTest(branch.id, active.id), 'Test ended early.')}
                    >
                      Confirm end test
                    </button>
                    <button type="button" className={secondaryButton} disabled={pending} onClick={() => setConfirmCancel(false)}>
                      Keep testing
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {tests?.filter((test) => test.status !== 'active').map((test) => (
        <details key={test.id} className="space-y-2 rounded-lg border border-border p-2.5" open={test.id === tests[0].id}>
          <summary className="cursor-pointer text-xs font-semibold text-t1">
            {test.factor} · {test.result ? statuses[test.result.direction] : 'Ended early'}
          </summary>
          <p className="text-xs text-t2">{test.start_date} to {test.finished_date}</p>
          <TestProgress test={test} />
        </details>
      ))}
    </section>
  );
}
