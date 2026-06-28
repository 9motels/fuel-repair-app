"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePerson } from "@/lib/personContext";
import PhotoButtons from "@/lib/PhotoButtons";
import { VEHICLE_TYPES } from "@/lib/vehicleAi";
import { uploadFile } from "@/lib/equipmentUtils";

export default function NewVehiclePage() {
  const router = useRouter();
  const { currentPerson } = usePerson();
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({
    location_id: "",
    name: "",
    vehicle_type: "",
    year: "",
    make: "",
    model: "",
    vin: "",
    plate: "",
    odometer: "",
    description: "",
  });
  const [files, setFiles] = useState([]);
  const [uploaded, setUploaded] = useState([]);
  const [aiExtracted, setAiExtracted] = useState(null);
  const [confidence, setConfidence] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => setLocations(Array.isArray(d) ? d : []));
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const photoCount = uploaded.length + files.length;

  async function handleIdentify() {
    setError("");
    setIdentifying(true);
    try {
      let url = uploaded[0];
      if (files.length > 0) {
        const [first, ...rest] = files;
        url = await uploadFile(first);
        setUploaded((u) => [...u, url]);
        setFiles(rest);
      }
      if (!url) {
        setError("Add a photo first, then identify.");
        return;
      }
      const res = await fetch("/api/vehicles/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not identify the vehicle.");
      set({
        name: data.name || form.name,
        vehicle_type: data.vehicle_type || form.vehicle_type,
        year: data.year || form.year,
        make: data.make || form.make,
        model: data.model || form.model,
        vin: data.vin || form.vin,
        plate: data.plate || form.plate,
        description: data.description || form.description,
      });
      setAiExtracted(data);
      setConfidence(data.confidence || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setIdentifying(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.location_id) return setError("Pick a location.");
    if (!form.name.trim() && !form.make.trim() && !form.model.trim() && !form.plate.trim()) {
      return setError("Give the vehicle a name, or a make/model/plate.");
    }
    setSaving(true);
    try {
      const newUrls = [];
      for (const file of files) newUrls.push(await uploadFile(file));
      const photo_urls = [...uploaded, ...newUrls];
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: Number(form.location_id),
          name: form.name.trim(),
          vehicle_type: form.vehicle_type,
          year: form.year.trim(),
          make: form.make.trim(),
          model: form.model.trim(),
          vin: form.vin.trim(),
          plate: form.plate.trim(),
          odometer: parseInt(form.odometer) || 0,
          description: form.description.trim(),
          photo_urls,
          ai_extracted: aiExtracted,
          created_by_id: currentPerson?.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      router.push(`/vehicles/${data.id}?suggest=1`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const input =
    "w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const label = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <div className="max-w-2xl">
      <Link href="/vehicles" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back to Vehicles
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2 mb-6">Add Vehicle</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
          <label className={label}>Location *</label>
          <select
            required
            value={form.location_id}
            onChange={(e) => set({ location_id: e.target.value })}
            className={input}
          >
            <option value="">Select…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <label className={label}>Photos (the vehicle, VIN plate, or registration)</label>
          <PhotoButtons onFiles={(f) => setFiles((prev) => [...prev, ...f])} />
          {photoCount > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {photoCount} photo{photoCount === 1 ? "" : "s"} attached
              {uploaded.length > 0 && ` (${uploaded.length} uploaded)`}
            </p>
          )}
          <button
            type="button"
            onClick={handleIdentify}
            disabled={identifying || photoCount === 0}
            className="w-full border border-blue-600 text-blue-700 dark:text-blue-300 rounded-lg py-2 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50"
          >
            {identifying ? "Identifying…" : "✨ Identify from photo"}
          </button>
          {confidence && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Identified with {confidence} confidence — check the fields below.
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div>
            <label className={label}>Name</label>
            <input
              className={input}
              placeholder="e.g. Red F-250 plow truck"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Type</label>
              <select className={input} value={form.vehicle_type} onChange={(e) => set({ vehicle_type: e.target.value })}>
                <option value="">Select…</option>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Year</label>
              <input className={input} value={form.year} onChange={(e) => set({ year: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Make</label>
              <input className={input} value={form.make} onChange={(e) => set({ make: e.target.value })} />
            </div>
            <div>
              <label className={label}>Model</label>
              <input className={input} value={form.model} onChange={(e) => set({ model: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>VIN</label>
              <input className={input} value={form.vin} onChange={(e) => set({ vin: e.target.value })} />
            </div>
            <div>
              <label className={label}>Plate</label>
              <input className={input} value={form.plate} onChange={(e) => set({ plate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>Odometer (mi)</label>
            <input type="number" min="0" className={input} value={form.odometer} onChange={(e) => set({ odometer: e.target.value })} />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea
              rows={3}
              className={input}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3">{error}</div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Vehicle"}
        </button>
      </form>
    </div>
  );
}
