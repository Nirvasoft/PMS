import { useState } from 'react';
import type { FormState } from '../../types';

export function ClausesStep({ form, set, libraryClauseList }: { form: FormState; set: Function; libraryClauseList: any[] }) {
  const [customTitle, setCustomTitle] = useState('');
  const [customContent, setCustomContent] = useState('');

  const addLibraryClause = (c: { title: string; content: string }) => {
    if (form.clauses.some((x: any) => x.title === c.title)) return;
    set('clauses', [...form.clauses, { title: c.title, content: c.content }]);
  };

  const addCustom = () => {
    if (!customTitle || !customContent) return;
    set('clauses', [...form.clauses, { title: customTitle, content: customContent }]);
    setCustomTitle(''); setCustomContent('');
  };

  return (
    <div className="step-content">
      <h3>Clauses & Special Conditions</h3>

      {libraryClauseList.length > 0 && (
        <div className="clause-library">
          <div className="cl-label">Clause Library</div>
          {libraryClauseList.map((c: any) => {
            const added = form.clauses.some((x: any) => x.title === c.title);
            return (
              <div key={c.id} className={`lib-clause ${added ? 'added' : ''}`}>
                <div className="lc-info">
                  <span className="lc-title">{c.title}</span>
                  {c.isStandard && <span className="std-badge">Standard</span>}
                </div>
                <button disabled={added} onClick={() => addLibraryClause(c)}>{added ? '✓ Added' : '+ Add'}</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="selected-clauses">
        <div className="cl-label">Selected Clauses ({form.clauses.length})</div>
        {form.clauses.map((c: any, i: number) => (
          <div key={i} className="sel-clause">
            <strong>{c.title}</strong>
            <p>{c.content.slice(0, 120)}{c.content.length > 120 ? '…' : ''}</p>
            <button onClick={() => set('clauses', form.clauses.filter((_: any, j: number) => j !== i))}>✕ Remove</button>
          </div>
        ))}
        {form.clauses.length === 0 && <div className="empty-sm">No clauses selected</div>}
      </div>

      <div className="custom-clause-form">
        <div className="cl-label">Add Custom Clause</div>
        <input placeholder="Clause title" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} />
        <textarea placeholder="Clause content…" rows={3} value={customContent} onChange={(e) => setCustomContent(e.target.value)} />
        <button className="btn-primary-sm" disabled={!customTitle || !customContent} onClick={addCustom}>Add Clause</button>
      </div>

      <div className="form-field" style={{ marginTop: 16 }}>
        <label>Special Conditions</label>
        <textarea placeholder="Any special conditions not covered by clauses…" rows={3} value={form.specialConditions} onChange={(e) => set('specialConditions', e.target.value)} />
      </div>
    </div>
  );
}
