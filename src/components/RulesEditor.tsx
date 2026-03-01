import { useState } from 'react';
import type { PreprocessingRule, ExportType } from '@/core/types';

interface RulesEditorProps {
  rules: PreprocessingRule[];
  onChange: (rules: PreprocessingRule[]) => void;
  exportType: ExportType;
}

interface KeyValuePair {
  key: string;
  value: string;
}

function toKeyValuePairs(record: Record<string, string>): KeyValuePair[] {
  const entries = Object.entries(record);
  return entries.length > 0 ? entries.map(([key, value]) => ({ key, value })) : [{ key: '', value: '' }];
}

function fromKeyValuePairs(pairs: KeyValuePair[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const k = pair.key.trim();
    if (k) result[k] = pair.value;
  }
  return result;
}

interface RuleFormState {
  matchPairs: KeyValuePair[];
  action: 'set' | 'append';
  changesPairs: KeyValuePair[];
}

function emptyFormState(): RuleFormState {
  return {
    matchPairs: [{ key: '', value: '' }],
    action: 'set',
    changesPairs: [{ key: '', value: '' }],
  };
}

function formStateFromRule(rule: PreprocessingRule): RuleFormState {
  return {
    matchPairs: toKeyValuePairs(rule.match),
    action: rule.action,
    changesPairs: toKeyValuePairs(rule.changes),
  };
}

// --- Sub-components ---

function KeyValueEditor({
  label,
  keyPlaceholder,
  valuePlaceholder,
  pairs,
  onChange,
}: {
  label: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
}) {
  const updatePair = (index: number, field: 'key' | 'value', val: string) => {
    const updated = pairs.map((p, i) => (i === index ? { ...p, [field]: val } : p));
    onChange(updated);
  };

  const addPair = () => onChange([...pairs, { key: '', value: '' }]);

  const removePair = (index: number) => {
    if (pairs.length <= 1) return;
    onChange(pairs.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="space-y-2">
        {pairs.map((pair, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={pair.key}
              onChange={(e) => updatePair(i, 'key', e.target.value)}
              placeholder={keyPlaceholder}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={pair.value}
              onChange={(e) => updatePair(i, 'value', e.target.value)}
              placeholder={valuePlaceholder}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removePair(i)}
              disabled={pairs.length <= 1}
              className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-sm px-1"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addPair}
        className="mt-1 text-xs text-blue-600 hover:text-blue-800"
      >
        + Add condition
      </button>
    </div>
  );
}

function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: RuleFormState;
  onSave: (state: RuleFormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<RuleFormState>(initial);

  const isValid =
    form.matchPairs.some((p) => p.key.trim() && p.value.trim()) &&
    form.changesPairs.some((p) => p.key.trim());

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <KeyValueEditor
        label="Match Conditions (column name / regex pattern)"
        keyPlaceholder="Column name"
        valuePlaceholder="Regex pattern"
        pairs={form.matchPairs}
        onChange={(matchPairs) => setForm((f) => ({ ...f, matchPairs }))}
      />

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
        <select
          value={form.action}
          onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as 'set' | 'append' }))}
          className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="set">Set</option>
          <option value="append">Append</option>
        </select>
      </div>

      <KeyValueEditor
        label="Changes (column name / value)"
        keyPlaceholder="Column name"
        valuePlaceholder="Value"
        pairs={form.changesPairs}
        onChange={(changesPairs) => setForm((f) => ({ ...f, changesPairs }))}
      />

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={!isValid}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Rule
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  onEdit,
  onDelete,
}: {
  rule: PreprocessingRule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1 text-sm">
          <div>
            <span className="font-medium text-gray-500">Match:</span>{' '}
            {Object.entries(rule.match).map(([col, pattern], i) => (
              <span key={i}>
                {i > 0 && <span className="text-gray-400"> AND </span>}
                <code className="rounded bg-gray-100 px-1 text-xs">{col}</code>
                <span className="text-gray-400"> ~ </span>
                <code className="rounded bg-gray-100 px-1 text-xs">{pattern}</code>
              </span>
            ))}
          </div>
          <div>
            <span className="font-medium text-gray-500">Action:</span>{' '}
            <span className="inline-block rounded bg-blue-100 px-1.5 text-xs font-medium text-blue-700">
              {rule.action}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Changes:</span>{' '}
            {Object.entries(rule.changes).map(([col, val], i) => (
              <span key={i}>
                {i > 0 && <span className="text-gray-400">, </span>}
                <code className="rounded bg-gray-100 px-1 text-xs">{col}</code>
                <span className="text-gray-400"> = </span>
                <code className="rounded bg-gray-100 px-1 text-xs">{val}</code>
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---

export default function RulesEditor({ rules, onChange, exportType: _exportType }: RulesEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = (formState: RuleFormState) => {
    const newRule: PreprocessingRule = {
      id: crypto.randomUUID(),
      match: fromKeyValuePairs(formState.matchPairs),
      action: formState.action,
      changes: fromKeyValuePairs(formState.changesPairs),
    };
    onChange([...rules, newRule]);
    setIsAdding(false);
  };

  const handleEdit = (id: string, formState: RuleFormState) => {
    onChange(
      rules.map((r) =>
        r.id === id
          ? {
              ...r,
              match: fromKeyValuePairs(formState.matchPairs),
              action: formState.action,
              changes: fromKeyValuePairs(formState.changesPairs),
            }
          : r,
      ),
    );
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      {rules.length === 0 && !isAdding && (
        <p className="text-sm text-gray-400 italic">No preprocessing rules configured.</p>
      )}

      {rules.map((rule) =>
        editingId === rule.id ? (
          <RuleForm
            key={rule.id}
            initial={formStateFromRule(rule)}
            onSave={(state) => handleEdit(rule.id, state)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <RuleCard
            key={rule.id}
            rule={rule}
            onEdit={() => {
              setEditingId(rule.id);
              setIsAdding(false);
            }}
            onDelete={() => handleDelete(rule.id)}
          />
        ),
      )}

      {isAdding ? (
        <RuleForm
          initial={emptyFormState()}
          onSave={handleAdd}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
          }}
          className="rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
        >
          + Add Rule
        </button>
      )}
    </div>
  );
}
