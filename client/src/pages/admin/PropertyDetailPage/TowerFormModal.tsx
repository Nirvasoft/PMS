import { useState, useEffect } from 'react';
import {
  useCreateTowerMutation, useUpdateTowerMutation, useDeleteTowerMutation,
  useAddSectionMutation, useUpdateSectionMutation, useDeleteSectionMutation,
} from '../../../store/api/unitsApi';
import type { Tower, TowerSection } from '../../../store/api/unitsApi';
import { X, Plus, Trash2, Building2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import './TowerFormModal.css';

interface Props {
  propertyId: string;
  tower?: Tower | null;     // null = create mode
  onClose: () => void;
}

/** Unsaved section (before tower is created) or existing section with id */
interface SectionDraft {
  _key: string;              // local key for React reconciliation
  id?: string;               // exists only for persisted sections
  name: string;
  code: string;
}

let sectionKeyCounter = 0;
function nextSectionKey() { return `sec_${++sectionKeyCounter}`; }

export function TowerFormModal({ propertyId, tower, onClose }: Props) {
  const isEdit = !!tower;

  // ── Form state ──────────────────────────────
  const [name, setName] = useState(tower?.name ?? '');
  const [code, setCode] = useState(tower?.code ?? '');
  const [totalFloors, setTotalFloors] = useState(tower?.totalFloors?.toString() ?? '');
  const [yearBuilt, setYearBuilt] = useState(tower?.yearBuilt?.toString() ?? '');
  const [description, setDescription] = useState(tower?.description ?? '');

  // Sections draft
  const [sections, setSections] = useState<SectionDraft[]>(
    tower?.sections?.map((s) => ({ _key: nextSectionKey(), id: s.id, name: s.name, code: s.code ?? '' })) ?? []
  );

  // Track original section values for dirty detection
  const [originalSections] = useState<Map<string, { name: string; code: string }>>(
    () => new Map(
      (tower?.sections ?? []).map((s) => [s.id, { name: s.name, code: s.code ?? '' }])
    )
  );

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Track which existing sections were removed (for delete calls)
  const [removedSectionIds, setRemovedSectionIds] = useState<string[]>([]);

  // ── Mutations ───────────────────────────────
  const [createTower, { isLoading: creating }] = useCreateTowerMutation();
  const [updateTower, { isLoading: updating }] = useUpdateTowerMutation();
  const [deleteTower, { isLoading: deleting }] = useDeleteTowerMutation();
  const [addSection] = useAddSectionMutation();
  const [updateSectionMut] = useUpdateSectionMutation();
  const [deleteSection] = useDeleteSectionMutation();

  const isBusy = creating || updating || deleting;

  // ── Section helpers ─────────────────────────
  const handleAddSection = () => {
    setSections((prev) => [...prev, { _key: nextSectionKey(), name: '', code: '' }]);
  };

  const handleRemoveSection = (sec: SectionDraft) => {
    setSections((prev) => prev.filter((s) => s._key !== sec._key));
    if (sec.id) setRemovedSectionIds((prev) => [...prev, sec.id!]);
  };

  const updateSectionField = (key: string, field: 'name' | 'code', value: string) => {
    setSections((prev) => prev.map((s) => s._key === key ? { ...s, [field]: value } : s));
  };

  // ── Submit ──────────────────────────────────
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Tower name is required');
      return;
    }

    try {
      if (isEdit) {
        // 1. Update tower fields
        await updateTower({
          propertyId,
          towerId: tower!.id,
          data: {
            name: name.trim(),
            code: code.trim() || null,
            totalFloors: totalFloors ? parseInt(totalFloors) : null,
            yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
            description: description.trim() || null,
          },
        }).unwrap();

        // 2. Delete removed sections
        for (const sectionId of removedSectionIds) {
          try {
            await deleteSection({ propertyId, towerId: tower!.id, sectionId }).unwrap();
          } catch {
            // Section may already be gone — ignore
          }
        }

        // 3. Update existing sections that changed
        const existingSections = sections.filter((s) => s.id && s.name.trim());
        for (const sec of existingSections) {
          const orig = originalSections.get(sec.id!);
          if (orig && (orig.name !== sec.name.trim() || orig.code !== sec.code.trim())) {
            try {
              await updateSectionMut({
                propertyId,
                towerId: tower!.id,
                sectionId: sec.id!,
                data: { name: sec.name.trim(), code: sec.code.trim() || undefined },
              }).unwrap();
            } catch {
              // Non-critical — continue
            }
          }
        }

        // 4. Add new sections (those without id)
        const newSections = sections.filter((s) => !s.id && s.name.trim());
        for (const sec of newSections) {
          await addSection({
            propertyId,
            towerId: tower!.id,
            data: { name: sec.name.trim(), code: sec.code.trim() || undefined },
          }).unwrap();
        }

        toast.success(`"${name}" updated`);
      } else {
        // Create tower with sections
        const validSections = sections
          .filter((s) => s.name.trim())
          .map((s) => ({ name: s.name.trim(), code: s.code.trim() || undefined }));

        await createTower({
          propertyId,
          data: {
            name: name.trim(),
            code: code.trim() || undefined,
            totalFloors: totalFloors ? parseInt(totalFloors) : undefined,
            yearBuilt: yearBuilt ? parseInt(yearBuilt) : undefined,
            description: description.trim() || undefined,
            sections: validSections.length > 0 ? validSections : undefined,
          },
        }).unwrap();

        toast.success(`"${name}" created`);
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} tower`);
    }
  };

  // ── Delete ──────────────────────────────────
  const handleDelete = async () => {
    try {
      await deleteTower({ propertyId, towerId: tower!.id }).unwrap();
      toast.success(`"${tower!.name}" deleted`);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || 'Cannot delete tower');
    }
  };

  return (
    <div className="tw-overlay" onClick={onClose}>
      <div className="tw-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tw-header">
          <div className="tw-header-left">
            <h3>{isEdit ? 'Edit Tower' : 'Add Tower / Block'}</h3>
            <p className="tw-header-sub">
              {isEdit
                ? `Editing "${tower!.name}"`
                : 'Define a tower or block within this property'}
            </p>
          </div>
          <button className="tw-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="tw-body">
          {/* Tower details */}
          <div className="tw-section-title">Tower Details</div>
          <div className="tw-grid">
            <div className="tw-field">
              <label>Name *</label>
              <input
                placeholder="e.g. Tower A, Block 1, Wing East"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="tw-field">
              <label>Code <span className="tw-opt">(optional)</span></label>
              <input
                placeholder="e.g. TWR-A"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          <div className="tw-grid tw-grid-3">
            <div className="tw-field">
              <label>Total Floors</label>
              <input
                type="number"
                min={0}
                max={200}
                placeholder="e.g. 30"
                value={totalFloors}
                onChange={(e) => setTotalFloors(e.target.value)}
              />
            </div>
            <div className="tw-field">
              <label>Year Built</label>
              <input
                type="number"
                min={1900}
                max={2030}
                placeholder="e.g. 2020"
                value={yearBuilt}
                onChange={(e) => setYearBuilt(e.target.value)}
              />
            </div>
            <div /> {/* spacer */}
          </div>

          <div className="tw-field">
            <label>Description <span className="tw-opt">(optional)</span></label>
            <textarea
              rows={2}
              placeholder="Any notes about this tower…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Sections / Wings */}
          <div className="tw-sections-header">
            <span>Sections / Wings</span>
            <button className="tw-add-section-btn" onClick={handleAddSection}>
              <Plus size={11} /> Add Section
            </button>
          </div>

          <div className="tw-section-list">
            {sections.length === 0 ? (
              <div className="tw-section-empty">
                No sections — optional grouping within the tower
              </div>
            ) : (
              sections.map((sec) => (
                <div key={sec._key} className="tw-section-row">
                  <input
                    placeholder="Section name (e.g. Wing A)"
                    value={sec.name}
                    onChange={(e) => updateSectionField(sec._key, 'name', e.target.value)}
                  />
                  <input
                    className="code-input"
                    placeholder="Code"
                    value={sec.code}
                    maxLength={20}
                    onChange={(e) => updateSectionField(sec._key, 'code', e.target.value)}
                  />
                  {sec.id && <span className="tw-section-badge">saved</span>}
                  <button className="tw-section-del" onClick={() => handleRemoveSection(sec)} title="Remove section">
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Delete confirmation */}
          {isEdit && showDeleteConfirm && (
            <div className="tw-delete-confirm">
              <p>
                <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Are you sure? This will permanently delete "{tower!.name}".
                {tower!.unitStats && tower!.unitStats.total > 0 && (
                  <strong> This tower has {tower!.unitStats.total} units — it cannot be deleted.</strong>
                )}
              </p>
              <div className="tw-del-actions">
                <button className="tw-btn-delete" onClick={handleDelete} disabled={deleting || (tower!.unitStats?.total ?? 0) > 0}>
                  <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button className="tw-btn-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="tw-footer">
          <div className="tw-footer-left">
            {isEdit && !showDeleteConfirm && (
              <button className="tw-btn-delete" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
          <div className="tw-footer-right">
            <button className="tw-btn-cancel" onClick={onClose}>Cancel</button>
            <button
              className="tw-btn-submit"
              onClick={handleSubmit}
              disabled={isBusy || !name.trim()}
            >
              {isBusy ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Tower')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
