import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Project } from '../api';
import { IconCheck, IconArrowRight, IconClose } from '../../components/Icons';

export default function AdminProjects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newMilestone, setNewMilestone] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<string[]>(['']);
  const [details, setDetails] = useState<Record<string, { startDate: string; budget: string; contractor: string }>>(
    {},
  );

  function updateStep(i: number, value: string) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, '']);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function load() {
    api
      .get<{ projects: Project[] }>('/admin/projects')
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/admin/projects', {
        title: form.get('title'),
        category: form.get('category'),
        description: form.get('description') || undefined,
        progressPct: Number(form.get('progressPct') || 0),
        startDate: form.get('startDate') || undefined,
        eta: form.get('eta') || undefined,
        budget: form.get('budget') ? Number(form.get('budget')) : undefined,
        contractor: form.get('contractor') || undefined,
        milestones: steps.map((s) => s.trim()).filter(Boolean),
      });
      (e.target as HTMLFormElement).reset();
      setSteps(['']);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create project.');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateProgress(id: string, progressPct: number) {
    await api.patch(`/admin/projects/${id}`, { progressPct });
    load();
  }

  async function saveDetails(p: Project) {
    const draft = details[p.id];
    if (!draft) return;
    const startDate = draft.startDate.trim();
    const budget = draft.budget.trim();
    const contractor = draft.contractor.trim();
    await api.patch(`/admin/projects/${p.id}`, {
      startDate: startDate || undefined,
      budget: budget ? Number(budget) : undefined,
      contractor: contractor || undefined,
    });
    load();
  }

  async function toggleMilestone(id: string, done: boolean) {
    await api.patch(`/admin/milestones/${id}`, { done: !done });
    load();
  }

  async function addMilestone(projectId: string) {
    const title = newMilestone[projectId]?.trim();
    if (!title) return;
    await api.post(`/admin/projects/${projectId}/milestones`, { title });
    setNewMilestone((prev) => ({ ...prev, [projectId]: '' }));
    load();
  }

  async function deleteProject(id: string) {
    await api.delete(`/admin/projects/${id}`);
    load();
  }

  return (
    <div className="portal-page">
      <p className="eyebrow">Projects</p>
      <h1>Manage Building Projects</h1>

      <form className="portal-request-panel" onSubmit={handleCreate} style={{ marginBottom: 44 }}>
        <div className="portal-inline-form">
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" required />
            </div>
            <div className="form-field">
              <label htmlFor="category">Category</label>
              <input id="category" name="category" placeholder="e.g. Infrastructure" required />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" rows={2} />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="progressPct">Progress (%)</label>
              <input id="progressPct" name="progressPct" type="number" min={0} max={100} defaultValue={0} />
            </div>
            <div className="form-field">
              <label htmlFor="startDate">Start Date</label>
              <input id="startDate" name="startDate" type="date" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="eta">Estimated Completion</label>
              <input id="eta" name="eta" type="date" />
            </div>
            <div className="form-field">
              <label htmlFor="budget">Budget ($)</label>
              <input id="budget" name="budget" type="number" min={0} step="0.01" placeholder="Optional" />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="contractor">Contractor</label>
            <input id="contractor" name="contractor" placeholder="Optional" />
          </div>

          <div className="form-field">
            <label>Milestones / Steps</label>
            <div className="admin-create-steps">
              {steps.map((step, i) => (
                <div key={i} className="admin-create-step-row">
                  <input
                    type="text"
                    placeholder={`Step ${i + 1}`}
                    value={step}
                    onChange={(e) => updateStep(i, e.target.value)}
                  />
                  {steps.length > 1 && (
                    <button type="button" onClick={() => removeStep(i)} aria-label="Remove step">
                      <IconClose size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="admin-add-account-link" onClick={addStep}>
              + Add Step
            </button>
          </div>

          {error && <div className="note-card">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </form>

      <div className="portal-project-cards">
        {projects?.map((p) => (
          <div key={p.id} className="portal-project-card">
            <div className="portal-project-card-body">
              <div className="portal-project-card-top">
                <div>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>
                    {p.category}
                  </p>
                  <h3 style={{ fontSize: 18 }}>{p.title}</h3>
                </div>
                <button
                  className="admin-delete-link"
                  onClick={() => deleteProject(p.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
              {p.description && <p className="portal-project-desc">{p.description}</p>}

              <div className="admin-project-details-row">
                <div className="form-field">
                  <label htmlFor={`startDate-${p.id}`}>Start Date</label>
                  <input
                    id={`startDate-${p.id}`}
                    type="date"
                    value={details[p.id]?.startDate ?? (p.startDate ? p.startDate.slice(0, 10) : '')}
                    onChange={(e) =>
                      setDetails((prev) => ({
                        ...prev,
                        [p.id]: {
                          startDate: e.target.value,
                          budget: prev[p.id]?.budget ?? (p.budget?.toString() ?? ''),
                          contractor: prev[p.id]?.contractor ?? (p.contractor ?? ''),
                        },
                      }))
                    }
                    onBlur={() => saveDetails(p)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`budget-${p.id}`}>Budget ($)</label>
                  <input
                    id={`budget-${p.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={details[p.id]?.budget ?? (p.budget?.toString() ?? '')}
                    onChange={(e) =>
                      setDetails((prev) => ({
                        ...prev,
                        [p.id]: {
                          startDate: prev[p.id]?.startDate ?? (p.startDate ? p.startDate.slice(0, 10) : ''),
                          budget: e.target.value,
                          contractor: prev[p.id]?.contractor ?? (p.contractor ?? ''),
                        },
                      }))
                    }
                    onBlur={() => saveDetails(p)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor={`contractor-${p.id}`}>Contractor</label>
                  <input
                    id={`contractor-${p.id}`}
                    value={details[p.id]?.contractor ?? (p.contractor ?? '')}
                    onChange={(e) =>
                      setDetails((prev) => ({
                        ...prev,
                        [p.id]: {
                          startDate: prev[p.id]?.startDate ?? (p.startDate ? p.startDate.slice(0, 10) : ''),
                          budget: prev[p.id]?.budget ?? (p.budget?.toString() ?? ''),
                          contractor: e.target.value,
                        },
                      }))
                    }
                    onBlur={() => saveDetails(p)}
                  />
                </div>
              </div>

              <div className="admin-progress-control">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={p.progressPct}
                  onChange={(e) => updateProgress(p.id, Number(e.target.value))}
                />
                <span>{p.progressPct}%</span>
              </div>

              {p.milestones && p.milestones.length > 0 && (
                <ul className="portal-milestones">
                  {p.milestones.map((m) => (
                    <li key={m.id} className={m.done ? 'is-done' : ''}>
                      <button
                        type="button"
                        className="portal-milestone-check"
                        onClick={() => toggleMilestone(m.id, m.done)}
                      >
                        {m.done && <IconCheck size={12} />}
                      </button>
                      {m.title}
                    </li>
                  ))}
                </ul>
              )}

              <div className="admin-add-milestone">
                <input
                  type="text"
                  placeholder="Add a milestone…"
                  value={newMilestone[p.id] ?? ''}
                  onChange={(e) => setNewMilestone((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addMilestone(p.id)}
                />
                <button type="button" onClick={() => addMilestone(p.id)}>
                  <IconArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
