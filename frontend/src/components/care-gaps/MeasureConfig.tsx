import { useState } from "react";
import api from "../../lib/api";
import { tokens, fonts } from "../../lib/tokens";
import { Tag } from "../ui/Tag";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Measure {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  stars_weight: number;
  target_rate: number | null;
  star_3_cutpoint: number | null;
  star_4_cutpoint: number | null;
  star_5_cutpoint: number | null;
  is_custom: boolean;
  is_active: boolean;
  detection_logic: Record<string, unknown> | null;
}

interface MeasureConfigProps {
  measures: Measure[];
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Add Custom Measure Form
// ---------------------------------------------------------------------------

function AddMeasureForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    category: "",
    stars_weight: 1,
    target_rate: "",
    star_3_cutpoint: "",
    star_4_cutpoint: "",
    star_5_cutpoint: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/care-gaps/measures", {
        code: form.code,
        name: form.name,
        description: form.description || null,
        category: form.category || null,
        stars_weight: form.stars_weight,
        target_rate: form.target_rate ? parseFloat(form.target_rate) : null,
        star_3_cutpoint: form.star_3_cutpoint ? parseFloat(form.star_3_cutpoint) : null,
        star_4_cutpoint: form.star_4_cutpoint ? parseFloat(form.star_4_cutpoint) : null,
        star_5_cutpoint: form.star_5_cutpoint ? parseFloat(form.star_5_cutpoint) : null,
      });
      setForm({ code: "", name: "", description: "", category: "", stars_weight: 1, target_rate: "", star_3_cutpoint: "", star_4_cutpoint: "", star_5_cutpoint: "" });
      setOpen(false);
      onCreated();
    } catch (err) {
      console.error("Failed to create measure:", err);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[13px] px-4 py-2 rounded-md border transition-colors hover:bg-stone-50"
        style={{ borderColor: tokens.border, color: tokens.textSecondary }}
      >
        + Add Custom Measure
      </button>
    );
  }

  const inputStyle: React.CSSProperties = {
    border: `1px solid ${tokens.border}`,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    fontFamily: fonts.body,
    color: tokens.text,
    background: tokens.surface,
    width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: tokens.textSecondary,
    marginBottom: 2,
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border p-5 mb-4"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="text-[14px] font-semibold mb-4" style={{ fontFamily: fonts.heading, color: tokens.text }}>
        New Custom Measure
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <div style={labelStyle}>Code</div>
          <input
            style={inputStyle}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="CUSTOM-01"
            maxLength={20}
            required
          />
        </div>
        <div className="col-span-2">
          <div style={labelStyle}>Name</div>
          <input
            style={inputStyle}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Measure Name"
            required
          />
        </div>
        <div>
          <div style={labelStyle}>Weight</div>
          <select
            style={inputStyle}
            value={form.stars_weight}
            onChange={(e) => setForm({ ...form, stars_weight: parseInt(e.target.value, 10) || 1 })}
          >
            <option value={1}>1x</option>
            <option value={3}>3x (Triple)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <div style={labelStyle}>Target Rate %</div>
          <input style={inputStyle} type="number" step="0.1" min="0" max="100" value={form.target_rate} onChange={(e) => setForm({ ...form, target_rate: e.target.value })} placeholder="85.0" />
        </div>
        <div>
          <div style={labelStyle}>3-Star Cutpoint %</div>
          <input style={inputStyle} type="number" step="0.1" min="0" max="100" value={form.star_3_cutpoint} onChange={(e) => setForm({ ...form, star_3_cutpoint: e.target.value })} placeholder="74.0" />
        </div>
        <div>
          <div style={labelStyle}>4-Star Cutpoint %</div>
          <input style={inputStyle} type="number" step="0.1" min="0" max="100" value={form.star_4_cutpoint} onChange={(e) => setForm({ ...form, star_4_cutpoint: e.target.value })} placeholder="82.0" />
        </div>
        <div>
          <div style={labelStyle}>5-Star Cutpoint %</div>
          <input style={inputStyle} type="number" step="0.1" min="0" max="100" value={form.star_5_cutpoint} onChange={(e) => setForm({ ...form, star_5_cutpoint: e.target.value })} placeholder="90.0" />
        </div>
      </div>

      <div className="mb-3">
        <div style={labelStyle}>Description</div>
        <input
          style={inputStyle}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Optional description..."
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="text-[13px] px-4 py-2 rounded-md text-white transition-colors"
          style={{ background: tokens.accent, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Creating..." : "Create Measure"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] px-4 py-2 rounded-md border transition-colors hover:bg-stone-50"
          style={{ borderColor: tokens.border, color: tokens.textSecondary }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Inline Edit Row
// ---------------------------------------------------------------------------

function MeasureRow({ measure, onRefresh }: { measure: Measure; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [targetRate, setTargetRate] = useState(measure.target_rate?.toString() ?? "");
  const [s3, setS3] = useState(measure.star_3_cutpoint?.toString() ?? "");
  const [s4, setS4] = useState(measure.star_4_cutpoint?.toString() ?? "");
  const [s5, setS5] = useState(measure.star_5_cutpoint?.toString() ?? "");
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await api.patch(`/api/care-gaps/measures/${measure.id}`, {
        is_active: !measure.is_active,
      });
      onRefresh();
    } catch (err) {
      console.error("Failed to toggle measure:", err);
    } finally {
      setToggling(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.patch(`/api/care-gaps/measures/${measure.id}`, {
        target_rate: targetRate ? parseFloat(targetRate) : null,
        star_3_cutpoint: s3 ? parseFloat(s3) : null,
        star_4_cutpoint: s4 ? parseFloat(s4) : null,
        star_5_cutpoint: s5 ? parseFloat(s5) : null,
      });
      setEditing(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to update measure:", err);
    }
  };

  const inlineInput: React.CSSProperties = {
    border: `1px solid ${tokens.border}`,
    borderRadius: 4,
    padding: "3px 6px",
    fontSize: 12,
    fontFamily: fonts.code,
    color: tokens.text,
    width: 60,
    textAlign: "right" as const,
  };

  return (
    <tr
      style={{
        borderBottom: `1px solid ${tokens.borderSoft}`,
        opacity: measure.is_active ? 1 : 0.5,
      }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold" style={{ fontFamily: fonts.code, color: tokens.text }}>
            {measure.code}
          </span>
          {measure.is_custom && <Tag variant="blue">Custom</Tag>}
          {measure.stars_weight >= 3 && <Tag variant="amber">3x</Tag>}
          {!measure.is_active && <Tag variant="red">Inactive</Tag>}
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: tokens.textMuted }}>
          {measure.name}
        </div>
      </td>

      <td className="px-4 py-3 text-right font-mono text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
        {editing ? (
          <input style={inlineInput} value={targetRate} onChange={(e) => setTargetRate(e.target.value)} />
        ) : (
          measure.target_rate != null ? `${measure.target_rate}%` : "--"
        )}
      </td>

      <td className="px-4 py-3 text-right font-mono text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
        {editing ? (
          <input style={inlineInput} value={s3} onChange={(e) => setS3(e.target.value)} />
        ) : (
          measure.star_3_cutpoint != null ? `${measure.star_3_cutpoint}%` : "--"
        )}
      </td>

      <td className="px-4 py-3 text-right font-mono text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
        {editing ? (
          <input style={inlineInput} value={s4} onChange={(e) => setS4(e.target.value)} />
        ) : (
          measure.star_4_cutpoint != null ? `${measure.star_4_cutpoint}%` : "--"
        )}
      </td>

      <td className="px-4 py-3 text-right font-mono text-[12px]" style={{ fontFamily: fonts.code, color: tokens.textSecondary }}>
        {editing ? (
          <input style={inlineInput} value={s5} onChange={(e) => setS5(e.target.value)} />
        ) : (
          measure.star_5_cutpoint != null ? `${measure.star_5_cutpoint}%` : "--"
        )}
      </td>

      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="text-[12px] px-3 py-1 rounded text-white"
                style={{ background: tokens.accent }}
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-[12px] px-3 py-1 rounded border"
                style={{ borderColor: tokens.border, color: tokens.textSecondary }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-[12px] px-3 py-1 rounded border transition-colors hover:bg-stone-50"
                style={{ borderColor: tokens.border, color: tokens.textSecondary }}
              >
                Edit
              </button>
              <button
                onClick={handleToggle}
                disabled={toggling}
                className="text-[12px] px-3 py-1 rounded border transition-colors hover:bg-stone-50"
                style={{
                  borderColor: tokens.border,
                  color: measure.is_active ? tokens.red : tokens.accentText,
                }}
              >
                {measure.is_active ? "Deactivate" : "Activate"}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MeasureConfig({ measures, onRefresh }: MeasureConfigProps) {
  return (
    <div>
      <div className="mb-4">
        <AddMeasureForm onCreated={onRefresh} />
      </div>

      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <table className="w-full text-[13px]" style={{ fontFamily: fonts.body }}>
          <thead>
            <tr style={{ background: tokens.surfaceAlt, borderBottom: `1px solid ${tokens.border}` }}>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
                Measure
              </th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
                Target
              </th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
                3-Star
              </th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
                4-Star
              </th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
                5-Star
              </th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: tokens.textSecondary, fontFamily: fonts.heading }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {measures.map((m) => (
              <MeasureRow key={m.id} measure={m} onRefresh={onRefresh} />
            ))}
            {measures.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[13px]" style={{ color: tokens.textMuted }}>
                  No measures configured. Add a custom measure or seed defaults.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
